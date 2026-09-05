import { foldDiacritics } from './naming'
import type { TranscriptSegment } from './transcript'

export interface TargetLanguage {
  code: string
  /** Tên hiển thị bằng chính ngôn ngữ đó - người đọc nhận ra ngay không cần dịch nhãn. */
  label: string
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'th', label: 'ไทย' },
  { code: 'ru', label: 'Русский' },
]

/** Ngôn ngữ ngoài danh sách: người dùng gõ tên, chuyển thành mã an toàn cho tên file. */
export function customLanguageCode(name: string): string {
  const slug = foldDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return slug || 'khac'
}

export function languageLabel(code: string): string {
  return TARGET_LANGUAGES.find((l) => l.code === code)?.label ?? code
}

/**
 * Cắt transcript thành từng mẻ theo tổng số ký tự. Gửi cả buổi gọi một lượt thì mô hình dễ bỏ
 * sót dòng hoặc gộp dòng, mà bản dịch lệch số dòng là hỏng toàn bộ mốc thời gian.
 */
export function chunkSegments(segments: TranscriptSegment[], maxChars = 4000): TranscriptSegment[][] {
  const batches: TranscriptSegment[][] = []
  let current: TranscriptSegment[] = []
  let size = 0
  for (const seg of segments) {
    const len = seg.text.length + 8
    if (current.length > 0 && size + len > maxChars) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(seg)
    size += len
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export function buildTranslatePrompt(segments: TranscriptSegment[], targetLanguage: string): string {
  const lines = segments.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
  return [
    `Dịch các dòng thoại sau sang ${targetLanguage}.`,
    '',
    'Quy tắc bắt buộc:',
    `- Trả về ĐÚNG một mảng JSON gồm ${segments.length} chuỗi, không kèm giải thích hay markdown.`,
    '- Giữ nguyên thứ tự. Dòng thứ n trong mảng là bản dịch của dòng thứ n bên dưới.',
    '- Không gộp, không tách, không bỏ dòng nào - kể cả dòng chỉ có một từ hay câu bỏ lửng.',
    '- Giữ nguyên tên riêng, mã sản phẩm, con số và đơn vị.',
    '- Đây là lời nói tự nhiên trong cuộc gọi, dịch cho tự nhiên chứ không dịch từng chữ.',
    '',
    lines,
  ].join('\n')
}

/**
 * Mô hình có thể bọc JSON trong ```json hoặc thêm lời dẫn. Cắt từ dấu ngoặc vuông đầu tới cuối
 * rồi mới parse; số phần tử phải khớp tuyệt đối, lệch một dòng là mọi mốc thời gian sau đó sai.
 */
export function parseTranslation(raw: string, expectedCount: number): string[] | null {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null
  if (!parsed.every((x) => typeof x === 'string')) return null
  return parsed as string[]
}

/** Ghép bản dịch vào đúng segment gốc, giữ nguyên mốc thời gian và nhãn người nói. */
export function applyTranslation(segments: TranscriptSegment[], texts: string[]): TranscriptSegment[] {
  return segments.map((seg, i) => ({ ...seg, text: texts[i] ?? seg.text }))
}
