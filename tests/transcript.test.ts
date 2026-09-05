import { describe, expect, it } from 'vitest'
import {
  detectLanguage, mergeTranscripts, parseWhisperJson, searchSegments, speakingTime,
  toMarkdown, toSrt, toTxt, totalDurationMs, type TranscriptSegment,
} from '@shared/transcript'

const whisperOut = JSON.stringify({
  result: { language: 'vi' },
  transcription: [
    { offsets: { from: 0, to: 4200 }, text: ' Chào anh, em gọi về đơn hàng tuần trước.' },
    { offsets: { from: 10100, to: 14000 }, text: ' Dạ em ghi nhận, để em kiểm tra tồn kho.' },
    { offsets: { from: 20000, to: 21000 }, text: '   ' },
  ],
})

describe('parseWhisperJson', () => {
  it('đọc offsets mili giây và cắt khoảng trắng thừa', () => {
    const segs = parseWhisperJson(whisperOut, 'me')
    expect(segs).toHaveLength(2)
    expect(segs[0]).toEqual({ startMs: 0, endMs: 4200, speaker: 'me', text: 'Chào anh, em gọi về đơn hàng tuần trước.' })
  })
  it('bỏ segment rỗng thay vì tạo dòng trống trong biên bản', () => {
    expect(parseWhisperJson(whisperOut, 'me').every((s) => s.text.length > 0)).toBe(true)
  })
  it('không ném lỗi khi whisper trả về rác', () => {
    expect(parseWhisperJson('không phải json', 'me')).toEqual([])
    expect(parseWhisperJson('{}', 'them')).toEqual([])
  })
  it('không để endMs nhỏ hơn startMs', () => {
    const segs = parseWhisperJson(JSON.stringify({ transcription: [{ offsets: { from: 500 }, text: 'a' }] }), 'me')
    expect(segs[0].endMs).toBe(500)
  })
  it('lấy được ngôn ngữ, có mặc định khi thiếu', () => {
    expect(detectLanguage(whisperOut)).toBe('vi')
    expect(detectLanguage('hỏng')).toBe('vi')
  })
})

describe('mergeTranscripts', () => {
  const mine: TranscriptSegment[] = [
    { startMs: 0, endMs: 4000, speaker: 'me', text: 'Chào anh.' },
    { startMs: 10000, endMs: 12000, speaker: 'me', text: 'Em kiểm tra tồn kho.' },
  ]
  const theirs: TranscriptSegment[] = [
    { startMs: 4500, endMs: 9800, speaker: 'them', text: 'Anh cần thêm 20 bộ.' },
    { startMs: 11000, endMs: 13000, speaker: 'them', text: 'Bao giờ có hàng?' },
  ]

  it('sắp xếp theo mốc thời gian', () => {
    expect(mergeTranscripts(mine, theirs).map((s) => s.startMs)).toEqual([0, 4500, 10000, 11000])
  })

  it('đánh dấu đúng chỗ hai bên nói chồng lên nhau', () => {
    const merged = mergeTranscripts(mine, theirs)
    expect(merged.filter((s) => s.overlap).map((s) => s.startMs)).toEqual([10000, 11000])
  })

  it('không coi hai câu liền nhau của cùng một người là nói chồng', () => {
    const same: TranscriptSegment[] = [
      { startMs: 0, endMs: 5000, speaker: 'me', text: 'a' },
      { startMs: 1000, endMs: 6000, speaker: 'me', text: 'b' },
    ]
    expect(mergeTranscripts(same, []).some((s) => s.overlap)).toBe(false)
  })

  it('xử lý được khi một bên không có tiếng', () => {
    expect(mergeTranscripts(mine, [])).toHaveLength(2)
    expect(mergeTranscripts([], [])).toEqual([])
  })
})

describe('xuất định dạng', () => {
  const segs: TranscriptSegment[] = [
    { startMs: 1500, endMs: 4200, speaker: 'me', text: 'Chào anh.' },
    { startMs: 4500, endMs: 9800, speaker: 'them', text: 'Anh cần thêm 20 bộ.', overlap: true },
  ]

  it('SRT dùng dấu phẩy cho phần mili giây', () => {
    expect(toSrt(segs)).toContain('00:00:01,500 --> 00:00:04,200')
    expect(toSrt(segs).startsWith('1\n')).toBe(true)
    expect(toSrt(segs)).toContain('Đối phương: Anh cần thêm 20 bộ.')
  })
  it('TXT có mốc giờ và nhãn người nói', () => {
    expect(toTxt(segs).split('\n')[0]).toBe('[00:00:01] Tôi: Chào anh.')
  })
  it('Markdown ghi rõ chỗ nói chồng', () => {
    const md = toMarkdown(segs, 'Họp khách hàng')
    expect(md.startsWith('# Họp khách hàng')).toBe(true)
    expect(md).toContain('_(nói chồng)_')
  })
})

describe('searchSegments', () => {
  const segs: TranscriptSegment[] = [
    { startMs: 0, endMs: 1, speaker: 'me', text: 'Em gửi báo giá chiều nay.' },
    { startMs: 2, endMs: 3, speaker: 'them', text: 'Cảm ơn em.' },
  ]
  it('tìm được khi gõ không dấu', () => {
    expect(searchSegments(segs, 'bao gia')).toHaveLength(1)
    expect(searchSegments(segs, 'BÁO GIÁ')[0].index).toBe(0)
  })
  it('trả về rỗng với truy vấn trống', () => {
    expect(searchSegments(segs, '   ')).toEqual([])
  })
})

describe('thống kê', () => {
  const segs: TranscriptSegment[] = [
    { startMs: 0, endMs: 4000, speaker: 'me', text: 'a' },
    { startMs: 5000, endMs: 11000, speaker: 'them', text: 'b' },
  ]
  it('cộng thời lượng nói theo từng bên', () => {
    expect(speakingTime(segs)).toEqual({ me: 4000, them: 6000 })
  })
  it('lấy được tổng thời lượng từ segment cuối', () => {
    expect(totalDurationMs(segs)).toBe(11000)
    expect(totalDurationMs([])).toBe(0)
  })
})
