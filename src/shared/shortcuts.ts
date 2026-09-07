import type { MainCommand } from './ipc'

/**
 * Phím tắt toàn cục. Danh sách nằm ở shared vì cả main (đăng ký) lẫn giao diện (hiện ra cho
 * người dùng đọc) đều cần đúng một bảng này - hai bảng rời nhau là hai bảng sẽ lệch nhau.
 */
export const SHORTCUTS: { accelerator: string; command: MainCommand }[] = [
  { accelerator: 'CommandOrControl+Shift+R', command: 'toggle-record' },
  { accelerator: 'CommandOrControl+Shift+P', command: 'pause' },
  { accelerator: 'CommandOrControl+Shift+M', command: 'bookmark' },
]

/**
 * Lệnh ô chỉ báo được phép phát. Cố tình KHÔNG có gì làm ẩn hay tắt chỉ báo (FR-08), và cũng
 * không có toggle-record: ô chỉ báo chỉ tồn tại khi đang ghi, nên "bật ghi" ở đó là vô nghĩa.
 */
export const OVERLAY_COMMANDS = ['pause', 'stop', 'bookmark'] as const

export type OverlayCommand = (typeof OVERLAY_COMMANDS)[number]

export function isOverlayCommand(value: unknown): value is OverlayCommand {
  return typeof value === 'string' && (OVERLAY_COMMANDS as readonly string[]).includes(value)
}

/** Người dùng đọc "Ctrl+Shift+R", không đọc "CommandOrControl+Shift+R". */
export function prettyAccelerator(accelerator: string, platform: string = process.platform): string {
  const mod = platform === 'darwin' ? '⌘' : 'Ctrl'
  return accelerator
    .replace('CommandOrControl', mod)
    .replace('Shift', platform === 'darwin' ? '⇧' : 'Shift')
    .replace(/\+/g, platform === 'darwin' ? '' : '+')
}
