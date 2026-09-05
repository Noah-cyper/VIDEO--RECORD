import { resolve, sep } from 'node:path'

/**
 * Chặn thoát thư mục. resolve() đã chuẩn hoá `..`, việc còn lại là so tiền tố có kèm dấu phân cách
 * để `/data/recordings-cu` không bị coi là nằm trong `/data/recordings`.
 */
export function isInside(parent: string, child: string): boolean {
  const root = resolve(parent)
  const target = resolve(child)
  return target === root || target.startsWith(root + sep)
}

export function assertInside(parent: string, child: string, what: string): string {
  if (!isInside(parent, child)) throw new Error(`Đường dẫn ${what} nằm ngoài thư mục cho phép`)
  return resolve(child)
}

/** Thư mục lưu bản ghi do người dùng chọn, nhưng renderer vẫn gọi settings.set được với chuỗi bất kỳ. */
export function isUsableRecordingsDir(dir: unknown): dir is string {
  if (typeof dir !== 'string' || dir.trim() === '') return false
  const abs = resolve(dir)
  if (abs !== dir && resolve(abs) !== abs) return false
  // Gốc ổ đĩa: một lệnh xoá bản ghi ở đây sẽ quét sạch cả phân vùng.
  return abs !== resolve(abs, '..')
}
