import { diagnose, type SelfTestVerdict, type StreamProbe } from '@shared/selftest'
import { getDisplayStream, getMicStream } from './engine'

export interface SelfTestOutcome {
  mic: StreamProbe | null
  system: StreamProbe | null
  verdicts: SelfTestVerdict[]
}

/** Đo mức đỉnh trong khoảng thời gian cho trước; peak chứ không phải RMS vì chỉ cần biết CÓ hay KHÔNG. */
function watchPeak(ctx: AudioContext, track: MediaStreamTrack, deadline: number): Promise<number> {
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser)
  const buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT))

  return new Promise((resolve) => {
    let peak = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(buffer)
      for (const v of buffer) peak = Math.max(peak, Math.abs(v))
      if (performance.now() >= deadline) resolve(peak)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Mở đồng thời micro và âm hệ thống trong vài giây rồi báo bên nào có tiếng. Trả lời trực tiếp
 * câu hỏi lớn nhất của dự án mà không cần người dùng phải gọi thật rồi tự đoán qua hai thanh mức âm.
 */
export async function runSelfTest(micDeviceId: string | null, durationMs = 4000): Promise<SelfTestOutcome> {
  const streams: MediaStream[] = []
  let ctx: AudioContext | null = null

  try {
    let micTrack: MediaStreamTrack | undefined
    let systemTrack: MediaStreamTrack | undefined
    let systemLabel = ''

    try {
      const mic = await getMicStream(micDeviceId)
      streams.push(mic)
      micTrack = mic.getAudioTracks()[0]
    } catch {
      // Không mở được micro là một kết luận hợp lệ, không phải lý do huỷ cả bài kiểm tra.
    }

    try {
      const display = await getDisplayStream('audio-only')
      streams.push(display)
      systemTrack = display.getAudioTracks()[0]
      systemLabel = display.getVideoTracks()[0]?.label ?? systemTrack?.label ?? ''
    } catch {
      // Tương tự: thiếu quyền ghi màn hình cũng là một kết luận.
    }

    ctx = new AudioContext()
    const deadline = performance.now() + durationMs
    const [micPeak, systemPeak] = await Promise.all([
      micTrack ? watchPeak(ctx, micTrack, deadline) : Promise.resolve(null),
      systemTrack ? watchPeak(ctx, systemTrack, deadline) : Promise.resolve(null),
    ])

    const mic = micTrack ? { label: micTrack.label, peak: micPeak ?? 0 } : null
    const system = systemTrack ? { label: systemLabel || systemTrack.label, peak: systemPeak ?? 0 } : null
    return { mic, system, verdicts: diagnose({ mic, system }) }
  } finally {
    // Bài kiểm tra tuyệt đối không được để lại thiết bị đang mở - đèn micro sáng mãi là lỗi tệ.
    for (const s of streams) for (const t of s.getTracks()) t.stop()
    await ctx?.close().catch(() => undefined)
  }
}
