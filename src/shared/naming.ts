import type { QualityPreset } from './types'
import { QUALITY } from './types'

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** Bỏ dấu tiếng Việt rồi rút về ký tự an toàn cho tên thư mục trên mọi hệ điều hành. */
export function slugify(input: string, maxLen = 60): string {
  const s = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '')
  return s || 'ban-ghi'
}

/** Id phiên vừa là khoá vừa là tên thư mục tạm, nên phải sắp xếp được theo thời gian. */
export function makeSessionId(now = new Date(), rand = Math.random()): string {
  const d = now
  const stamp = [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    'T',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('')
  const suffix = Math.floor(rand * 0xffff)
    .toString(16)
    .padStart(4, '0')
  return `${stamp}-${suffix}`
}

/** `2026-09-05_1430_Hop-khach-hang`. Không có tên thì lấy tên cửa sổ đã ghi làm tên tạm. */
export function makeRecordingFolder(startedAt: Date, title?: string, fallbackSource?: string): string {
  const d = startedAt
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`
  return `${date}_${time}_${slugify(title || fallbackSource || 'ban-ghi')}`
}

/** Thêm hậu tố -2, -3... khi thư mục đã tồn tại, thay vì ghi đè bản ghi cũ. */
export function uniqueFolder(base: string, exists: (name: string) => boolean): string {
  if (!exists(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    if (!exists(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`
}

const MB = 1024 * 1024
const MIN_FREE_BYTES = 1024 * MB
const WARN_FREE_BYTES = 5 * 1024 * MB

/** Chặn trước khi ghi còn hơn để người dùng ghi 40 phút rồi mới hỏng (docs/04 mục 4). */
export function assessDisk(freeBytes: number, quality: QualityPreset) {
  const perHour = QUALITY[quality].mbPerHour * MB
  return {
    freeBytes,
    minutesLeft: Math.floor((freeBytes / perHour) * 60),
    canRecord: freeBytes >= MIN_FREE_BYTES,
    warn: freeBytes < WARN_FREE_BYTES,
  }
}
