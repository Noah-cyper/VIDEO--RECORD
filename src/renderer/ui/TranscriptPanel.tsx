import { useCallback, useEffect, useState } from 'react'
import type { Recording, Settings } from '@shared/types'
import type { TranscriptProgress, WhisperStatus } from '@shared/ipc'
import { speakingTime, type Speaker, type Transcript } from '@shared/transcript'
import type { StoredSummary } from '@shared/summary'
import { customLanguageCode, languageLabel, TARGET_LANGUAGES } from '@shared/translate'
import { formatDuration } from '@shared/naming'
import { WHISPER_MODELS } from '@shared/whisper'
import type { TranslationKey } from '@shared/i18n'
import { useT } from './i18n'

const PHASE_KEY: Record<TranscriptProgress['phase'], TranslationKey> = {
  model: 'transcript.phase.model',
  extracting: 'transcript.phase.extracting',
  transcribing: 'transcript.phase.transcribing',
  translating: 'transcript.phase.translating',
  done: 'transcript.phase.done',
  error: 'transcript.phase.error',
}

const speakerKey = (s: Speaker): TranslationKey => (s === 'me' ? 'speaker.me' : 'speaker.them')

export function TranscriptPanel({
  recording,
  settings,
  onSeek,
}: {
  recording: Recording
  settings: Settings
  onSeek: (ms: number) => void
}) {
  const t = useT()
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [summary, setSummary] = useState<StoredSummary | null>(null)
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [progress, setProgress] = useState<TranscriptProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const [targetCode, setTargetCode] = useState('en')
  const [customName, setCustomName] = useState('')
  // 'original' hoặc mã ngôn ngữ đang xem; giữ riêng với targetCode để chọn ngôn ngữ dịch
  // không làm nhảy nội dung đang đọc.
  const [view, setView] = useState('original')
  const [translation, setTranslation] = useState<Transcript | null>(null)

  const reload = useCallback(async () => {
    setTranscript(await window.callrec.transcript.get(recording.id))
    setSummary(await window.callrec.summary.get(recording.id))
  }, [recording.id])

  const canTranslate = settings.allowCloudSummary && status?.apiKeyConfigured === true

  const showTranslation = useCallback(async (code: string) => {
    if (code === 'original') return setView('original')
    const got = await window.callrec.transcript.getTranslation(recording.id, code)
    if (got) {
      setTranslation(got)
      setView(code)
    }
  }, [recording.id])

  const translate = async () => {
    const isCustom = targetCode === 'custom'
    const name = isCustom ? customName.trim() : languageLabel(targetCode)
    if (!name) return
    const code = isCustom ? customLanguageCode(name) : targetCode

    setBusy(true)
    setProgress({ recordingId: recording.id, phase: 'translating', percent: 0 })
    try {
      const got = await window.callrec.transcript.translate(recording.id, code, name)
      if (got) {
        setTranslation(got)
        setView(code)
      }
    } finally {
      setBusy(false)
    }
  }

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
        <strong>{t('transcript.heading')}</strong>
        {status && !status.binaryAvailable && (
          <div className="alert">
            <span>{t('transcript.noBinary')}</span>
          </div>
        )}
        <p className="muted">
          {t('transcript.explain', { model: WHISPER_MODELS[settings.whisperModel].label })}
        </p>
        {progress && progress.phase !== 'done' && (
          <p className="muted">
            {t(PHASE_KEY[progress.phase])}
            {progress.track ? ` (${t(speakerKey(progress.track))})` : ''} — {progress.percent}%
            {progress.message ? ` · ${progress.message}` : ''}
          </p>
        )}
        <div className="row">
          <button className="primary" onClick={() => void transcribe()} disabled={busy || !status?.binaryAvailable}>
            {t('transcript.run')}
          </button>
          {busy && (
            <button onClick={() => void window.callrec.transcript.cancel(recording.id)}>{t('app.cancel')}</button>
          )}
        </div>
      </div>
    )
  }

  const talk = speakingTime(transcript.segments)
  const total = talk.me + talk.them || 1
  // Bản dịch giữ nguyên mốc thời gian nên tua vẫn đúng dù đang xem ngôn ngữ nào.
  const active = view !== 'original' && translation ? translation.segments : transcript.segments
  const shown = filter
    ? active.filter((s) => s.text.toLowerCase().includes(filter.toLowerCase()))
    : active
  const available = recording.translations ?? []

  return (
    <div className="panel col">
      <div className="row spread">
        <strong>{t('transcript.title')}</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {t('transcript.share', {
            me: Math.round((talk.me / total) * 100),
            them: Math.round((talk.them / total) * 100),
          })}
        </span>
      </div>

      {(available.length > 0 || view !== 'original') && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            className={view === 'original' ? '' : 'ghost'}
            onClick={() => void showTranslation('original')}
          >
            {t('transcript.viewOriginal')}
          </button>
          {available.map((code) => (
            <button
              key={code}
              className={view === code ? '' : 'ghost'}
              onClick={() => void showTranslation(code)}
            >
              {t('transcript.viewTranslated', { lang: languageLabel(code) })}
            </button>
          ))}
        </div>
      )}

      <input placeholder={t('transcript.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />

      <div className="transcript">
        {shown.map((seg, i) => (
          <button
            key={`${seg.startMs}-${i}`}
            className={`segment ${seg.speaker}${seg.overlap ? ' overlap' : ''}`}
            onClick={() => onSeek(seg.startMs)}
            title={t('transcript.seekHint')}
          >
            <span className="seg-meta">
              {formatDuration(seg.startMs)} · {t(speakerKey(seg.speaker))}
              {seg.overlap ? ` · ${t('transcript.overlap')}` : ''}
            </span>
            <span>{seg.text}</span>
          </button>
        ))}
        {shown.length === 0 && <p className="muted">{t('transcript.noMatch')}</p>}
      </div>

      <div className="col" style={{ gap: 8 }}>
        <strong>{t('transcript.translate')}</strong>
        {canTranslate ? (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label htmlFor="translate-to" className="muted" style={{ fontSize: 13 }}>
              {t('transcript.translateTo')}
            </label>
            <select
              id="translate-to"
              value={targetCode}
              style={{ maxWidth: 200 }}
              onChange={(e) => setTargetCode(e.target.value)}
            >
              {TARGET_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
              <option value="custom">{t('transcript.customLanguage')}</option>
            </select>
            {targetCode === 'custom' && (
              <input
                placeholder={t('transcript.customLanguagePlaceholder')}
                value={customName}
                style={{ maxWidth: 240 }}
                onChange={(e) => setCustomName(e.target.value)}
              />
            )}
            <button
              onClick={() => void translate()}
              disabled={busy || (targetCode === 'custom' && customName.trim() === '')}
            >
              {t('transcript.translateRun')}
            </button>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>{t('transcript.translateNeedsSetup')}</span>
        )}
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {(['txt', 'srt', 'md'] as const).map((f) => (
          <button key={f} onClick={() => void window.callrec.transcript.export(recording.id, f)}>
            {t('transcript.export', { format: f })}
          </button>
        ))}
        <button onClick={() => void transcribe()} disabled={busy || !status?.binaryAvailable}>
          {t('transcript.rerun')}
        </button>
        <button onClick={() => void makeSummary(false)} disabled={busy}>{t('summary.local')}</button>
        {settings.allowCloudSummary && status?.apiKeyConfigured && (
          <button onClick={() => void makeSummary(true)} disabled={busy}>{t('summary.cloud')}</button>
        )}
      </div>

      {summary && (
        <div className="col" style={{ gap: 10 }}>
          <div className="row spread">
            <strong>{t('summary.title')}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {summary.source === 'cloud'
                ? t('summary.sourceCloud', { model: summary.model ?? 'API' })
                : t('summary.sourceLocal')}
            </span>
          </div>

          {summary.markdown ? (
            <pre className="summary-md">{summary.markdown}</pre>
          ) : (
            <ul className="summary-list">
              {summary.keyPoints.map((k, i) => (
                <li key={i}>
                  <button className="link" onClick={() => onSeek(k.startMs)}>{formatDuration(k.startMs)}</button>{' '}
                  <b>{t(speakerKey(k.speaker))}:</b> {k.text}
                </li>
              ))}
              {summary.keyPoints.length === 0 && <li className="muted">{t('summary.noKeyPoints')}</li>}
            </ul>
          )}

          <strong>{t('summary.actions')}</strong>
          <ul className="summary-list">
            {summary.actionItems.map((a, i) => (
              <li key={i}>
                <button className="link" onClick={() => onSeek(a.atMs)}>{formatDuration(a.atMs)}</button>{' '}
                <b>{t(speakerKey(a.speaker))}:</b> {a.text}
                {a.hasDeadline && <span className="badge">{t('summary.hasDeadline')}</span>}
              </li>
            ))}
            {summary.actionItems.length === 0 && <li className="muted">{t('summary.noActions')}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
