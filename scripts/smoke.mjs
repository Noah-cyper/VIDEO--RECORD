/**
 * Smoke test chạy dưới Xvfb trong CI: nạp đúng main bundle đã build, chờ cửa sổ load xong,
 * rồi kiểm tra renderer có dựng được cây DOM và không ném lỗi console nào.
 * Không thay được test thủ công trên thiết bị âm thanh thật, nhưng bắt được lỗi khởi động.
 */
import { readFileSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'

const pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version

const errors = []
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30000)

function fail(reason) {
  console.error(`SMOKE FAIL: ${reason}`)
  app.exit(1)
}

const timer = setTimeout(() => fail(`quá ${timeoutMs}ms mà cửa sổ chưa load xong`), timeoutMs)

app.on('web-contents-created', (_e, contents) => {
  contents.on('console-message', (_ev, level, message) => {
    if (level >= 2) errors.push(message)
  })
  contents.on('render-process-gone', (_ev, details) => fail(`renderer chết: ${details.reason}`))
})

await import('../out/main/index.js')

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return fail('không có cửa sổ nào được tạo')
  if (!win.webContents.isLoading()) await new Promise((r) => setTimeout(r, 500))
  else await new Promise((r) => win.webContents.once('did-finish-load', r))

  // Chờ React dựng xong cây DOM và các lời gọi IPC ban đầu trả về.
  await new Promise((r) => setTimeout(r, 2500))

  const probe = await win.webContents.executeJavaScript(`(() => ({
    tabs: [...document.querySelectorAll('.tabs button')].map((b) => b.textContent),
    hasBridge: typeof window.callrec === 'object',
    bodyLen: document.body.innerText.trim().length,
  }))()`)

  // Đổi ngôn ngữ bằng đúng cái select người dùng bấm, không gọi tắt qua IPC: chỉ đường này mới
  // chứng minh i18n nối thật tới giao diện chứ không chỉ có từ điển nằm trong file.
  const original = await win.webContents.executeJavaScript(
    `window.callrec.settings.get().then((s) => s.language)`,
  )

  const pickLanguage = (value) =>
    win.webContents.executeJavaScript(`(async () => {
    const tabs = () => [...document.querySelectorAll('.tabs button')].map((b) => b.textContent)
    ;[...document.querySelectorAll('.tabs button')].pop().click()
    await new Promise((r) => setTimeout(r, 300))
    const select = document.getElementById('lang')
    if (!select) return { error: 'không thấy ô chọn ngôn ngữ' }
    // React theo dõi value bằng tracker riêng; gán thẳng .value sẽ bị nuốt mất sự kiện.
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      .call(select, ${JSON.stringify(value)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
    // Chờ tới khi cài đặt thực sự ghi xuống đĩa, đừng chỉ chờ React vẽ lại.
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100))
      const saved = await window.callrec.settings.get()
      if (saved.language === ${JSON.stringify(value)}) return { tabs: tabs() }
    }
    return { error: 'cài đặt ngôn ngữ không được lưu' }
  })()`).catch((err) => ({ error: `lỗi khi đổi ngôn ngữ: ${err.message}` }))

  const vi = await pickLanguage('vi')
  const en = await pickLanguage('en')
  await pickLanguage(original)

  // Hai lỗi người dùng báo ở bản 0.1.0, kiểm ở đây để không quay lại được:
  //  1. đổi thư mục lưu bấm xong không có gì xảy ra và cũng không báo lỗi
  //  2. nút "Cấp quyền" hiện trên Windows nhưng bấm không làm gì
  const settingsChecks = await win.webContents.executeJavaScript(`(async () => {
    const before = (await window.callrec.settings.get()).recordingsDir
    const input = document.getElementById('rec-dir')
    if (!input) return { error: 'không thấy ô thư mục lưu bản ghi' }

    const wanted = '/tmp/callrec-smoke-dir'
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, wanted)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 200))

    const apply = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Áp dụng' || b.textContent.trim() === 'Apply',
    )
    if (!apply) return { error: 'không thấy nút Áp dụng' }
    apply.click()

    let saved = before
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100))
      saved = (await window.callrec.settings.get()).recordingsDir
      if (saved === wanted) break
    }
    const setDir = async (value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
      ;[...document.querySelectorAll('button')]
        .find((b) => ['Áp dụng', 'Apply'].includes(b.textContent.trim()))
        ?.click()
      await new Promise((r) => setTimeout(r, 900))
    }

    // Gốc ổ đĩa phải được nhận và tự đưa vào thư mục con, không còn bị từ chối thẳng.
    await setDir('/')
    const rootNormalized = (await window.callrec.settings.get()).recordingsDir

    // Đường dẫn thật sự vô nghĩa vẫn phải hiện cảnh báo đọc được, không im lặng như bản 0.1.0.
    await setDir('ban-ghi-tuong-doi')
    const errorShown = document.querySelector('.alert.error') !== null

    await window.callrec.settings.set({ recordingsDir: before })

    // Nút "Kiểm tra bản mới" phải luôn trả về một trạng thái đọc được, không được im lặng.
    const ffmpegOk = await window.callrec.ffmpeg.available()
    const beforeCheck = await window.callrec.update.get()
    const afterCheck = await window.callrec.update.check()

    const perms = await window.callrec.permissions.check()
    const grantButton = [...document.querySelectorAll('button')].some(
      (b) => b.textContent.trim() === 'Cấp quyền' || b.textContent.trim() === 'Grant permissions',
    )
    return {
      before, saved, wanted, managed: perms.managed, grantButton, errorShown,
      rootNormalized,
      ffmpegOk,
      updateVersion: beforeCheck.currentVersion,
      updateState: afterCheck.state,
    }
  })()`).catch((err) => ({ error: `lỗi khi kiểm cài đặt: ${err.message}` }))

  clearTimeout(timer)
  const problems = []
  if (!probe.hasBridge) problems.push('contextBridge không lộ ra window.callrec')
  if (probe.tabs.length !== 3) problems.push(`mong đợi 3 tab, nhận được ${JSON.stringify(probe.tabs)}`)
  if (probe.bodyLen < 20) problems.push('renderer không dựng được nội dung')
  for (const [want, got] of [['Ghi,Thư viện,Cài đặt', vi], ['Record,Library,Settings', en]]) {
    if (got.error) problems.push(got.error)
    else if (got.tabs.join(',') !== want) problems.push(`mong đợi "${want}", nhận "${got.tabs.join(',')}"`)
  }
  if (settingsChecks.error) problems.push(settingsChecks.error)
  else {
    if (settingsChecks.saved !== settingsChecks.wanted) {
      problems.push(`đổi thư mục lưu không ăn: vẫn là ${settingsChecks.saved}`)
    }
    // Nút cấp quyền chỉ được phép xuất hiện ở nơi hệ điều hành thật sự có cửa xin quyền.
    if (!settingsChecks.managed && settingsChecks.grantButton) {
      problems.push('nút "Cấp quyền" hiện ở hệ điều hành không có cửa xin quyền')
    }
    if (!settingsChecks.errorShown) problems.push('đường dẫn hỏng nhưng không hiện cảnh báo nào')
    if (settingsChecks.rootNormalized !== '/CallRec') {
      problems.push(`chọn gốc ổ đĩa phải thành /CallRec, nhận được ${settingsChecks.rootNormalized}`)
    }
    if (settingsChecks.updateVersion !== pkgVersion) {
      problems.push(`phiên bản hiện tại sai: hiện ${settingsChecks.updateVersion}, đúng ra là ${pkgVersion}`)
    }
    // Chạy từ mã nguồn thì phải nói rõ là không có kênh cập nhật, chứ không phải đứng im.
    // Môi trường dựng có ffmpeg-static nên preflight phải trả về true; false nghĩa là đường dẫn hỏng.
    if (settingsChecks.ffmpegOk !== true) problems.push('preflight FFmpeg báo không có')
    if (settingsChecks.updateState !== 'unsupported') {
      problems.push(`kiểm tra cập nhật trả về trạng thái lạ: ${settingsChecks.updateState}`)
    }
  }
  if (errors.length > 0) problems.push(`lỗi console: ${errors.join(' | ')}`)

  if (problems.length > 0) return fail(problems.join('; '))
  console.log(
    `SMOKE OK — vi: ${vi.tabs?.join(', ')} | en: ${en.tabs?.join(', ')} | ` +
      `thư mục lưu đổi được: ${settingsChecks.saved === settingsChecks.wanted} | ` +
      `nút cấp quyền ẩn đúng: ${!settingsChecks.grantButton} | ` +
      `gốc ổ đĩa → ${settingsChecks.rootNormalized} | ` +
      `lỗi hiện ra được: ${settingsChecks.errorShown} | ` +
      `ffmpeg: ${settingsChecks.ffmpegOk} | ` +
      `cập nhật: v${settingsChecks.updateVersion} → ${settingsChecks.updateState}`,
  )
  app.exit(0)
})
