import { useEffect, useState } from 'react'
import type { CaptureSource, Settings } from '@shared/types'
import { formatDuration } from '@shared/naming'
import { listMics } from '../capture/engine'
import { useRecorder } from '../state/useRecorder'

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
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [mics, setMics] = useState<{ deviceId: string; label: string }[]>([])
  const r = useRecorder({
    quality: settings.quality,
    micDeviceId: settings.micDeviceId,
    language: settings.language,
    playConsent: settings.playConsentNotice,
  })

  const refreshSources = () => void window.callrec.sources.list().then(setSources)

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
          <span>{a.message}</span>
          <button className="ghost" onClick={() => r.dismissAlert(i)} aria-label="Đóng cảnh báo">✕</button>
        </div>
      ))}

      <div className="panel col">
        <div className="row spread">
          <strong>{recording ? 'Đang ghi' : 'Chọn nguồn cần ghi'}</strong>
          <button className="ghost" onClick={refreshSources} disabled={recording}>Làm mới</button>
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
            {sources.length === 0 && <p className="muted">Chưa thấy nguồn nào. Cấp quyền ghi màn hình rồi bấm Làm mới.</p>}
          </div>
        )}
      </div>

      <div className="panel col">
        <div className="row spread">
          <span className="clock">{formatDuration(r.elapsed)}</span>
          <div className="row">
            {!recording && (
              <button className="danger" onClick={() => void r.start()} disabled={!r.canStart}>
                Bắt đầu ghi
              </button>
            )}
            {recording && (
              <>
                <button onClick={r.pause}>{state === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}</button>
                <button onClick={() => void r.bookmark()}>Đánh dấu mốc</button>
                <button className="danger" onClick={() => void r.stop()}>Dừng</button>
              </>
            )}
          </div>
        </div>

        <Meter label="Tôi (micro)" value={r.levels.mic} />
        <Meter label="Đối phương" value={r.levels.system} />

        {state === 'finalizing' && (
          <p className="muted">Đang xuất file… {r.progress?.percent ?? 0}%</p>
        )}
        {state === 'error' && (
          <div className="alert error">
            <span>{r.ctx.error}</span>
            <button className="ghost" onClick={r.reset}>Đóng</button>
          </div>
        )}
        {state === 'done' && r.lastRecording && (
          <div className="alert">
            <span>Đã lưu: {r.lastRecording.title}</span>
            <button className="ghost" onClick={() => void window.callrec.library.reveal(r.lastRecording!.id)}>
              Mở thư mục
            </button>
          </div>
        )}
      </div>

      <div className="panel col">
        <div className="field">
          <label htmlFor="mic">Microphone</label>
          <select
            id="mic"
            value={settings.micDeviceId ?? ''}
            disabled={recording}
            onChange={(e) => onSettings({ micDeviceId: e.target.value || null })}
          >
            <option value="">Thiết bị mặc định</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="quality">Chất lượng</label>
          <select
            id="quality"
            value={settings.quality}
            disabled={recording}
            onChange={(e) => onSettings({ quality: e.target.value as Settings['quality'] })}
          >
            <option value="audio-only">Chỉ ghi tiếng (~115 MB/giờ)</option>
            <option value="720p30">720p30 (~320 MB/giờ)</option>
            <option value="1080p30">1080p30 (~500 MB/giờ)</option>
            <option value="1080p60">1080p60 (~850 MB/giờ)</option>
          </select>
        </div>
      </div>
    </div>
  )
}
