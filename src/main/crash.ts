import { app, crashReporter, shell } from 'electron'
import { promises as fs } from 'node:fs'

/**
 * Crash dump được thu thập và giữ NGUYÊN TRÊN MÁY - không có máy chủ nhận báo lỗi, và cũng
 * không nên có: một minidump có thể chứa mảnh bộ nhớ của bản ghi đang mở. Người dùng muốn gửi
 * thì tự mở thư mục và tự quyết định gửi cái gì.
 */
export function initCrashReporter(): void {
  crashReporter.start({
    submitURL: '',
    uploadToServer: false,
    compress: true,
    // Đừng kèm biến môi trường: chúng có thể chứa đường dẫn và tên người dùng.
    extra: { app: 'callrec', version: app.getVersion() },
  })
}

export function crashDumpDir(): string {
  return app.getPath('crashDumps')
}

export async function countCrashDumps(): Promise<number> {
  const entries = await fs.readdir(crashDumpDir(), { recursive: true }).catch(() => [] as string[])
  return entries.filter((name) => String(name).endsWith('.dmp')).length
}

export async function openCrashDumpDir(): Promise<void> {
  await fs.mkdir(crashDumpDir(), { recursive: true }).catch(() => undefined)
  await shell.openPath(crashDumpDir())
}

export async function clearCrashDumps(): Promise<void> {
  await fs.rm(crashDumpDir(), { recursive: true, force: true })
}
