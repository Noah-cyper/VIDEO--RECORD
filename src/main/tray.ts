import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import type { RecordState } from '@shared/types'
import { indicatorRequired } from '@shared/machine'
import { getMainWindow, sendCommand } from './windows'

let tray: Tray | null = null
let current: RecordState = 'idle'

/** Vẽ icon bằng data URI để không phụ thuộc asset khi đóng gói; đỏ = đang ghi. */
function icon(recording: boolean): Electron.NativeImage {
  const color = recording ? '%23e5484d' : '%238b8d98'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color}"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`)
}

function menu(): Electron.Menu {
  const busy = indicatorRequired(current)
  return Menu.buildFromTemplate([
    { label: busy ? 'Đang ghi…' : 'Sẵn sàng', enabled: false },
    { type: 'separator' },
    { label: busy ? 'Dừng ghi' : 'Bắt đầu ghi', click: () => sendCommand(busy ? 'stop' : 'toggle-record') },
    { label: 'Tạm dừng / tiếp tục', enabled: busy, click: () => sendCommand('pause') },
    { label: 'Đánh dấu mốc', enabled: busy, click: () => sendCommand('bookmark') },
    { type: 'separator' },
    { label: 'Mở CallRec', click: () => getMainWindow()?.show() },
    { label: 'Thoát', click: () => app.quit() },
  ])
}

export function createTray(): void {
  tray = new Tray(icon(false))
  tray.setToolTip('CallRec')
  tray.setContextMenu(menu())
  tray.on('click', () => getMainWindow()?.show())
}

export function updateTray(state: RecordState): void {
  current = state
  if (!tray) return
  tray.setImage(icon(indicatorRequired(state)))
  tray.setToolTip(indicatorRequired(state) ? 'CallRec — đang ghi' : 'CallRec')
  tray.setContextMenu(menu())
}

const SHORTCUTS: Record<string, Parameters<typeof sendCommand>[0]> = {
  'CommandOrControl+Shift+R': 'toggle-record',
  'CommandOrControl+Shift+P': 'pause',
  'CommandOrControl+Shift+M': 'bookmark',
}

export function registerShortcuts(): void {
  for (const [accel, cmd] of Object.entries(SHORTCUTS)) {
    // Phím tắt có thể đã bị app khác chiếm; bỏ qua thay vì làm hỏng khởi động.
    globalShortcut.register(accel, () => sendCommand(cmd))
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}
