import { foldDiacritics } from './naming'
import { SPEAKER_LABEL, type Speaker, type TranscriptSegment } from './transcript'

export interface StoredSummary {
  createdAt: string
  source: 'local-extractive' | 'cloud'
  model?: string
  keyPoints: TranscriptSegment[]
  actionItems: ActionItem[]
  /** Chỉ có ở đường qua API; đường cục bộ không sinh văn bản mới. */
  markdown?: string
}

/**
 * Tóm tắt cục bộ theo hướng TRÍCH XUẤT: chọn ra những câu đã có sẵn trong cuộc gọi, không sinh
 * câu mới. Kém mượt hơn tóm tắt bằng LLM nhưng bù lại chạy offline, không tốn tiền, và không bao
 * giờ bịa ra thứ chưa ai nói - với biên bản cuộc gọi thì đó là đánh đổi đúng.
 */

const STOPWORDS = new Set(
  ('la mot va cua cho nhu thi ma nhung neu vi nen tai boi ve den tu voi ra vao len xuong da dang se con co khong ' +
    'anh chi em toi minh ban ho ta chung no day do kia nay ay the nao sao gi ai dau bao nhieu rat qua lam hoi ' +
    'cung van chi moi vua nua het ca deu tung nhe nhi a o u da vang dung roi thoi vay tuc la kieu kieu nhu')
    .split(' '),
)

const words = (text: string) =>
  foldDiacritics(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))

/** Những cụm báo hiệu một cam kết hoặc việc phải làm, không phải câu trò chuyện thông thường. */
const ACTION_CUES = [
  'se gui', 'se lam', 'se kiem tra', 'se bao', 'se goi', 'se chuyen', 'se xac nhan', 'se cap nhat',
  'can gui', 'can lam', 'can kiem tra', 'can xac nhan', 'can chuan bi', 'can bo sung',
  'phai gui', 'phai lam', 'phai xong', 'nho gui', 'nho kiem tra',
  'chot lai', 'thong nhat', 'bao gia', 'gui bao gia', 'gui hop dong', 'len don', 'dat hang',
]

/** Cụm chỉ thời hạn: tách riêng vì một việc có hạn chót cần được làm nổi bật hơn hẳn. */
const DEADLINE_CUES = ['deadline', 'han chot', 'truoc ngay', 'cham nhat', 'trong tuan', 'truoc thu', 'trong ngay']

export interface ActionItem {
  atMs: number
  speaker: Speaker
  text: string
  /** Một câu có thể vừa là cam kết vừa kèm hạn chót, nên giữ hết chứ không lấy cụm đầu tiên. */
  cues: string[]
  hasDeadline: boolean
}

export function extractActionItems(segments: TranscriptSegment[]): ActionItem[] {
  const out: ActionItem[] = []
  for (const seg of segments) {
    const folded = foldDiacritics(seg.text).toLowerCase()
    const actions = ACTION_CUES.filter((c) => folded.includes(c))
    const deadlines = DEADLINE_CUES.filter((c) => folded.includes(c))
    if (actions.length === 0 && deadlines.length === 0) continue
    out.push({
      atMs: seg.startMs,
      speaker: seg.speaker,
      text: seg.text.trim(),
      cues: [...actions, ...deadlines],
      hasDeadline: deadlines.length > 0,
    })
  }
  return out
}

export interface SummaryResult {
  keyPoints: TranscriptSegment[]
  actionItems: ActionItem[]
  /** Nguồn tóm tắt, để giao diện nói rõ với người dùng cái họ đang đọc đến từ đâu. */
  source: 'local-extractive' | 'cloud'
}

export function summarizeLocal(segments: TranscriptSegment[], maxPoints = 8): SummaryResult {
  const usable = segments.filter((s) => words(s.text).length >= 3)
  const freq = new Map<string, number>()
  for (const seg of usable) for (const w of words(seg.text)) freq.set(w, (freq.get(w) ?? 0) + 1)

  const scored = usable.map((seg, i) => {
    const unique = [...new Set(words(seg.text))]
    const density = unique.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0) / Math.sqrt(unique.length)
    // Câu mở đầu và câu chốt cuối thường mang nhiều thông tin nhất trong một cuộc gọi.
    const edge = i < 3 || i >= usable.length - 3 ? 1.25 : 1
    return { seg, score: density * edge }
  })

  const keyPoints = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPoints)
    .map((s) => s.seg)
    .sort((a, b) => a.startMs - b.startMs)

  return { keyPoints, actionItems: extractActionItems(segments), source: 'local-extractive' }
}

/** Prompt cho đường tóm tắt qua API - chỉ dùng khi người dùng chủ động bật (NFR-06). */
export function buildSummaryPrompt(segments: TranscriptSegment[], title: string): string {
  const body = segments
    .map((s) => `[${Math.floor(s.startMs / 1000)}s] ${SPEAKER_LABEL[s.speaker]}: ${s.text}`)
    .join('\n')
  return [
    `Dưới đây là bản gỡ băng một cuộc gọi có tiêu đề "${title}".`,
    'Hãy tóm tắt bằng tiếng Việt theo đúng cấu trúc sau, không thêm phần nào khác:',
    '',
    '## Tóm tắt',
    '(3-5 gạch đầu dòng về nội dung chính)',
    '',
    '## Việc cần làm',
    '(mỗi dòng: ai làm - làm gì - hạn khi nào, nếu có nói tới)',
    '',
    'Chỉ dùng thông tin có trong bản gỡ băng. Không suy đoán, không bổ sung thông tin bên ngoài.',
    'Nếu một mục không có dữ liệu thì ghi "Không có".',
    '',
    '---',
    body,
  ].join('\n')
}
