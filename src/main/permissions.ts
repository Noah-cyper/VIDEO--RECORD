import { app, systemPreferences } from 'electron'
import type { PermissionStatus } from '@shared/ipc'

type Status = PermissionStatus['microphone']

function macMedia(kind: 'microphone' | 'screen'): Status {
  try {
    return systemPreferences.getMediaAccessStatus(kind) as Status
  } catch {
    return 'unknown'
  }
}

/**
 * macOS chỉ nạp quyền Screen Recording lúc app khởi động. Người dùng cấp quyền xong mà không
 * restart sẽ bấm ghi và nhận về màn hình đen - phải phát hiện và chủ động đề nghị khởi động lại.
 */
let screenGrantedThisRun = false

function screenNeedsRestart(status: Status): boolean {
  return process.platform === 'darwin' && status === 'granted' && screenGrantedThisRun
}

export function checkPermissions(): PermissionStatus {
  // Windows và Linux không có cửa xin quyền cho micro/ghi màn hình ở tầng hệ điều hành.
  if (process.platform !== 'darwin') {
    return { microphone: 'granted', screen: 'granted', needsRestart: false, managed: false }
  }
  const screen = macMedia('screen')
  return {
    microphone: macMedia('microphone'),
    screen,
    needsRestart: screenNeedsRestart(screen),
    managed: true,
  }
}

export async function requestPermissions(): Promise<PermissionStatus> {
  if (process.platform === 'darwin') {
    const before = macMedia('screen')
    await systemPreferences.askForMediaAccess('microphone').catch(() => false)
    const after = macMedia('screen')
    // Quyền vừa đổi từ chưa cấp sang đã cấp trong phiên này -> bắt buộc restart mới dùng được.
    if (before !== 'granted' && after === 'granted') screenGrantedThisRun = true
  }
  return checkPermissions()
}

export function restartApp(): void {
  app.relaunch()
  app.exit(0)
}
