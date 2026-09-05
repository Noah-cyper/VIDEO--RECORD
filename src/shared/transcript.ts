import { foldDiacritics } from './naming'

/**
 * Nhãn người nói suy trực tiếp từ track, không đoán: 'me' là track mic, 'them' là track loopback.
 * Đây là phần thưởng cho quyết định không trộn hai luồng ở Phase 1 - không cần diarization,
 * và nhãn đúng 100% chứ không phải đúng theo xác suất.
 */
export type Speaker = 'me' | 'them'

export interface TranscriptSegment {
  startMs: number
  endMs: number
  speaker: Speaker
  text: string
  /** Hai bên nói chồng lên nhau; giữ nguyên cả hai câu, đừng ghép thành một dòng. */
  overlap?: boolean
}

export interface Transcript {
  language: string
  model: string
  createdAt: string
  segments: TranscriptSegment[]
}

export const SPEAKER_LABEL: Record<Speaker, string> = { me: 'Tôi', them: 'Đối phương' }

interface WhisperJson {
  result?: { language?: string }
  transcription?: { offsets?: { from?: number; to?: number }; text?: string }[]
}

/** whisper.cpp `-oj` trả về offsets theo mili giây và text có khoảng trắng thừa ở đầu. */
export function parseWhisperJson(raw: string, speaker: Speaker): TranscriptSegment[] {
  let data: WhisperJson
  try {
    data = JSON.parse(raw) as WhisperJson
  } catch {
    return []
  }
  const out: TranscriptSegment[] = []
  for (const item of data.transcription ?? []) {
    const text = (item.text ?? '').trim()
    if (!text) continue
    const startMs = item.offsets?.from ?? 0
    const endMs = Math.max(startMs, item.offsets?.to ?? startMs)
    out.push({ startMs, endMs, speaker, text })
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

export function detectLanguage(raw: string): string {
  try {
    return (JSON.parse(raw) as WhisperJson).result?.language ?? 'vi'
  } catch {
    return 'vi'
  }
}

const overlaps = (a: TranscriptSegment, b: TranscriptSegment) => a.startMs < b.endMs && b.startMs < a.endMs

/**
 * Trộn hai transcript theo mốc thời gian. Khi hai bên nói đè lên nhau thì đánh dấu overlap để
 * giao diện hiển thị khác đi, chứ không cố gộp - gộp là bịa ra một câu chưa ai từng nói.
 */
export function mergeTranscripts(mine: TranscriptSegment[], theirs: TranscriptSegment[]): TranscriptSegment[] {
  const merged = [...mine, ...theirs].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  for (const seg of merged) {
    seg.overlap = merged.some((other) => other !== seg && other.speaker !== seg.speaker && overlaps(seg, other))
  }
  return merged
}

function stamp(ms: number, msSep: string): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}${msSep}${String(Math.max(0, ms) % 1000).padStart(3, '0')}`
}

export function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) =>
      [
        String(i + 1),
        `${stamp(seg.startMs, ',')} --> ${stamp(seg.endMs, ',')}`,
        `${SPEAKER_LABEL[seg.speaker]}: ${seg.text}`,
        '',
      ].join('\n'),
    )
    .join('\n')
}

const shortStamp = (ms: number) => stamp(ms, '.').slice(0, 8)

export function toTxt(segments: TranscriptSegment[]): string {
  return segments.map((seg) => `[${shortStamp(seg.startMs)}] ${SPEAKER_LABEL[seg.speaker]}: ${seg.text}`).join('\n')
}

export function toMarkdown(segments: TranscriptSegment[], title: string): string {
  const lines = [`# ${title}`, '']
  for (const seg of segments) {
    const mark = seg.overlap ? ' _(nói chồng)_' : ''
    lines.push(`**${SPEAKER_LABEL[seg.speaker]}** · \`${shortStamp(seg.startMs)}\`${mark}`, '', seg.text, '')
  }
  return lines.join('\n')
}

export function totalDurationMs(segments: TranscriptSegment[]): number {
  return segments.reduce((max, seg) => Math.max(max, seg.endMs), 0)
}

export interface SearchHit {
  segment: TranscriptSegment
  index: number
}

/** Bỏ dấu cả hai vế: gõ "bao gia" vẫn tìm ra "báo giá". */
export function searchSegments(segments: TranscriptSegment[], query: string): SearchHit[] {
  const q = foldDiacritics(query).toLowerCase().trim()
  if (!q) return []
  return segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => foldDiacritics(segment.text).toLowerCase().includes(q))
}

/** Thống kê thời lượng nói của từng bên - ai chiếm sóng bao nhiêu phần trăm cuộc gọi. */
export function speakingTime(segments: TranscriptSegment[]): Record<Speaker, number> {
  const out: Record<Speaker, number> = { me: 0, them: 0 }
  for (const seg of segments) out[seg.speaker] += Math.max(0, seg.endMs - seg.startMs)
  return out
}
