import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { CaptureAlert, RecordState } from '@shared/types'
import type { MainCommand } from '@shared/ipc'
import { CH } from '@shared/ipc'
import { indicatorRequired } from '@shared/machine'

const preload = () => join(__dirname, '../preload/index.js')
const devUrl = () => process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null
let overlay: BrowserWindow | null = null
let lastState: RecordState = 'idle'
let lastElapsed = 0

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#12131a',
    webPreferences: { preload: preload(), sandbox: false, contextIsolation: true, nodeIntegration: false },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const url = devUrl()
  if (url) mainWindow.loadURL(url)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Overlay là ràng buộc pháp lý FR-08, không phải tiện ích: nó không đóng được bằng tay và
 * chỉ biến mất khi trạng thái rời khỏi nhóm đang ghi.
 */
function createOverlay(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const width = 260
  const height = 76
  const win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 24,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    focusable: false,
    webPreferences: { preload: preload(), sandbox: false, contextIsolation: true, nodeIntegration: false },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  const url = devUrl()
  if (url) win.loadURL(`${url}/overlay.html`)
  else win.loadFile(join(__dirname, '../renderer/overlay.html'))
  return win
}

export function syncIndicator(state: RecordState, elapsedMs: number): void {
  lastState = state
  lastElapsed = elapsedMs
  const needed = indicatorRequired(state)
  if (needed && !overlay) {
    overlay = createOverlay()
    // Cửa sổ chưa load xong sẽ nuốt mất gói đầu tiên, nên phát lại ngay khi sẵn sàng.
    overlay.webContents.once('did-finish-load', () => {
      overlay?.webContents.send(CH.stateChanged, { state: lastState, elapsedMs: lastElapsed })
    })
    overlay.on('closed', () => {
      overlay = null
      // Nếu vẫn đang ghi mà overlay biến mất thì dựng lại ngay - không có trạng thái ghi không chỉ báo.
      if (indicatorRequired(lastState)) syncIndicator(lastState, 0)
    })
  }
  if (!needed && overlay) {
    const win = overlay
    overlay = null
    win.destroy()
    return
  }
  overlay?.webContents.send(CH.stateChanged, { state, elapsedMs })
}

export function broadcast(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
  overlay?.webContents.send(channel, payload)
}

export function sendCommand(cmd: MainCommand): void {
  mainWindow?.webContents.send(CH.commandFromMain, cmd)
}

export function sendAlert(alert: CaptureAlert): void {
  broadcast(CH.alert, alert)
}
