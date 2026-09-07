import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import type { RecordState } from '@shared/types'
import type { ShortcutStatus } from '@shared/ipc'
import { indicatorRequired } from '@shared/machine'
import { translate, type Lang } from '@shared/i18n'
import { SHORTCUTS } from '@shared/shortcuts'
import { sendCommand, showMainWindow } from './windows'

let tray: Tray | null = null
let current: RecordState = 'idle'
let lang: Lang = 'vi'

/** Vẽ icon bằng data URI để không phụ thuộc asset khi đóng gói; đỏ = đang ghi. */
function icon(recording: boolean): Electron.NativeImage {
  const color = recording ? '%23e5484d' : '%238b8d98'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color}"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`)
}

function menu(): Electron.Menu {
  const busy = indicatorRequired(current)
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)
  return Menu.buildFromTemplate([
    { label: t(busy ? 'tray.recording' : 'tray.ready'), enabled: false },
    { type: 'separator' },
    { label: t(busy ? 'tray.stop' : 'tray.start'), click: () => sendCommand(busy ? 'stop' : 'toggle-record') },
    { label: t('tray.pauseResume'), enabled: busy, click: () => sendCommand('pause') },
    { label: t('tray.bookmark'), enabled: busy, click: () => sendCommand('bookmark') },
    { type: 'separator' },
    { label: t('tray.open'), click: () => showMainWindow() },
    { label: t('tray.quit'), click: () => app.quit() },
  ])
}

/** Menu khay dựng một lần rồi giữ nguyên, nên đổi ngôn ngữ phải dựng lại - không tự cập nhật. */
export function setTrayLanguage(next: Lang): void {
  if (lang === next) return
  lang = next
  tray?.setContextMenu(menu())
}

export function createTray(): void {
  tray = new Tray(icon(false))
  tray.setToolTip('CallRec')
  tray.setContextMenu(menu())
  tray.on('click', () => showMainWindow())
}

export function updateTray(state: RecordState): void {
  current = state
  if (!tray) return
  tray.setImage(icon(indicatorRequired(state)))
  tray.setToolTip(indicatorRequired(state) ? 'CallRec — đang ghi' : 'CallRec')
  tray.setContextMenu(menu())
}

let shortcuts: ShortcutStatus[] = []

export function registerShortcuts(): void {
  // Phím tắt có thể đã bị app khác chiếm; không được làm hỏng khởi động, nhưng cũng không được
  // im lặng - người dùng sẽ bấm vào hư không và tưởng app hỏng. Giữ kết quả để Cài đặt hiện ra.
  shortcuts = SHORTCUTS.map(({ accelerator, command }) => ({
    accelerator,
    command,
    registered: globalShortcut.register(accelerator, () => sendCommand(command)),
  }))
}

export function shortcutStatus(): ShortcutStatus[] {
  return shortcuts
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
  shortcuts = []
}
