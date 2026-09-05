import type { Bookmark } from './types'
import type { TranscriptSegment } from './transcript'

export interface TrimRange {
  startMs: number
  endMs: number
}

const sec = (ms: number) => (Math.max(0, ms) / 1000).toFixed(3)

/**
 * Cắt bằng stream copy: gần như tức thì kể cả với bản ghi một giờ, nhưng điểm cắt bám vào keyframe
 * gần nhất nên có thể lệch vài giây. Với việc cắt bỏ khoảng lặng đầu/cuối thì đánh đổi này đúng;
 * encode lại một giờ video chỉ để chính xác tới từng khung hình là không tương xứng.
 *
 * `-ss` đặt trước `-i` để seek nhanh, và dùng `-t` (thời lượng) chứ không phải `-to`: khi -ss nằm
 * trước input, ý nghĩa của -to phụ thuộc phiên bản ffmpeg, còn -t thì luôn là thời lượng đầu ra.
 */
export function buildTrimArgs(input: string, output: string, range: TrimRange): string[] {
  const duration = range.endMs - range.startMs
  if (duration <= 0) throw new Error('Khoảng cắt không hợp lệ')
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', sec(range.startMs),
    '-i', input,
    '-t', sec(duration),
    // -map 0 giữ NGUYÊN mọi luồng: mất nó là mất track audio thứ hai, tức mất cả lý do tồn tại.
    '-map', '0',
    '-c', 'copy',
    '-movflags', '+faststart',
    output,
  ]
}

export function isValidRange(range: TrimRange, durationMs: number): boolean {
  return (
    Number.isFinite(range.startMs) &&
    Number.isFinite(range.endMs) &&
    range.startMs >= 0 &&
    range.endMs > range.startMs &&
    range.endMs <= durationMs + 1000
  )
}

/** Mốc nằm ngoài khoảng cắt thì biến mất; mốc còn lại dời về gốc thời gian mới. */
export function shiftBookmarks(bookmarks: Bookmark[], range: TrimRange): Bookmark[] {
  return bookmarks
    .filter((b) => b.atMs >= range.startMs && b.atMs <= range.endMs)
    .map((b) => ({ ...b, atMs: b.atMs - range.startMs }))
}

/** Giữ câu nào chồng lấn khoảng cắt, và kẹp hai đầu về đúng biên mới. */
export function shiftSegments(segments: TranscriptSegment[], range: TrimRange): TranscriptSegment[] {
  return segments
    .filter((s) => s.endMs > range.startMs && s.startMs < range.endMs)
    .map((s) => ({
      ...s,
      startMs: Math.max(0, s.startMs - range.startMs),
      endMs: Math.min(range.endMs - range.startMs, s.endMs - range.startMs),
    }))
}
