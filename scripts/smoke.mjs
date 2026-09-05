/**
 * Smoke test chạy dưới Xvfb trong CI: nạp đúng main bundle đã build, chờ cửa sổ load xong,
 * rồi kiểm tra renderer có dựng được cây DOM và không ném lỗi console nào.
 * Không thay được test thủ công trên thiết bị âm thanh thật, nhưng bắt được lỗi khởi động.
 */
import { app, BrowserWindow } from 'electron'

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

  clearTimeout(timer)
  const problems = []
  if (!probe.hasBridge) problems.push('contextBridge không lộ ra window.callrec')
  if (probe.tabs.length !== 3) problems.push(`mong đợi 3 tab, nhận được ${JSON.stringify(probe.tabs)}`)
  if (probe.bodyLen < 20) problems.push('renderer không dựng được nội dung')
  if (errors.length > 0) problems.push(`lỗi console: ${errors.join(' | ')}`)

  if (problems.length > 0) return fail(problems.join('; '))
  console.log(`SMOKE OK — tabs: ${probe.tabs.join(', ')}`)
  app.exit(0)
})
