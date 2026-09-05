import type { AudioDevice, CaptureAlert, QualityPreset, StreamKind } from '@shared/types'
import { QUALITY } from '@shared/types'
import { computeOffsets, type StreamStart } from '@shared/time'

const CHUNK_MS = 5000
const SILENCE_ALERT_MS = 30_000
const SILENCE_RMS = 0.002
const FFT_SIZE = 1024

const AUDIO_MIME = ['audio/webm;codecs=opus', 'audio/webm']
const VIDEO_MIME = ['video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

function pickMime(candidates: string[]): string | undefined {
  return candidates.find((m) => MediaRecorder.isTypeSupported(m))
}

export async function listMics(): Promise<AudioDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Micro ${i + 1}` }))
}

/**
 * echoCancellation/noiseSuppression/autoGainControl PHẢI tắt: bật lên thì Chromium sẽ xoá khỏi
 * luồng mic đúng những gì đang phát ra loa - tức là giọng đối phương (docs/03 mục 4.1).
 * Vì đã tách hai track riêng nên không cần khử vọng ở tầng ghi.
 */
export async function getMicStream(deviceId: string | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      sampleRate: 48000,
    },
  })
}

/** Handler ở main process đã gắn audio: 'loopback', nên stream trả về có sẵn system audio. */
export async function getDisplayStream(quality: QualityPreset): Promise<MediaStream> {
  const spec = QUALITY[quality]
  const wantsVideo = spec.frameRate !== undefined
  return navigator.mediaDevices.getDisplayMedia({
    video: wantsVideo
      ? { width: { ideal: spec.width }, height: { ideal: spec.height }, frameRate: { ideal: spec.frameRate } }
      : true,
    audio: true,
  })
}

export interface Levels {
  mic: number
  system: number
}

class Meter {
  private analyser: AnalyserNode
  private buffer = new Float32Array(new ArrayBuffer(FFT_SIZE * Float32Array.BYTES_PER_ELEMENT))
  private silentSinceMs: number | null = null

  constructor(ctx: AudioContext, track: MediaStreamTrack) {
    const src = ctx.createMediaStreamSource(new MediaStream([track]))
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    src.connect(this.analyser)
  }

  /** RMS chứ không phải peak: peak nhảy quá nhanh để người dùng đọc được trên thanh mức. */
  read(nowMs: number): { level: number; silentMs: number } {
    this.analyser.getFloatTimeDomainData(this.buffer)
    let sum = 0
    for (const v of this.buffer) sum += v * v
    const rms = Math.sqrt(sum / this.buffer.length)
    if (rms < SILENCE_RMS) {
      this.silentSinceMs ??= nowMs
    } else {
      this.silentSinceMs = null
    }
    return { level: Math.min(1, rms * 8), silentMs: this.silentSinceMs === null ? 0 : nowMs - this.silentSinceMs }
  }
}

export interface EngineCallbacks {
  onChunk(kind: StreamKind, data: ArrayBuffer): void
  onLevels(levels: Levels): void
  onAlert(alert: CaptureAlert): void
  onStreamStarts(offsets: Record<string, number>, mimeTypes: Partial<Record<StreamKind, string>>, devices: Partial<Record<StreamKind, string>>): void
}

export interface StartOptions {
  quality: QualityPreset
  micDeviceId: string | null
  withVideo: boolean
}

export class CaptureEngine {
  private recorders = new Map<StreamKind, MediaRecorder>()
  private streams: MediaStream[] = []
  private audioCtx: AudioContext | null = null
  private meters = new Map<'mic' | 'system', Meter>()
  private timer: number | null = null
  private alerted = new Set<string>()

  constructor(private cb: EngineCallbacks) {}

  async start(opts: StartOptions): Promise<void> {
    const display = await getDisplayStream(opts.quality)
    this.streams.push(display)

    let mic: MediaStream | null = null
    try {
      mic = await getMicStream(opts.micDeviceId)
      this.streams.push(mic)
    } catch {
      // Không có mic vẫn ghi được phía đối phương; báo rõ chứ đừng huỷ cả buổi ghi.
      this.cb.onAlert({ kind: 'device-lost', stream: 'mic', message: 'Không mở được microphone. Chỉ ghi được tiếng đầu bên kia.' })
    }

    const systemTrack = display.getAudioTracks()[0]
    const videoTrack = display.getVideoTracks()[0]
    const micTrack = mic?.getAudioTracks()[0]

    if (!systemTrack) {
      this.cb.onAlert({
        kind: 'stream-error',
        stream: 'system',
        message: 'Không lấy được âm thanh hệ thống. Kiểm tra quyền ghi màn hình rồi thử lại.',
      })
    }

    const t0 = performance.now()
    const starts: StreamStart[] = []
    const mimeTypes: Partial<Record<StreamKind, string>> = {}
    const devices: Partial<Record<StreamKind, string>> = {}

    const attach = (kind: StreamKind, track: MediaStreamTrack | undefined, mimes: string[]) => {
      if (!track) return
      const mimeType = pickMime(mimes)
      const rec = new MediaRecorder(new MediaStream([track]), mimeType ? { mimeType } : undefined)
      rec.ondataavailable = async (e) => {
        if (e.data.size > 0) this.cb.onChunk(kind, await e.data.arrayBuffer())
      }
      rec.onerror = () =>
        this.cb.onAlert({ kind: 'stream-error', stream: kind, message: `Luồng ${kind} gặp lỗi và đã dừng.` })
      // Track kết thúc đột ngột = người dùng đóng cửa sổ đang ghi hoặc rút thiết bị.
      track.onended = () =>
        this.cb.onAlert({ kind: 'device-lost', stream: kind, message: `Nguồn ${kind} đã bị ngắt giữa chừng.` })
      rec.start(CHUNK_MS)
      starts.push({ kind, startedAtMs: performance.now() - t0 })
      this.recorders.set(kind, rec)
      mimeTypes[kind] = rec.mimeType
      devices[kind] = track.label
    }

    attach('mic', micTrack, AUDIO_MIME)
    attach('system', systemTrack, AUDIO_MIME)
    if (opts.withVideo) attach('video', videoTrack, VIDEO_MIME)

    this.cb.onStreamStarts(computeOffsets(starts), mimeTypes, devices)

    this.audioCtx = new AudioContext()
    if (micTrack) this.meters.set('mic', new Meter(this.audioCtx, micTrack))
    if (systemTrack) this.meters.set('system', new Meter(this.audioCtx, systemTrack))
    this.startMetering()
  }

  private startMetering(): void {
    const tick = () => {
      const now = performance.now()
      const levels: Levels = { mic: 0, system: 0 }
      for (const [kind, meter] of this.meters) {
        const { level, silentMs } = meter.read(now)
        levels[kind] = level
        // Cảnh báo một lần cho mỗi luồng: im lặng kéo dài thường là mất thiết bị, không phải im thật.
        if (silentMs > SILENCE_ALERT_MS && !this.alerted.has(kind)) {
          this.alerted.add(kind)
          this.cb.onAlert({
            kind: 'silence',
            stream: kind,
            message:
              kind === 'mic'
                ? 'Micro không thu được tiếng suốt 30 giây. Kiểm tra thiết bị đầu vào.'
                : 'Không nghe thấy tiếng đầu bên kia suốt 30 giây. Kiểm tra thiết bị phát.',
          })
        }
        if (silentMs === 0) this.alerted.delete(kind)
      }
      this.cb.onLevels(levels)
      this.timer = requestAnimationFrame(tick)
    }
    this.timer = requestAnimationFrame(tick)
  }

  pause(): void {
    for (const r of this.recorders.values()) if (r.state === 'recording') r.pause()
  }

  resume(): void {
    for (const r of this.recorders.values()) if (r.state === 'paused') r.resume()
  }

  /** requestData trước khi stop để chunk cuối không bị mất. */
  async stop(): Promise<void> {
    if (this.timer !== null) cancelAnimationFrame(this.timer)
    this.timer = null

    await Promise.all(
      [...this.recorders.values()].map(
        (r) =>
          new Promise<void>((resolve) => {
            if (r.state === 'inactive') return resolve()
            r.onstop = () => resolve()
            if (r.state === 'paused') r.resume()
            r.requestData()
            r.stop()
          }),
      ),
    )
    this.recorders.clear()
    this.meters.clear()
    for (const s of this.streams) for (const t of s.getTracks()) t.stop()
    this.streams = []
    await this.audioCtx?.close().catch(() => undefined)
    this.audioCtx = null
    this.alerted.clear()
  }
}

/**
 * Câu thông báo đồng ý phát ở đầu bản ghi (FR-08). Phát ra loa nên nó đi vào luồng loopback,
 * tức là nằm ngay trong file ghi - đúng chỗ cần có bằng chứng đã thông báo.
 */
export function playConsentNotice(language: 'vi' | 'en'): Promise<void> {
  return new Promise((resolve) => {
    const text =
      language === 'vi'
        ? 'Xin lưu ý, cuộc gọi này đang được ghi lại.'
        : 'Please note, this call is being recorded.'
    if (typeof speechSynthesis === 'undefined') return resolve()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = language === 'vi' ? 'vi-VN' : 'en-US'
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    speechSynthesis.speak(utter)
  })
}
