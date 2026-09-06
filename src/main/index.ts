import { app, BrowserWindow } from 'electron'
import { createMainWindow, getMainWindow } from './windows'
import { installDisplayMediaHandler } from './sources'
import { registerIpc } from './ipc'
import { createTray, registerShortcuts, unregisterShortcuts, updateTray } from './tray'
import { closeAllWriters, findOrphans, hasOpenWriters } from './storage'
import { installMediaProtocol, registerMediaScheme } from './media-protocol'
import { initCrashReporter } from './crash'
import { initUpdater, stopUpdateTimers } from './updater'

// Ghi cuộc gọi là tác vụ chỉ nên có một phiên bản chạy: hai instance sẽ tranh nhau thiết bị.
// crashReporter phải khởi động trước khi app ready mới bắt được crash lúc khởi động.
initCrashReporter()
registerMediaScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    installMediaProtocol()
    installDisplayMediaHandler()
    registerIpc()
    createMainWindow()
    createTray()
    registerShortcuts()
    updateTray('idle')
    initUpdater()

    const orphans = await findOrphans()
    if (orphans.length > 0) {
      getMainWindow()?.webContents.once('did-finish-load', () => {
        getMainWindow()?.webContents.send('session:orphansFound', orphans)
      })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    // Đang ghi thì cửa sổ chỉ bị ẩn chứ không đóng, nên nhánh này không chạy; giữ nguyên hành vi
    // quen thuộc của Windows cho trường hợp còn lại.
    if (process.platform !== 'darwin') app.quit()
  })

  let flushed = false
  app.on('before-quit', (event) => {
    unregisterShortcuts()
    stopUpdateTimers()
    // Handler đồng bộ: Electron không chờ promise, nên phải hoãn thoát rồi tự exit sau khi
    // flush xong - bỏ bước này là mất tối đa 5 giây cuối của bản ghi (NFR-03).
    if (flushed || !hasOpenWriters()) return
    event.preventDefault()
    void closeAllWriters().finally(() => {
      flushed = true
      app.quit()
    })
  })
}
