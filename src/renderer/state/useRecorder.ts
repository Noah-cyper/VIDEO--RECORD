import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CaptureAlert, QualityPreset, Recording, StreamKind } from '@shared/types'
import type { ExportProgress } from '@shared/types'
import { elapsedMs as computeElapsed } from '@shared/time'
import { initialContext, reduce, type RecordContext, type RecordEvent } from '@shared/machine'
import { mergeCaption, type LiveCaption } from '@shared/live'
import type { LiveFailure } from '@shared/ipc'
import type { WhisperModelName } from '@shared/whisper'
import { CaptureEngine, playConsentNotice, type Levels } from '../capture/engine'

export interface RecorderOptions {
  quality: QualityPreset
  micDeviceId: string | null
  language: 'vi' | 'en'
  playConsent: boolean
  hideWhileRecording: boolean
  liveCaptions: boolean
  liveTarget: string
  liveModel: WhisperModelName
}

const LIVE_FAILURE_KEY: Record<LiveFailure, string> = {
  'no-binary': 'live.noBinary',
  'cloud-off': 'live.cloudOff',
  'bad-target': 'live.badTarget',
  model: 'live.modelFailed',
  busy: 'live.busy',
}

export function useRecorder(options: RecorderOptions) {
  const [ctx, setCtx] = useState<RecordContext>(initialContext)
  const [levels, setLevels] = useState<Levels>({ mic: 0, system: 0 })
  const [alerts, setAlerts] = useState<CaptureAlert[]>([])
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [lastRecording, setLastRecording] = useState<Recording | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [captions, setCaptions] = useState<LiveCaption[]>([])
  const [liveOn, setLiveOn] = useState(false)

  const engineRef = useRef<CaptureEngine | null>(null)
  const sessionRef = useRef<string | null>(null)
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const optionsRef = useRef(options)
  optionsRef.current = options

  const send = useCallback((event: RecordEvent) => {
    setCtx((prev) => reduce(prev, event, performance.now()))
  }, [])

  const pushAlert = useCallback((alert: CaptureAlert) => {
    setAlerts((prev) => [...prev.filter((a) => !(a.kind === alert.kind && a.stream === alert.stream)), alert])
  }, [])

  const dismissAlert = useCallback((index: number) => {
    setAlerts((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Đồng hồ chỉ chạy khi đang ghi; paused giữ nguyên số liệu đã tính.
  useEffect(() => {
    if (ctx.state !== 'recording' || ctx.startedAtMs === null) return
    const id = window.setInterval(() => {
      setElapsed(computeElapsed(ctx.startedAtMs as number, performance.now(), ctx.pauses))
    }, 250)
    return () => window.clearInterval(id)
  }, [ctx.state, ctx.startedAtMs, ctx.pauses])

  // Main process cần biết trạng thái để dựng overlay và đổi icon khay (FR-08).
  useEffect(() => {
    window.callrec.reportState(ctx.state, elapsed)
  }, [ctx.state, elapsed])

  // Giữ ref vì stop() đọc tiến độ trong callback, nơi state có thể đã cũ.
  const progressRef = useRef<ExportProgress | null>(null)
  useEffect(
    () =>
      window.callrec.exportRecording.onProgress((p) => {
        progressRef.current = p
        setProgress(p)
      }),
    [],
  )
  useEffect(() => window.callrec.onAlert(pushAlert), [pushAlert])
  useEffect(
    () => window.callrec.live.onCaption((c) => setCaptions((prev) => mergeCaption(prev, c))),
    [],
  )

  const selectSource = useCallback(
    async (sourceId: string) => {
      await window.callrec.sources.pick(sourceId, true)
      setCtx((prev) => ({ ...reduce(prev, { type: 'SELECT_SOURCE' }, performance.now()), sourceId }))
    },
    [],
  )

  const start = useCallback(async () => {
    const opts = optionsRef.current
    // Thiếu FFmpeg thì ghi xong cũng không xuất được file. Chặn ở đây để người dùng biết TRƯỚC,
    // chứ không phải sau khi đã ghi xong một cuộc gọi rồi mất nó.
    if (!(await window.callrec.ffmpeg.available())) {
      pushAlert({ kind: 'stream-error', messageKey: 'record.noFfmpeg' })
      return
    }
    const disk = await window.callrec.disk.status(opts.quality)
    if (!disk.canRecord) {
      pushAlert({ kind: 'disk-low', messageKey: 'record.diskFull' })
      return
    }
    if (disk.warn) {
      pushAlert({ kind: 'disk-low', messageKey: 'record.diskLow', params: { minutes: disk.minutesLeft } })
    }

    const session = await window.callrec.session.open({ quality: opts.quality })
    sessionRef.current = session.id

    // Bật phụ đề TRƯỚC khi ghi: lần đầu còn phải tải model, mà tải giữa buổi thì mất đúng đoạn đầu.
    let live = false
    if (opts.liveCaptions) {
      // Model chưa có thì bước sau đứng im vài chục giây để tải; nói trước chứ đừng để người dùng
      // ngồi nhìn nút không phản ứng rồi bấm lại.
      const status = await window.callrec.whisper.status()
      const needsDownload = !status.installedModels.includes(opts.liveModel)
      if (needsDownload) pushAlert({ kind: 'info', messageKey: 'live.preparing' })

      const res = await window.callrec.live.start({
        sessionId: session.id,
        target: opts.liveTarget,
        model: opts.liveModel,
      })
      live = res.ok
      if (needsDownload) setAlerts((prev) => prev.filter((a) => a.messageKey !== 'live.preparing'))
      if (!res.ok) {
        // Hỏng phụ đề không phải lý do để không ghi được cuộc gọi; báo rồi ghi tiếp.
        pushAlert({
          kind: 'info',
          messageKey: LIVE_FAILURE_KEY[res.reason ?? 'busy'],
          params: { reason: res.message ?? '' },
        })
      }
    }
    setCaptions([])
    setLiveOn(live)

    const engine = new CaptureEngine({
      onChunk: (kind: StreamKind, data) => {
        const id = sessionRef.current
        if (id) void window.callrec.session.writeChunk({ sessionId: id, kind, data })
      },
      onLevels: setLevels,
      onAlert: pushAlert,
      onStreamStarts: (offsets, mimeTypes, devices) => {
        const id = sessionRef.current
        if (!id) return
        for (const kind of Object.keys(offsets) as StreamKind[]) {
          void window.callrec.session.registerStream({
            sessionId: id,
            kind,
            offsetMs: offsets[kind] ?? 0,
            mimeType: mimeTypes[kind] ?? '',
            device: devices[kind],
          })
        }
      },
    })

    try {
      await engine.start({
        quality: opts.quality,
        micDeviceId: opts.micDeviceId,
        withVideo: opts.quality !== 'audio-only',
        onLiveSegment: live
          ? (speaker, atMs, pcm) => {
              const id = sessionRef.current
              // Cắt đúng phần đang dùng: buffer của Int16Array có thể lớn hơn số mẫu thật.
              if (id) {
                const pcmBuffer = (pcm.buffer as ArrayBuffer).slice(0, pcm.byteLength)
                window.callrec.live.audio({ sessionId: id, speaker, atMs, pcm: pcmBuffer })
              }
            }
          : undefined,
      })
    } catch (err) {
      void window.callrec.live.stop()
      setLiveOn(false)
      await window.callrec.session.discard(session.id)
      sessionRef.current = null
      send({ type: 'FAIL', error: err instanceof Error ? err.message : String(err) })
      return
    }

    engineRef.current = engine
    setElapsed(0)
    send({ type: 'START' })

    if (opts.playConsent) void playConsentNotice(opts.language)
    // Lui xuống khay SAU khi đã bắt đầu ghi, để câu thông báo đồng ý kịp phát ra loa trước.
    if (opts.hideWhileRecording) void window.callrec.window.hide()
  }, [pushAlert, send])

  const pause = useCallback(() => {
    const state = ctxRef.current.state
    if (state === 'recording') {
      engineRef.current?.pause()
      send({ type: 'PAUSE' })
    } else if (state === 'paused') {
      engineRef.current?.resume()
      send({ type: 'RESUME' })
    }
  }, [send])

  const stop = useCallback(async () => {
    const id = sessionRef.current
    const finalElapsed = ctxRef.current.startedAtMs
      ? computeElapsed(ctxRef.current.startedAtMs, performance.now(), ctxRef.current.pauses)
      : elapsed
    send({ type: 'STOP' })
    void window.callrec.live.stop()
    setLiveOn(false)
    await engineRef.current?.stop()
    engineRef.current = null
    if (!id) return send({ type: 'FINALIZED' })

    // Ghi xong thì hiện lại cửa sổ: người dùng cần thấy kết quả hoặc lý do hỏng.
    void window.callrec.window.show()
    const recording = await window.callrec.session.close({ sessionId: id, durationMs: finalElapsed })
    sessionRef.current = null
    setLastRecording(recording)
    // Lý do thật đã về qua kênh tiến độ; hiện nó thay vì một câu chung chung vô dụng.
    const detail = progressRef.current?.phase === 'error' ? progressRef.current.message : undefined
    send(recording ? { type: 'FINALIZED' } : { type: 'FAIL', error: detail || 'record.exportFailed' })
  }, [elapsed, send])

  const bookmark = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    const atMs = ctxRef.current.startedAtMs
      ? computeElapsed(ctxRef.current.startedAtMs, performance.now(), ctxRef.current.pauses)
      : 0
    await window.callrec.session.bookmark(id, { atMs, label: new Date().toLocaleTimeString() })
    pushAlert({ kind: 'info', messageKey: 'record.bookmarked' })
  }, [pushAlert])

  const reset = useCallback(() => {
    setProgress(null)
    setElapsed(0)
    setCaptions([])
    send({ type: 'RESET' })
  }, [send])

  // Phím tắt toàn cục và menu khay đi vào đây, dùng chung đúng những hàm mà UI dùng.
  useEffect(
    () =>
      window.callrec.onCommand((cmd) => {
        const state = ctxRef.current.state
        if (cmd === 'toggle-record') {
          if (state === 'recording' || state === 'paused') void stop()
          else if (state === 'armed') void start()
        } else if (cmd === 'pause') pause()
        else if (cmd === 'stop') void stop()
        else if (cmd === 'bookmark') void bookmark()
      }),
    [bookmark, pause, start, stop],
  )

  const canStart = ctx.state === 'armed'
  const busy = useMemo(() => ['recording', 'paused', 'finalizing'].includes(ctx.state), [ctx.state])

  return {
    ctx, levels, alerts, progress, elapsed, lastRecording, canStart, busy, captions, liveOn,
    selectSource, start, pause, stop, bookmark, reset, dismissAlert,
  }
}
