import type { Speaker } from './transcript'

/** Whisper chỉ nhận 16 kHz mono, nên cả đường phụ đề trực tiếp chạy ở tần số này từ đầu. */
export const LIVE_SAMPLE_RATE = 16000

/** Dài quá thì phụ đề tới muộn, ngắn quá thì whisper mất ngữ cảnh và đoán sai từ. */
export const SEGMENT_MAX_MS = 8000
export const SEGMENT_MIN_VOICED_MS = 400
export const SILENCE_HANG_MS = 700
export const VOICE_RMS_GATE = 0.004

/** Nghẽn hàng đợi nghĩa là phụ đề tụt lại vĩnh viễn; thà bỏ đoạn cũ còn hơn hiện chậm mãi. */
export const MAX_PENDING_SEGMENTS = 3
export const MAX_CAPTIONS = 200

/** Chặn trên cho gói PCM nhận từ renderer: độ dài đoạn tối đa cộng phần pre-roll, 16 bit. */
export const MAX_SEGMENT_BYTES = Math.ceil((LIVE_SAMPLE_RATE * 2 * (SEGMENT_MAX_MS + 1000)) / 1000)

/** '' = không dịch, chỉ hiện nguyên văn. */
export const LIVE_TARGET_OFF = ''
/** whisper.cpp dịch được đúng một hướng: sang tiếng Anh. Ngôn ngữ khác bắt buộc qua API. */
export const LIVE_TARGET_LOCAL = 'en'

export type LiveMode = 'off' | 'local' | 'cloud'

export function liveTargetMode(target: string): LiveMode {
  if (!target) return 'off'
  return target === LIVE_TARGET_LOCAL ? 'local' : 'cloud'
}

export interface LiveCaption {
  id: number
  speaker: Speaker
  atMs: number
  /** Nguyên văn whisper nghe được; ở chế độ local đây đã là bản tiếng Anh. */
  text: string
  /** Bản dịch qua API, về sau bản gốc vài giây nên tới bằng một gói cập nhật cùng id. */
  translated?: string
  /** Đang chờ bản dịch; UI hiện nguyên văn kèm dấu hiệu chưa xong. */
  pending?: boolean
}

/** Cùng id thì thay tại chỗ (bản dịch về sau), khác id thì nối đuôi. Cắt bớt đầu cho khỏi phình. */
export function mergeCaption(list: LiveCaption[], caption: LiveCaption, max = MAX_CAPTIONS): LiveCaption[] {
  const index = list.findIndex((c) => c.id === caption.id)
  const next = index >= 0 ? list.map((c, i) => (i === index ? caption : c)) : [...list, caption]
  return next.length > max ? next.slice(next.length - max) : next
}

export function frameRms(frame: Float32Array): number {
  let sum = 0
  for (const v of frame) sum += v * v
  return Math.sqrt(sum / (frame.length || 1))
}

/**
 * Hạ tần số bằng trung bình cộng theo ô, không phải lấy mẫu cách quãng: bỏ mẫu thẳng tay sẽ gập
 * tần số cao xuống dải tiếng nói và whisper nghe ra chữ khác.
 */
export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate <= LIVE_SAMPLE_RATE) return Float32Array.from(input)
  const ratio = inputRate / LIVE_SAMPLE_RATE
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio)
    const to = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = from; j < to; j++) sum += input[j] as number
    out[i] = to > from ? sum / (to - from) : 0
  }
  return out
}

export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i] as number))
    out[i] = Math.round(v < 0 ? v * 0x8000 : v * 0x7fff)
  }
  return out
}

/** WAV RIFF 16 bit mono. Tự dựng header vì chỉ có 44 byte, không đáng thêm một dependency. */
export function encodeWav(pcm: Int16Array, sampleRate = LIVE_SAMPLE_RATE): Uint8Array {
  const bytes = pcm.length * 2
  const buffer = new ArrayBuffer(44 + bytes)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, bytes, true)
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i] as number, true)
  return new Uint8Array(buffer)
}

