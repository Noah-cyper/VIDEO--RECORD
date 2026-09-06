import { useEffect, useRef, useState } from 'react'
import type { CaptureSource, Settings } from '@shared/types'
import { formatDuration } from '@shared/naming'
import { LIVE_TARGET_LOCAL, liveTargetMode, type LiveCaption } from '@shared/live'
import { TARGET_LANGUAGES } from '@shared/translate'
import { listMics } from '../capture/engine'
import { runSelfTest, type SelfTestOutcome } from '../capture/selftest'
import { formatReport, type SelfTestVerdict } from '@shared/selftest'
import { useRecorder } from '../state/useRecorder'
import { useT, type Translator } from './i18n'
import type { TranslationKey } from '@shared/i18n'

const VERDICT_KEY: Record<SelfTestVerdict, TranslationKey> = {
  ok: 'selftest.ok',
  'mic-missing': 'selftest.micMissing',
  'mic-silent': 'selftest.micSilent',
  'system-missing': 'selftest.systemMissing',
  'system-silent': 'selftest.systemSilent',
}
import { alertText } from './alertText'

/**
 * Danh sách chỉ cuộn theo khi người dùng đang ở cuối. Kéo lên đọc lại một câu mà bị giật xuống
 * mỗi lần có phụ đề mới thì không đọc nổi.
 */
