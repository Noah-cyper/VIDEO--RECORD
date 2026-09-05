import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { CH } from '@shared/ipc'
import { broadcast, isBusyRecording } from './windows'

let downloaded = false

/**
 * Không bao giờ khởi động lại app giữa một cuộc gọi đang ghi. Bản cập nhật tải xong thì nằm chờ
 * tới lúc thoát; người dùng chủ động bấm cài thì vẫn bị chặn nếu đang ghi.
 */
export function initUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => broadcast(CH.updateStatus, { state: 'available', version: info.version }))
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true
    broadcast(CH.updateStatus, { state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => broadcast(CH.updateStatus, { state: 'error', message: err.message }))

  autoUpdater.checkForUpdates().catch(() => undefined)
}

export function canInstallUpdate(): boolean {
  return downloaded && !isBusyRecording()
}

export function installUpdate(): { ok: boolean; reason?: string } {
  if (!downloaded) return { ok: false, reason: 'Chưa tải xong bản cập nhật.' }
  if (isBusyRecording()) return { ok: false, reason: 'Đang ghi — dừng bản ghi trước rồi mới cập nhật được.' }
  autoUpdater.quitAndInstall()
  return { ok: true }
}
