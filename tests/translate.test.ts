import { describe, expect, it } from 'vitest'
import {
  applyTranslation, buildTranslatePrompt, chunkSegments, customLanguageCode,
  languageLabel, parseTranslation, TARGET_LANGUAGES,
} from '@shared/translate'
import type { TranscriptSegment } from '@shared/transcript'

const seg = (i: number, text: string): TranscriptSegment => ({
  startMs: i * 1000, endMs: i * 1000 + 900, speaker: i % 2 ? 'them' : 'me', text,
})

describe('chunkSegments', () => {
  it('gom vào một mẻ khi còn nhỏ', () => {
    expect(chunkSegments([seg(0, 'a'), seg(1, 'b')])).toHaveLength(1)
  })
  it('cắt mẻ khi vượt ngưỡng ký tự', () => {
    const many = Array.from({ length: 20 }, (_, i) => seg(i, 'x'.repeat(100)))
    const batches = chunkSegments(many, 500)
    expect(batches.length).toBeGreaterThan(1)
    // Không được mất hay nhân bản dòng nào khi cắt mẻ.
    expect(batches.flat()).toHaveLength(20)
  })
  it('một dòng dài hơn ngưỡng vẫn phải được giữ, không bị bỏ', () => {
    expect(chunkSegments([seg(0, 'y'.repeat(9000))], 1000).flat()).toHaveLength(1)
  })
  it('transcript rỗng không sinh mẻ rỗng', () => {
    expect(chunkSegments([])).toEqual([])
  })
})

describe('buildTranslatePrompt', () => {
  const prompt = buildTranslatePrompt([seg(0, 'Chào anh'), seg(1, 'Vâng')], '日本語')
  it('đánh số dòng để mô hình giữ đúng thứ tự', () => {
    expect(prompt).toContain('1. Chào anh')
    expect(prompt).toContain('2. Vâng')
  })
  it('nêu rõ số phần tử phải trả về', () => {
    expect(prompt).toContain('ĐÚNG một mảng JSON gồm 2 chuỗi')
  })
  it('cấm gộp hoặc bỏ dòng', () => {
    expect(prompt).toContain('Không gộp, không tách, không bỏ dòng')
  })
})

describe('parseTranslation', () => {
  it('đọc được JSON thuần', () => {
    expect(parseTranslation('["a","b"]', 2)).toEqual(['a', 'b'])
  })
  it('bóc được JSON bị bọc trong markdown và lời dẫn', () => {
    expect(parseTranslation('Đây là bản dịch:\n```json\n["a","b"]\n```', 2)).toEqual(['a', 'b'])
  })
  it('từ chối khi lệch số dòng - lệch một dòng là sai mọi mốc thời gian sau đó', () => {
    expect(parseTranslation('["a"]', 2)).toBeNull()
    expect(parseTranslation('["a","b","c"]', 2)).toBeNull()
  })
  it('từ chối khi phần tử không phải chuỗi', () => {
    expect(parseTranslation('["a", 3]', 2)).toBeNull()
  })
  it('từ chối rác', () => {
    expect(parseTranslation('xin lỗi tôi không dịch được', 2)).toBeNull()
    expect(parseTranslation('', 1)).toBeNull()
  })
})

describe('applyTranslation', () => {
  const segs = [seg(0, 'Chào anh'), seg(1, 'Vâng')]
  it('giữ nguyên mốc thời gian và nhãn người nói', () => {
    const out = applyTranslation(segs, ['Hello', 'Yes'])
    expect(out[0]).toMatchObject({ startMs: 0, speaker: 'me', text: 'Hello' })
    expect(out[1]).toMatchObject({ startMs: 1000, speaker: 'them', text: 'Yes' })
  })
  it('thiếu bản dịch thì giữ nguyên câu gốc thay vì để trống', () => {
    expect(applyTranslation(segs, ['Hello'])[1].text).toBe('Vâng')
  })
})

describe('mã ngôn ngữ', () => {
  it('bỏ dấu và ký tự lạ khi người dùng tự gõ tên ngôn ngữ', () => {
    expect(customLanguageCode('Tiếng Tây Ban Nha')).toBe('tieng-tay-ban-nha')
    expect(customLanguageCode('!!!')).toBe('khac')
  })
  it('nhãn hiển thị bằng chính ngôn ngữ đó', () => {
    expect(languageLabel('ja')).toBe('日本語')
    expect(languageLabel('xx')).toBe('xx')
  })
  it('không có mã trùng trong danh sách', () => {
    const codes = TARGET_LANGUAGES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
