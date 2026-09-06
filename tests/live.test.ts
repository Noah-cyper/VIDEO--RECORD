import { describe, expect, it } from 'vitest'
import {
  buildLivePrompt, cleanLiveText, encodeWav, feedSegmenter, floatToPcm16, frameRms,
  initialSegmenter, liveTargetMode, LIVE_SAMPLE_RATE, MAX_SEGMENT_BYTES, mergeCaption,
  pushBounded, resampleTo16k, SEGMENT_MAX_MS, SILENCE_HANG_MS, stripQuotes, VOICE_RMS_GATE,
  type LiveCaption, type SegmenterState,
} from '../src/shared/live'
import { buildWhisperArgs } from '../src/shared/whisper'

const caption = (id: number, over: Partial<LiveCaption> = {}): LiveCaption => ({
  id,
  speaker: 'me',
  atMs: id * 1000,
  text: `câu ${id}`,
  ...over,
})

/** Đưa segmenter qua một chuỗi khung có tiếng / im lặng, trả về hành động cuối cùng. */
function feedAll(rmsSeries: number[], frameMs = 100): { state: SegmenterState; actions: string[] } {
  let state = initialSegmenter()
  const actions: string[] = []
  for (const rms of rmsSeries) {
    const step = feedSegmenter(state, rms, frameMs)
    state = step.state
    actions.push(step.action)
  }
  return { state, actions }
}

const LOUD = VOICE_RMS_GATE * 4
const QUIET = VOICE_RMS_GATE / 4

describe('cắt đoạn cho phụ đề trực tiếp', () => {
  it('im lặng thì không mở đoạn nào', () => {
    const { state, actions } = feedAll(Array(20).fill(QUIET))
    expect(new Set(actions)).toEqual(new Set(['idle']))
    expect(state.open).toBe(false)
  })

  it('nói rồi dứt câu thì phát ra đúng một đoạn', () => {
    const silentFrames = Math.ceil(SILENCE_HANG_MS / 100)
    const { actions } = feedAll([...Array(10).fill(LOUD), ...Array(silentFrames).fill(QUIET)])
    expect(actions.filter((a) => a === 'emit')).toHaveLength(1)
  })

  it('một tiếng động ngắn rồi im thì bỏ, không tốn một lượt whisper', () => {
    const silentFrames = Math.ceil(SILENCE_HANG_MS / 100)
    const { actions } = feedAll([LOUD, ...Array(silentFrames).fill(QUIET)])
    expect(actions).toContain('discard')
    expect(actions).not.toContain('emit')
  })

  it('nói liên tục không nghỉ vẫn bị cắt để phụ đề không đứng im', () => {
    const frames = Math.ceil(SEGMENT_MAX_MS / 100) + 5
    const { actions } = feedAll(Array(frames).fill(LOUD))
    expect(actions).toContain('emit')
  })
})

describe('chuyển mẫu âm thanh', () => {
  it('hạ 48 kHz xuống 16 kHz đúng tỉ lệ', () => {
    const input = new Float32Array(4800).fill(0.5)
    const out = resampleTo16k(input, 48000)
    expect(out).toHaveLength(1600)
    expect(out[0]).toBeCloseTo(0.5, 5)
  })

  it('lấy trung bình chứ không bỏ mẫu: sóng ở Nyquist bị hạ xuống thay vì lọt nguyên biên độ', () => {
    const input = Float32Array.from({ length: 300 }, (_, i) => (i % 2 === 0 ? 1 : -1))
    // Bỏ mẫu cách quãng sẽ giữ nguyên |1|; trung bình theo ô 3 mẫu chỉ còn 1/3. Đúng ô chẵn
    // (32 kHz xuống 16 kHz) thì triệt tiêu hẳn về 0.
    for (const v of resampleTo16k(input, 48000)) expect(Math.abs(v)).toBeLessThanOrEqual(1 / 3 + 1e-6)
    for (const v of resampleTo16k(input, 32000)) expect(Math.abs(v)).toBeLessThan(1e-6)
  })

  it('tần số bằng hoặc thấp hơn 16 kHz thì giữ nguyên', () => {
    const input = Float32Array.from([0.1, -0.2, 0.3])
    expect(Array.from(resampleTo16k(input, LIVE_SAMPLE_RATE))).toEqual([0.1, -0.2, 0.3].map((v) => Math.fround(v)))
  })

  it('pcm16 kẹp biên, không cho tràn số', () => {
    const out = floatToPcm16(Float32Array.from([0, 1, -1, 2, -2]))
    expect(Array.from(out)).toEqual([0, 32767, -32768, 32767, -32768])
  })

  it('rms bằng 0 với mảng rỗng chứ không phải NaN', () => {
    expect(frameRms(new Float32Array(0))).toBe(0)
  })
})

