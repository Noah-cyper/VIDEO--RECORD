import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { CH, type UpdateStatus } from '@shared/ipc'
import { broadcast, isBusyRecording } from './windows'
import { getSettings } from './settings'

/** Kiểm tra định kỳ; 30 phút đủ nhanh để bản vá tới tay trong ngày mà không quấy máy chủ. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000
/** Đếm ngược trước khi tự khởi động lại - đủ để bấm Hoãn nếu đang làm dở việc gì. */
const AUTO_INSTALL_DELAY_SEC = 20

let periodic: NodeJS.Timeout | null = null
let countdown: NodeJS.Timeout | null = null

export const RELEASES_URL = 'https://github.com/Noah-cyper/VIDEO--RECORD/releases'

declare const __APP_VERSION__: string

/** Nhúng lúc build; app.getVersion() chỉ đúng ở bản đã đóng gói. */
const appVersion = (): string =>
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : app.getVersion()

let state: UpdateStatus = {
  state: 'idle',
  currentVersion: '0.0.0',
  canInstall: false,
  busyRecording: false,
}

function publish(patch: Partial<UpdateStatus>): void {
  state = { ...state, ...patch }
  broadcast(CH.updateStatus, snapshot())
}

/** canInstall/busyRecording phải tính lại lúc đọc, vì trạng thái ghi đổi liên tục. */
export function snapshot(): UpdateStatus {
  const busy = isBusyRecording()
  return {
    ...state,
    currentVersion: appVersion(),
    busyRecording: busy,
    canInstall: state.state === 'downloaded' && !busy,
  }
}

/**
 * electron-updater trả về lỗi kỹ thuật thuần. Hai ca hay gặp nhất với dự án này đều có nguyên
 * nhân rất cụ thể mà người dùng tự xử lý được, nên gợi ý luôn thay vì để họ đoán.
 */
function explain(raw: string): string {
  if (/404|Not Found|latest\.yml/i.test(raw)) {
    return `${raw}\n\nThường là do repo còn ở chế độ private, hoặc bản phát hành mới nhất vẫn đang ở trạng thái nháp (draft). Bản nháp thì trình cập nhật không nhìn thấy.`
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|network/i.test(raw)) {
    return `${raw}\n\nKhông kết nối được tới máy chủ phát hành. Kiểm tra mạng rồi thử lại.`
  }
  return raw
}

export function initUpdater(): void {
  publish({ currentVersion: appVersion() })
  if (!app.isPackaged) {
    // Bản chạy từ mã nguồn không có kênh cập nhật; nói thẳng thay vì báo lỗi khó hiểu.
    publish({ state: 'unsupported' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking', message: undefined }))
  autoUpdater.on('update-available', (info) => publish({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => publish({ state: 'not-available', version: undefined }))
  autoUpdater.on('download-progress', (p) =>
    publish({ state: 'downloading', percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond }),
  )
  autoUpdater.on('update-downloaded', (info) => {
    publish({ state: 'downloaded', version: info.version, percent: 100 })
    void maybeAutoInstall()
  })
  autoUpdater.on('error', (err) => publish({ state: 'error', message: explain(err.message) }))

  void checkForUpdates()
  periodic = setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
}

/**
 * Tự cài chỉ khi đang rảnh. Đang ghi thì bỏ qua và thử lại lúc dừng ghi - khởi động lại giữa một
 * cuộc gọi là hỏng đúng thứ ứng dụng này tồn tại để làm.
 */
async function maybeAutoInstall(): Promise<void> {
  if (state.state !== 'downloaded' || countdown) return
  if (isBusyRecording()) return
  const { autoInstallUpdates } = await getSettings()
  if (!autoInstallUpdates) return

  let left = AUTO_INSTALL_DELAY_SEC
  publish({ autoInstallInSec: left })
  countdown = setInterval(() => {
    left -= 1
    if (left > 0) return publish({ autoInstallInSec: left })
    cancelAutoInstall()
    installUpdate()
  }, 1000)
}

export function cancelAutoInstall(): void {
  if (countdown) clearInterval(countdown)
  countdown = null
  publish({ autoInstallInSec: undefined })
}

/** Gọi mỗi khi trạng thái ghi đổi: vừa dừng ghi mà có bản chờ sẵn thì cài luôn. */
export function onRecordingStateChanged(): void {
  if (!isBusyRecording()) void maybeAutoInstall()
}

export function stopUpdateTimers(): void {
  if (periodic) clearInterval(periodic)
  periodic = null
  cancelAutoInstall()
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    publish({ state: 'unsupported' })
    return snapshot()
  }
  try {
    publish({ state: 'checking', message: undefined })
    await autoUpdater.checkForUpdates()
  } catch (err) {
    publish({ state: 'error', message: explain(err instanceof Error ? err.message : String(err)) })
  }
  return snapshot()
}

export function installUpdate(): { ok: boolean; reason?: string } {
  if (state.state !== 'downloaded') return { ok: false, reason: 'Chưa tải xong bản cập nhật.' }
  if (isBusyRecording()) return { ok: false, reason: 'Đang ghi — dừng bản ghi trước rồi mới cập nhật được.' }
  cancelAutoInstall()
  autoUpdater.quitAndInstall()
  return { ok: true }
}

export async function openReleasesPage(): Promise<void> {
  await shell.openExternal(RELEASES_URL)
}
