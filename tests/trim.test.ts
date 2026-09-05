import { describe, expect, it } from 'vitest'
import { buildTrimArgs, isValidRange, shiftBookmarks, shiftSegments } from '@shared/trim'
import type { TranscriptSegment } from '@shared/transcript'

describe('buildTrimArgs', () => {
  const args = buildTrimArgs('/rec/a.mp4', '/rec/b.mp4', { startMs: 5000, endMs: 65_000 })
  const joined = args.join(' ')

  it('seek nhanh: -ss đứng trước -i', () => {
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(joined).toContain('-ss 5.000')
  })
  it('dùng -t (thời lượng) chứ không phải -to', () => {
    expect(joined).toContain('-t 60.000')
    expect(args).not.toContain('-to')
  })
  it('giữ nguyên mọi luồng, không encode lại', () => {
    // Thiếu -map 0 thì ffmpeg chỉ lấy một luồng audio và bản ghi mất track thứ hai.
    expect(joined).toContain('-map 0')
    expect(joined).toContain('-c copy')
  })
  it('từ chối khoảng rỗng hoặc ngược', () => {
    expect(() => buildTrimArgs('a', 'b', { startMs: 10, endMs: 10 })).toThrow(/không hợp lệ/)
    expect(() => buildTrimArgs('a', 'b', { startMs: 20, endMs: 10 })).toThrow()
  })
})

describe('isValidRange', () => {
  it('nhận khoảng nằm trong thời lượng', () => {
    expect(isValidRange({ startMs: 0, endMs: 60_000 }, 60_000)).toBe(true)
  })
  it('từ chối khoảng vượt quá thời lượng', () => {
    expect(isValidRange({ startMs: 0, endMs: 70_000 }, 60_000)).toBe(false)
  })
  it('từ chối giá trị âm, đảo ngược, hoặc không phải số', () => {
    expect(isValidRange({ startMs: -1, endMs: 10 }, 60_000)).toBe(false)
    expect(isValidRange({ startMs: 30_000, endMs: 10_000 }, 60_000)).toBe(false)
    expect(isValidRange({ startMs: 0, endMs: NaN }, 60_000)).toBe(false)
  })
})

describe('shiftBookmarks', () => {
  const marks = [
    { atMs: 2_000, label: 'trước' },
    { atMs: 12_000, label: 'trong' },
    { atMs: 90_000, label: 'sau' },
  ]
  it('bỏ mốc ngoài khoảng và dời mốc còn lại về gốc mới', () => {
    expect(shiftBookmarks(marks, { startMs: 10_000, endMs: 60_000 })).toEqual([
      { atMs: 2_000, label: 'trong' },
    ])
  })
})

describe('shiftSegments', () => {
  const segs: TranscriptSegment[] = [
    { startMs: 0, endMs: 4_000, speaker: 'me', text: 'trước' },
    { startMs: 8_000, endMs: 12_000, speaker: 'them', text: 'chồng biên trái' },
    { startMs: 20_000, endMs: 24_000, speaker: 'me', text: 'giữa' },
    { startMs: 95_000, endMs: 99_000, speaker: 'me', text: 'sau' },
  ]
  const range = { startMs: 10_000, endMs: 60_000 }

  it('bỏ câu nằm hẳn ngoài khoảng', () => {
    expect(shiftSegments(segs, range).map((s) => s.text)).toEqual(['chồng biên trái', 'giữa'])
  })
  it('kẹp câu chồng biên về đúng gốc mới, không để thời gian âm', () => {
    expect(shiftSegments(segs, range)[0]).toMatchObject({ startMs: 0, endMs: 2_000 })
  })
  it('dời câu nằm trọn trong khoảng', () => {
    expect(shiftSegments(segs, range)[1]).toMatchObject({ startMs: 10_000, endMs: 14_000 })
  })
})
