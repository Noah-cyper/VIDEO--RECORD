import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { CH, type UpdateStatus } from '@shared/ipc'
import { broadcast, isBusyRecording } from './windows'

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
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'downloaded', version: info.version, percent: 100 }))
  autoUpdater.on('error', (err) => publish({ state: 'error', message: explain(err.message) }))

  void checkForUpdates()
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
  autoUpdater.quitAndInstall()
  return { ok: true }
}

export async function openReleasesPage(): Promise<void> {
  await shell.openExternal(RELEASES_URL)
}