function LiveCaptions({ captions, t }: { captions: LiveCaption[]; t: Translator }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    const box = boxRef.current
    if (box && stickRef.current) box.scrollTop = box.scrollHeight
  }, [captions])

  return (
    <div
      className="live-box"
      ref={boxRef}
      onScroll={(e) => {
        const el = e.currentTarget
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
      }}
      aria-live="polite"
    >
      {captions.map((c) => (
        <div key={c.id} className={`live-line ${c.speaker}`}>
          <span className="live-who">{t(c.speaker === 'me' ? 'speaker.me' : 'speaker.them')}</span>
          <span className="live-text">
            {c.translated ?? c.text}
            {c.translated && <span className="live-original">{c.text}</span>}
            {c.pending && <span className="muted"> {t('live.pending')}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100)
  const color = pct > 85 ? 'var(--rec)' : pct > 3 ? 'var(--ok)' : 'var(--line)'
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <div className="meter-bar" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="meter-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export function RecordView({ settings, onSettings }: { settings: Settings; onSettings: (p: Partial<Settings>) => void }) {
  const t: Translator = useT()
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<SelfTestOutcome | null>(null)
  const [copied, setCopied] = useState(false)
  const [mics, setMics] = useState<{ deviceId: string; label: string }[]>([])
  const r = useRecorder({
    quality: settings.quality,
    micDeviceId: settings.micDeviceId,
    language: settings.language,
    playConsent: settings.playConsentNotice,
    hideWhileRecording: settings.hideWhileRecording,
    liveCaptions: settings.liveCaptions,
    liveTarget: settings.liveTarget,
    liveModel: settings.liveModel,
  })

  const refreshSources = () => void window.callrec.sources.list().then(setSources)

  const selfTest = async () => {
    setTesting(true)
    setTestResult(null)
    setCopied(false)
    try {
      setTestResult(await runSelfTest(settings.micDeviceId))
    } finally {
      setTesting(false)
    }
  }

  const copyDiagnostics = async () => {
    if (!testResult) return
    const { currentVersion } = await window.callrec.update.get()
    await navigator.clipboard.writeText(
      formatReport({ version: currentVersion, platform: navigator.userAgent, ...testResult }),
    )
    setCopied(true)
  }

  useEffect(() => {
    refreshSources()
    const reload = () => void listMics().then(setMics)
    reload()
    navigator.mediaDevices.addEventListener('devicechange', reload)
    return () => navigator.mediaDevices.removeEventListener('devicechange', reload)
  }, [])

  const { state } = r.ctx
  const recording = state === 'recording' || state === 'paused'

  return (
    <div className="col" style={{ gap: 18 }}>
      {r.alerts.map((a, i) => (
        <div key={`${a.kind}-${a.stream ?? ''}-${i}`} className={`alert${a.kind === 'stream-error' ? ' error' : ''}`}>
          <span>{alertText(t, a)}</span>
          <button className="ghost" onClick={() => r.dismissAlert(i)} aria-label={t('record.dismissAlert')}>✕</button>
        </div>
      ))}

      <div className="panel col">
        <div className="row spread">
          <strong>{t(recording ? 'record.recording' : 'record.pickSource')}</strong>
          <button className="ghost" onClick={refreshSources} disabled={recording}>{t('record.refresh')}</button>
        </div>

        {!recording && (
          <div className="grid-sources">
            {sources.map((s) => (
              <button
                key={s.id}
                className="source"
                aria-pressed={r.ctx.sourceId === s.id}
                onClick={() => void r.selectSource(s.id)}
              >
                <img src={s.thumbnailDataUrl} alt="" />
                <span title={s.name}>{s.name}</span>
              </button>
            ))}
            {sources.length === 0 && <p className="muted">{t('record.noSources')}</p>}
          </div>
        )}
      </div>

      <div className="panel col">
        <div className="row spread">
          <span className="clock">{formatDuration(r.elapsed)}</span>
          <div className="row">
            {!recording && (
              <button className="danger" onClick={() => void r.start()} disabled={!r.canStart}>
                {t('record.start')}
              </button>
            )}
            {recording && (
              <>
                <button onClick={r.pause}>{t(state === 'paused' ? 'record.resume' : 'record.pause')}</button>
                <button onClick={() => void r.bookmark()}>{t('record.bookmark')}</button>
                <button onClick={() => void window.callrec.window.hide()}>{t('record.minimize')}</button>
                <button className="danger" onClick={() => void r.stop()}>{t('record.stop')}</button>
              </>
            )}
          </div>
        </div>

        {recording && <span className="muted" style={{ fontSize: 12 }}>{t('record.backgroundHint')}</span>}

        <Meter label={t('record.meterMe')} value={r.levels.mic} />
        <Meter label={t('record.meterThem')} value={r.levels.system} />

        {/* Đặt ngay dưới hai thanh mức âm vì đây đúng là chỗ người dùng sinh nghi khi thấy chúng phẳng. */}
        {!recording && (
          <div className="col" style={{ gap: 8 }}>
            <div className="row">
              <button onClick={() => void selfTest()} disabled={testing}>{t('selftest.run')}</button>
              {testResult && (
                <button className="ghost" onClick={() => void copyDiagnostics()}>
                  {copied ? t('selftest.copied') : t('selftest.copy')}
                </button>
              )}
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              {testing ? t('selftest.running') : t('selftest.hint')}
            </span>
            {testResult?.verdicts.map((v) => (
              <div key={v} className={v === 'ok' ? 'alert' : 'alert error'}>
                <span>{t(VERDICT_KEY[v])}</span>
              </div>
            ))}
          </div>
        )}

        {state === 'finalizing' && (
          <p className="muted">{t('record.exporting', { percent: r.progress?.percent ?? 0 })}</p>
        )}
        {state === 'error' && (
          <div className="alert error">
            <span>{r.ctx.error === 'record.exportFailed' ? t('record.exportFailed') : r.ctx.error}</span>
            <button className="ghost" onClick={r.reset}>{t('app.close')}</button>
          </div>
        )}
        {state === 'done' && r.lastRecording && (
          <div className="alert">
            <span>{t('record.saved', { title: r.lastRecording.title })}</span>
            <button className="ghost" onClick={() => void window.callrec.library.reveal(r.lastRecording!.id)}>
              {t('record.openFolder')}
            </button>
          </div>
        )}
      </div>

      <div className="panel col">
        <div className="row spread">
          <strong>{t('live.title')}</strong>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.liveCaptions}
            disabled={recording}
            onChange={(e) => onSettings({ liveCaptions: e.target.checked })}
          />
          <span>
            {t('live.enable')}
            <br />
            <span className="muted">{t('live.hint')}</span>
          </span>
        </label>

        {settings.liveCaptions && (
          <div className="field">
            <label htmlFor="live-target">{t('live.target')}</label>
            <select
              id="live-target"
              value={settings.liveTarget}
              disabled={recording}
              onChange={(e) => onSettings({ liveTarget: e.target.value })}
            >
              <option value="">{t('live.targetOff')}</option>
              {TARGET_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {t(l.code === LIVE_TARGET_LOCAL ? 'live.targetLocal' : 'live.targetCloud', { lang: l.label })}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Nói trước khi bấm ghi, chứ để tới lúc bắt đầu ghi mới báo là đã lỡ mất đoạn đầu. */}
        {settings.liveCaptions && liveTargetMode(settings.liveTarget) === 'cloud' && !settings.allowCloudSummary && (
          <div className="alert">
            <span>{t('live.cloudOff')}</span>
          </div>
        )}

        {r.liveOn && r.captions.length === 0 && <p className="muted">{t('live.waiting')}</p>}
        {r.captions.length > 0 && <LiveCaptions captions={r.captions} t={t} />}
        {!r.liveOn && r.captions.length === 0 && !settings.liveCaptions && (
          <p className="muted">{t('live.off')}</p>
        )}
      </div>

      <div className="panel col">
        <div className="field">
          <label htmlFor="mic">{t('record.mic')}</label>
          <select
            id="mic"
            value={settings.micDeviceId ?? ''}
            disabled={recording}
            onChange={(e) => onSettings({ micDeviceId: e.target.value || null })}
          >
            <option value="">{t('record.defaultDevice')}</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="quality">{t('record.quality')}</label>
          <select
            id="quality"
            value={settings.quality}
            disabled={recording}
            onChange={(e) => onSettings({ quality: e.target.value as Settings['quality'] })}
          >
            <option value="audio-only">{t('record.quality.audio')}</option>
            <option value="720p30">{t('record.quality.720')}</option>
            <option value="1080p30">{t('record.quality.1080')}</option>
            <option value="1080p60">{t('record.quality.1080_60')}</option>
          </select>
        </div>
      </div>
    </div>
  )
}
