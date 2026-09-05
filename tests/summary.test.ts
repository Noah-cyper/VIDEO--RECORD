import { describe, expect, it } from 'vitest'
import { buildSummaryPrompt, extractActionItems, summarizeLocal } from '@shared/summary'
import type { TranscriptSegment } from '@shared/transcript'

const seg = (startMs: number, speaker: 'me' | 'them', text: string): TranscriptSegment => ({
  startMs, endMs: startMs + 3000, speaker, text,
})

const call: TranscriptSegment[] = [
  seg(0, 'me', 'Chào anh, em gọi về đơn hàng cảm biến áp suất tuần trước.'),
  seg(4000, 'them', 'Ừ, anh đang cần thêm hai mươi bộ cảm biến áp suất cho nhà máy.'),
  seg(9000, 'me', 'Dạ, em sẽ gửi báo giá cảm biến áp suất trong chiều nay cho anh.'),
  seg(14000, 'them', 'Ok em.'),
  seg(17000, 'them', 'Nhớ kiểm tra tồn kho giúp anh trước ngày mai nhé.'),
  seg(21000, 'me', 'Vâng ạ.'),
]

describe('extractActionItems', () => {
  it('bắt được cam kết gửi báo giá', () => {
    const items = extractActionItems(call)
    expect(items.flatMap((i) => i.cues)).toContain('se gui')
    expect(items.find((i) => i.cues.includes('se gui'))?.speaker).toBe('me')
  })
  it('giữ hết các cụm khớp trong một câu, không chỉ cụm đầu tiên', () => {
    const item = extractActionItems(call).find((i) => i.cues.includes('nho kiem tra'))
    expect(item?.cues).toContain('truoc ngay')
    expect(item?.hasDeadline).toBe(true)
  })
  it('không đánh dấu hạn chót cho câu chỉ có cam kết', () => {
    expect(extractActionItems(call).find((i) => i.cues.includes('se gui'))?.hasDeadline).toBe(false)
  })
  it('bỏ qua câu xã giao', () => {
    expect(extractActionItems([seg(0, 'me', 'Vâng ạ, cảm ơn anh.')])).toEqual([])
  })
  it('giữ nguyên mốc thời gian để tua tới đúng chỗ', () => {
    expect(extractActionItems(call).find((i) => i.cues.includes('se gui'))?.atMs).toBe(9000)
  })
})

describe('summarizeLocal', () => {
  const result = summarizeLocal(call, 3)

  it('nói rõ tóm tắt đến từ đâu', () => {
    expect(result.source).toBe('local-extractive')
  })
  it('chỉ chọn câu có sẵn trong cuộc gọi, không bịa câu mới', () => {
    const texts = call.map((s) => s.text)
    expect(result.keyPoints.every((k) => texts.includes(k.text))).toBe(true)
  })
  it('trả về đúng số điểm yêu cầu và theo thứ tự thời gian', () => {
    expect(result.keyPoints).toHaveLength(3)
    const starts = result.keyPoints.map((k) => k.startMs)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })
  it('loại câu quá ngắn khỏi phần điểm chính', () => {
    expect(result.keyPoints.map((k) => k.text)).not.toContain('Ok em.')
  })
  it('không sập với transcript rỗng', () => {
    expect(summarizeLocal([])).toEqual({ keyPoints: [], actionItems: [], source: 'local-extractive' })
  })
})

describe('buildSummaryPrompt', () => {
  const prompt = buildSummaryPrompt(call, 'Đơn hàng cảm biến')
  it('gắn nhãn người nói và mốc giây cho từng dòng', () => {
    expect(prompt).toContain('[9s] Tôi: Dạ, em sẽ gửi báo giá')
  })
  it('ràng buộc mô hình chỉ dùng dữ liệu trong bản gỡ băng', () => {
    expect(prompt).toContain('Không suy đoán')
  })
})
