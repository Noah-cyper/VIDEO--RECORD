import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CaptureAlert, ExportProgress, QualityPreset, Recording, StreamKind } from '@shared/types'
import { elapsedMs as computeElapsed } from '@shared/time'
import { initialContext, reduce, type RecordContext, type RecordEvent } from '@shared/machine'
import { CaptureEngine, playConsentNotice, type Levels } from '../capture/engine'

export interface RecorderOptions {
  quality: QualityPreset
  micDeviceId: string | null
  language: 'vi' | 'en'
  playConsent: boolean
}

export function useRecorder(options: RecorderOptions) {
  const [ctx, setCtx] = useState<RecordContext>(initialContext)
  const [levels, setLevels] = useState<Levels>({ mic: 0, system: 0 })
  const [alerts, setAlerts] = useState<CaptureAlert[]>([])
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [lastRecording, setLastRecording] = useState<Recording | null>(null)
  const [elapsed, setElapsed] = useState(0)

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

  useEffect(() => window.callrec.exportRecording.onProgress(setProgress), [])
  useEffect(() => window.callrec.onAlert(pushAlert), [pushAlert])

  const selectSource = useCallback(
    async (sourceId: string) => {
      await window.callrec.sources.pick(sourceId, true)
      setCtx((prev) => ({ ...reduce(prev, { type: 'SELECT_SOURCE' }, performance.now()), sourceId }))
    },
    [],
  )

  const start = useCallback(async () => {
    const opts = optionsRef.current
    const disk = await window.callrec.disk.status(opts.quality)
    if (!disk.canRecord) {
      pushAlert({ kind: 'disk-low', message: 'Ổ đĩa còn dưới 1 GB, không đủ chỗ để bắt đầu ghi.' })
      return
    }
    if (disk.warn) {
      pushAlert({ kind: 'disk-low', message: `Ổ đĩa sắp đầy, chỉ còn ghi được khoảng ${disk.minutesLeft} phút.` })
    }

    const session = await window.callrec.session.open({ quality: opts.quality })
    sessionRef.current = session.id

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
      })
    } catch (err) {
      await window.callrec.session.discard(session.id)
      sessionRef.current = null
      send({ type: 'FAIL', error: err instanceof Error ? err.message : String(err) })
      return
    }

    engineRef.current = engine
    setElapsed(0)
    send({ type: 'START' })

    if (opts.playConsent) void playConsentNotice(opts.language)
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
    await engineRef.current?.stop()
    engineRef.current = null
    if (!id) return send({ type: 'FINALIZED' })

    const recording = await window.callrec.session.close({ sessionId: id, durationMs: finalElapsed })
    sessionRef.current = null
    setLastRecording(recording)
    send(recording ? { type: 'FINALIZED' } : { type: 'FAIL', error: 'Không xuất được file. File thô vẫn được giữ lại.' })
  }, [elapsed, send])

  const bookmark = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    const atMs = ctxRef.current.startedAtMs
      ? computeElapsed(ctxRef.current.startedAtMs, performance.now(), ctxRef.current.pauses)
      : 0
    await window.callrec.session.bookmark(id, { atMs, label: `Mốc ${new Date().toLocaleTimeString('vi-VN')}` })
    pushAlert({ kind: 'silence', message: 'Đã đánh dấu mốc thời gian.' })
  }, [pushAlert])

  const reset = useCallback(() => {
    setProgress(null)
    setElapsed(0)
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
    ctx, levels, alerts, progress, elapsed, lastRecording, canStart, busy,
    selectSource, start, pause, stop, bookmark, reset, dismissAlert,
  }
}