describe('đóng gói WAV', () => {
  const wav = encodeWav(Int16Array.from([1, -1, 100]))
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (at: number) => String.fromCharCode(...wav.slice(at, at + 4))

  it('có header RIFF/WAVE 44 byte', () => {
    expect(tag(0)).toBe('RIFF')
    expect(tag(8)).toBe('WAVE')
    expect(tag(36)).toBe('data')
    expect(wav.byteLength).toBe(44 + 6)
  })

  it('khai đúng 16 kHz mono 16 bit - whisper từ chối mọi thứ khác', () => {
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(LIVE_SAMPLE_RATE)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(6)
  })

  it('giữ nguyên mẫu, ghi little-endian', () => {
    expect(view.getInt16(44, true)).toBe(1)
    expect(view.getInt16(48, true)).toBe(100)
  })

  it('chặn trên của gói PCM phủ được đoạn dài nhất', () => {
    expect(MAX_SEGMENT_BYTES).toBeGreaterThan((LIVE_SAMPLE_RATE * 2 * SEGMENT_MAX_MS) / 1000)
  })
})

describe('hàng đợi và danh sách phụ đề', () => {
  it('đầy thì bỏ đoạn cũ nhất và nói rõ đã bỏ mấy đoạn', () => {
    const first = pushBounded([1, 2], 3, 3)
    expect(first).toEqual({ queue: [1, 2, 3], dropped: 0 })
    const second = pushBounded([1, 2, 3], 4, 3)
    expect(second).toEqual({ queue: [2, 3, 4], dropped: 1 })
  })

  it('bản dịch về sau thay tại chỗ chứ không thành dòng thứ hai', () => {
    const list = mergeCaption([caption(1)], caption(2, { pending: true }))
    const updated = mergeCaption(list, caption(2, { translated: 'câu 2 đã dịch' }))
    expect(updated).toHaveLength(2)
    expect(updated[1]?.translated).toBe('câu 2 đã dịch')
    expect(updated[1]?.pending).toBeUndefined()
  })

  it('cắt bớt dòng cũ để danh sách không phình vô hạn', () => {
    let list: LiveCaption[] = []
    for (let i = 1; i <= 10; i++) list = mergeCaption(list, caption(i), 3)
    expect(list.map((c) => c.id)).toEqual([8, 9, 10])
  })
})

describe('làm sạch và dựng prompt', () => {
  it('bỏ nhãn không phải lời nói của whisper', () => {
    expect(cleanLiveText('[BLANK_AUDIO]')).toBe('')
    expect(cleanLiveText('(nhạc nền)')).toBe('')
    expect(cleanLiveText('  *cười*  Vâng em nghe  ')).toBe('Vâng em nghe')
  })

  it('chuỗi chỉ có dấu câu coi như không có gì', () => {
    expect(cleanLiveText(' ... ')).toBe('')
    expect(cleanLiveText('Alo?')).toBe('Alo?')
  })

  it('prompt nêu rõ chỉ trả về bản dịch', () => {
    const prompt = buildLivePrompt('Anh gửi báo giá nhé', 'English')
    expect(prompt).toContain('English')
    expect(prompt).toContain('Anh gửi báo giá nhé')
    expect(prompt.toLowerCase()).toContain('chỉ trả về')
  })

  it('gỡ ngoặc kép mô hình tự thêm vào', () => {
    expect(stripQuotes('"I will send the quote"')).toBe('I will send the quote')
    expect(stripQuotes('“Vâng ạ”')).toBe('Vâng ạ')
    expect(stripQuotes('không có ngoặc')).toBe('không có ngoặc')
  })
})

describe('chọn đường dịch', () => {
  it('không đặt ngôn ngữ thì không dịch', () => {
    expect(liveTargetMode('')).toBe('off')
  })

  it('tiếng Anh chạy trên máy, ngôn ngữ khác phải qua API', () => {
    expect(liveTargetMode('en')).toBe('local')
    expect(liveTargetMode('ja')).toBe('cloud')
  })

  it('cờ -tr chỉ xuất hiện khi dịch trên máy', () => {
    const base = { modelPath: 'm.bin', wavPath: 'a.wav', outputPrefix: 'a', language: 'vi' }
    expect(buildWhisperArgs({ ...base, translate: true })).toContain('-tr')
    expect(buildWhisperArgs(base)).not.toContain('-tr')
  })
})
