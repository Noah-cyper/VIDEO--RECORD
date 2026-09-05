import nodePath, { type PlatformPath } from 'node:path'

/** Tên thư mục app tự tạo khi người dùng trỏ thẳng vào gốc ổ đĩa. */
export const APP_FOLDER = 'CallRec'

/**
 * Các hàm dưới đây nhận `PlatformPath` để test được cả win32 lẫn posix trên cùng một máy.
 * Toàn bộ lớp lỗi này chỉ xuất hiện trên Windows, mà máy dựng thì chạy Linux - không tách ra
 * thế này thì không có cách nào kiểm trước khi giao cho người dùng.
 */
export function isInsideWith(p: PlatformPath, parent: string, child: string): boolean {
  const root = p.resolve(parent)
  const target = p.resolve(child)
  // So tiền tố phải kèm dấu phân cách, để `/data/rec-cu` không bị coi là nằm trong `/data/rec`.
  return target === root || target.startsWith(root + p.sep)
}

export function isRootWith(p: PlatformPath, dir: string): boolean {
  const abs = p.resolve(dir)
  return abs === p.resolve(abs, '..')
}

/**
 * Không đổ bản ghi thẳng vào gốc ổ đĩa. Vừa bẩn, vừa khiến biên kiểm tra containment rộng bằng
 * cả phân vùng - một entry hỏng trong chỉ mục là đủ để lệnh xoá quét sạch ổ. Người dùng chọn
 * `D:\` thì hiểu là `D:\CallRec`, chứ không phải từ chối họ.
 */
export function normalizeRecordingsDirWith(p: PlatformPath, dir: string): string {
  const abs = p.resolve(dir)
  return isRootWith(p, abs) ? p.join(abs, APP_FOLDER) : abs
}

/** Chỉ còn chặn thứ thật sự vô nghĩa; khả năng ghi thật do bước ghi thử quyết định. */
export function isUsableRecordingsDirWith(p: PlatformPath, dir: unknown): dir is string {
  return typeof dir === 'string' && dir.trim() !== '' && p.isAbsolute(dir.trim())
}

export const isInside = (parent: string, child: string) => isInsideWith(nodePath, parent, child)
export const normalizeRecordingsDir = (dir: string) => normalizeRecordingsDirWith(nodePath, dir)
export const isUsableRecordingsDir = (dir: unknown): dir is string =>
  isUsableRecordingsDirWith(nodePath, dir)

export function assertInside(parent: string, child: string, what: string): string {
  if (!isInside(parent, child)) throw new Error(`Đường dẫn ${what} nằm ngoài thư mục cho phép`)
  return nodePath.resolve(child)
}
