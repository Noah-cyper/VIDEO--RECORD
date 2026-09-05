import { useCallback, useEffect, useState } from 'react'
import type { Recording, Settings } from '@shared/types'
import type { TranscriptProgress, WhisperStatus } from '@shared/ipc'
import { SPEAKER_LABEL, speakingTime, type Transcript } from '@shared/transcript'
import type { StoredSummary } from '@shared/summary'
import { formatDuration } from '@shared/naming'
import { WHISPER_MODELS } from '@shared/whisper'

const PHASE_LABEL: Record<TranscriptProgress['phase'], string> = {
  model: 'Đang tải model',
  extracting: 'Đang tách audio',
  transcribing: 'Đang gỡ băng',
  done: 'Xong',
  error: 'Lỗi',
}

export function TranscriptPanel({
  recording,
  settings,
  onSeek,
}: {
  recording: Recording
  settings: Settings
  onSeek: (ms: number) => void
}) {
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [summary, setSummary] = useState<StoredSummary | null>(null)
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [progress, setProgress] = useState<TranscriptProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')

  const reload = useCallback(async () => {
    setTranscript(await window.callrec.transcript.get(recording.id))
    setSummary(await window.callrec.summary.get(recording.id))
  }, [recording.id])

  useEffect(() => {
    void reload()
    void window.callrec.whisper.status().then(setStatus)
  }, [reload])

  useEffect(
    () =>
      window.callrec.transcript.onProgress((p) => {
        if (p.recordingId === recording.id) setProgress(p)
      }),
    [recording.id],
  )

  const transcribe = async () => {
    setBusy(true)
    setProgress({ recordingId: recording.id, phase: 'model', percent: 0 })
    try {
      await window.callrec.transcript.start(recording.id, settings.whisperModel)
      await reload()
      void window.callrec.whisper.status().then(setStatus)
    } finally {
      setBusy(false)
    }
  }

  const makeSummary = async (useCloud: boolean) => {
    setBusy(true)
    try {
      setSummary(await window.callrec.summary.create(recording.id, useCloud))
    } finally {
      setBusy(false)
    }
  }

  if (!transcript) {
    return (
      <div className="panel col">
        <strong>Gỡ băng</strong>
        {status && !status.binaryAvailable && (
          <div className="alert">
            <span>Chưa có whisper.cpp. Xem hướng dẫn cài ở docs/06-transcript.md.</span>
          </div>
        )}
        <p className="muted">
          Chạy nhận dạng tiếng nói riêng cho từng track, nên nhãn người nói lấy thẳng từ track chứ
          không phải đoán. Model đang chọn: {WHISPER_MODELS[settings.whisperModel].label}.
        </p>
        {progress && progress.phase !== 'done' && (
          <p className="muted">
            {PHASE_LABEL[progress.phase]}
            {progress.track ? ` (${SPEAKER_LABEL[progress.track]})` : ''} — {progress.percent}%
            {progress.message ? ` · ${progress.message}` : ''}
          </p>
        )}
        <div className="row">
          <button className="primary" onClick={() => void transcribe()} disabled={busy || !status?.binaryAvailable}>
            Gỡ băng bản ghi này
          </button>
          {busy && <button onClick={() => void window.callrec.transcript.cancel(recording.id)}>Huỷ</button>}
        </div>
      </div>
    )
  }

  const talk = speakingTime(transcript.segments)
  const total = talk.me + talk.them || 1
  const shown = filter
    ? transcript.segments.filter((s) => s.text.toLowerCase().includes(filter.toLowerCase()))
    : transcript.segments

  return (
    <div className="panel col">
      <div className="row spread">
        <strong>Biên bản</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          Tôi {Math.round((talk.me / total) * 100)}% · Đối phương {Math.round((talk.them / total) * 100)}%
        </span>
      </div>

      <input placeholder="Lọc trong biên bản…" value={filter} onChange={(e) => setFilter(e.target.value)} />

      <div className="transcript">
        {shown.map((seg, i) => (
          <button
            key={`${seg.startMs}-${i}`}
            className={`segment ${seg.speaker}${seg.overlap ? ' overlap' : ''}`}
            onClick={() => onSeek(seg.startMs)}
            title="Nhấn để tua tới đoạn này"
          >
            <span className="seg-meta">
              {formatDuration(seg.startMs)} · {SPEAKER_LABEL[seg.speaker]}
              {seg.overlap ? ' · nói chồng' : ''}
            </span>
            <span>{seg.text}</span>
          </button>
        ))}
        {shown.length === 0 && <p className="muted">Không có đoạn nào khớp.</p>}
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {(['txt', 'srt', 'md'] as const).map((f) => (
          <button key={f} onClick={() => void window.callrec.transcript.export(recording.id, f)}>
            Xuất .{f}
          </button>
        ))}
        <button onClick={() => void transcribe()} disabled={busy || !status?.binaryAvailable}>
          Gỡ băng lại
        </button>
        <button onClick={() => void makeSummary(false)} disabled={busy}>Tóm tắt trên máy</button>
        {settings.allowCloudSummary && status?.apiKeyConfigured && (
          <button onClick={() => void makeSummary(true)} disabled={busy}>Tóm tắt qua API</button>
        )}
      </div>

      {summary && (
        <div className="col" style={{ gap: 10 }}>
          <div className="row spread">
            <strong>Tóm tắt</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {summary.source === 'cloud'
                ? `Sinh bởi ${summary.model ?? 'API'} — nội dung cuộc gọi đã được gửi ra ngoài`
                : 'Trích từ chính lời trong cuộc gọi, chạy trên máy này'}
            </span>
          </div>

          {summary.markdown ? (
            <pre className="summary-md">{summary.markdown}</pre>
          ) : (
            <ul className="summary-list">
              {summary.keyPoints.map((k, i) => (
                <li key={i}>
                  <button className="link" onClick={() => onSeek(k.startMs)}>{formatDuration(k.startMs)}</button>{' '}
                  <b>{SPEAKER_LABEL[k.speaker]}:</b> {k.text}
                </li>
              ))}
              {summary.keyPoints.length === 0 && <li className="muted">Không đủ dữ liệu để trích điểm chính.</li>}
            </ul>
          )}

          <strong>Việc cần làm</strong>
          <ul className="summary-list">
            {summary.actionItems.map((a, i) => (
              <li key={i}>
                <button className="link" onClick={() => onSeek(a.atMs)}>{formatDuration(a.atMs)}</button>{' '}
                <b>{SPEAKER_LABEL[a.speaker]}:</b> {a.text}
                {a.hasDeadline && <span className="badge">có hạn</span>}
              </li>
            ))}
            {summary.actionItems.length === 0 && <li className="muted">Không phát hiện việc cần làm nào.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
