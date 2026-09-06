import { feedSegmenter, floatToPcm16, frameRms, initialSegmenter, resampleTo16k } from '@shared/live'
import type { Speaker } from '@shared/transcript'

const BUFFER_SIZE = 4096
/** Giữ lại vài khung trước lúc phát hiện có tiếng, nếu không âm đầu của từ đầu tiên bị cụt. */
const PREROLL_FRAMES = 3

export type SegmentSink = (speaker: Speaker, atMs: number, pcm: Int16Array) => void

/**
 * Nghe ké một track để làm phụ đề. Đây là nhánh RIÊNG, song song với MediaRecorder: bản ghi không
 * đi qua đây và không chịu ảnh hưởng nếu phụ đề hỏng hay bị tắt giữa chừng.
 */
export class LiveTap {
  private source: MediaStreamAudioSourceNode
  private processor: ScriptProcessorNode
  private sink: GainNode
  private seg = initialSegmenter()
  private frames: Float32Array[] = []
  private preroll: Float32Array[] = []
  private startedAtMs = 0
  private paused = false

  constructor(
    private ctx: AudioContext,
    track: MediaStreamTrack,
    private speaker: Speaker,
    private t0: number,
    private onSegment: SegmentSink,
  ) {
    this.source = ctx.createMediaStreamSource(new MediaStream([track]))
    // AudioWorklet sạch hơn nhưng phải bundle thêm một module riêng; ScriptProcessor tuy đã cũ
    // vẫn chạy ở mọi bản Chromium mà Electron dùng, và mỗi khung 4096 mẫu là quá đủ thời gian.
    this.processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1)
    // Node chỉ được gọi khi có đường tới destination, nhưng nối thẳng ra loa là tạo vòng hú giữa
    // micro và loa - và tệ hơn, tiếng hú đó lọt vào luồng loopback tức là vào chính bản ghi.
    this.sink = ctx.createGain()
    this.sink.gain.value = 0
    this.processor.onaudioprocess = (e) => this.handle(e.inputBuffer.getChannelData(0))
    this.source.connect(this.processor)
    this.processor.connect(this.sink)
    this.sink.connect(ctx.destination)
  }

  private handle(input: Float32Array): void {
    if (this.paused) return
    // Buffer của Web Audio được dùng lại ở khung sau, giữ tham chiếu là giữ dữ liệu đã bị ghi đè.
    const frame = Float32Array.from(input)
    const frameMs = (frame.length / this.ctx.sampleRate) * 1000
    const wasOpen = this.seg.open
    const { state, action } = feedSegmenter(this.seg, frameRms(frame), frameMs)
    this.seg = state

    if (action === 'idle') {
      this.preroll.push(frame)
      if (this.preroll.length > PREROLL_FRAMES) this.preroll.shift()
      return
    }

    if (!wasOpen) {
      this.startedAtMs = Math.max(0, performance.now() - this.t0 - this.preroll.length * frameMs)
      this.frames = this.preroll
      this.preroll = []
    }
    this.frames.push(frame)

    if (action === 'emit') this.flush()
    else if (action === 'discard') this.reset()
  }

  private flush(): void {
    const total = this.frames.reduce((n, f) => n + f.length, 0)
    const joined = new Float32Array(total)
    let at = 0
    for (const f of this.frames) {
      joined.set(f, at)
      at += f.length
    }
    this.reset()
    this.onSegment(this.speaker, this.startedAtMs, floatToPcm16(resampleTo16k(joined, this.ctx.sampleRate)))
  }

  private reset(): void {
    this.frames = []
    this.preroll = []
    this.seg = initialSegmenter()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) this.reset()
  }

  stop(): void {
    this.processor.onaudioprocess = null
    this.source.disconnect()
    this.processor.disconnect()
    this.sink.disconnect()
    this.reset()
  }
}