export interface SegmenterState {
  open: boolean
  voicedMs: number
  silentMs: number
  totalMs: number
}

export const initialSegmenter = (): SegmenterState => ({ open: false, voicedMs: 0, silentMs: 0, totalMs: 0 })

export type SegmenterAction =
  /** Chưa có tiếng: khung này chỉ giữ làm pre-roll. */
  | 'idle'
  | 'collect'
  /** Đủ tiếng và đã dứt câu: gửi đi gỡ băng. */
  | 'emit'
  /** Có động tĩnh nhưng không đủ dài để là lời nói: bỏ, đừng tốn một lượt whisper. */
  | 'discard'

/**
 * Cắt đoạn theo khoảng lặng chứ không theo đồng hồ cố định: cắt giữa câu thì whisper mất vế sau
 * và đoán bừa, còn chờ đủ 8 giây mới cắt thì phụ đề luôn trễ 8 giây kể cả khi người ta nói ngắn.
 */
export function feedSegmenter(
  state: SegmenterState,
  rms: number,
  frameMs: number,
): { state: SegmenterState; action: SegmenterAction } {
  const voiced = rms >= VOICE_RMS_GATE
  if (!state.open) {
    if (!voiced) return { state, action: 'idle' }
    return { state: { open: true, voicedMs: frameMs, silentMs: 0, totalMs: frameMs }, action: 'collect' }
  }

  const next: SegmenterState = {
    open: true,
    totalMs: state.totalMs + frameMs,
    voicedMs: state.voicedMs + (voiced ? frameMs : 0),
    silentMs: voiced ? 0 : state.silentMs + frameMs,
  }

  if (next.silentMs >= SILENCE_HANG_MS) {
    return { state: initialSegmenter(), action: next.voicedMs >= SEGMENT_MIN_VOICED_MS ? 'emit' : 'discard' }
  }
  // Người nói liên tục không cho khoảng lặng nào; cắt cưỡng bức để phụ đề không đứng im.
  if (next.totalMs >= SEGMENT_MAX_MS) {
    return { state: initialSegmenter(), action: 'emit' }
  }
  return { state: next, action: 'collect' }
}

/** Bỏ đoạn cũ nhất khi hàng đợi đầy; trả về số đoạn đã bỏ để nơi gọi báo cho người dùng biết. */
export function pushBounded<T>(queue: T[], item: T, max = MAX_PENDING_SEGMENTS): { queue: T[]; dropped: number } {
  const next = [...queue, item]
  const dropped = Math.max(0, next.length - max)
  return { queue: dropped > 0 ? next.slice(dropped) : next, dropped }
}

const NOISE_MARKER = /[[(*<]{1}[^\])*>]{0,60}[\])*>]{1}/g

/**
 * whisper.cpp chèn `[BLANK_AUDIO]`, `(nhạc nền)`, `*cười*` khi không nghe ra lời. Để nguyên thì
 * phụ đề đầy rác đúng lúc người dùng đang cần đọc nhanh.
 */
export function cleanLiveText(raw: string): string {
  const text = raw.replace(NOISE_MARKER, ' ').replace(/\s+/g, ' ').trim()
  return /[\p{L}\p{N}]/u.test(text) ? text : ''
}

export function buildLivePrompt(text: string, targetLanguage: string): string {
  return [
    `Dịch câu thoại sau sang ${targetLanguage}.`,
    'Chỉ trả về đúng bản dịch, không giải thích, không thêm dấu ngoặc kép, không lặp lại câu gốc.',
    'Đây là lời nói trong cuộc gọi, có thể bị cắt giữa chừng - cứ dịch phần nghe được.',
    '',
    text,
  ].join('\n')
}

/** Mô hình hay bọc kết quả trong ngoặc kép dù đã dặn; cắt ở đây rẻ hơn là cãi nhau bằng prompt. */
export function stripQuotes(raw: string): string {
  const text = raw.trim()
  const match = /^["'“”«»](.*)["'“”«»]$/s.exec(text)
  return (match?.[1] ?? text).trim()
}
