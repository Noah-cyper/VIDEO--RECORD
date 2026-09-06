import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import type { PermissionStatus, UpdateStatus, WhisperStatus } from '@shared/ipc'
import { WHISPER_MODELS, type WhisperModelName } from '@shared/whisper'
import { useT } from './i18n'

function UpdateLine({ update }: { update: UpdateStatus }) {
  const t = useT()
  const version = update.version ?? ''
  switch (update.state) {
    case 'checking':
      return <p className="muted">{t('update.checking')}</p>
    case 'available':
      return <p className="muted">{t('update.available', { version })}</p>
    case 'downloading':
      return <p className="muted">{t('update.downloading', { version, percent: update.percent ?? 0 })}</p>
    case 'downloaded':
      return <p className="muted">{t('update.readyToInstall', { version })}</p>
    case 'not-available':
      return <p className="muted">{t('update.upToDate')}</p>
    case 'unsupported':
      return <p className="muted">{t('update.unsupported')}</p>
    case 'error':
      return (
        <div className="alert error">
          <span style={{ whiteSpace: 'pre-wrap' }}>{t('update.failed', { reason: update.message ?? '' })}</span>
        </div>
      )
    default:
      return <p className="muted">{t('update.idle')}</p>
  }
}

export function SettingsView({
  settings,
  permissions,
  onSettings,
  onRequestPermissions,
}: {
  settings: Settings
  permissions: PermissionStatus | null
  onSettings: (patch: Partial<Settings>) => void
  onRequestPermissions: () => void
}) {
  const t = useT()
  const [whisper, setWhisper] = useState<WhisperStatus | null>(null)
  const [apiKey, setApiKeyInput] = useState('')
  const [crashes, setCrashes] = useState(0)
  const [dirDraft, setDirDraft] = useState(settings.recordingsDir)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)

  useEffect(() => setDirDraft(settings.recordingsDir), [settings.recordingsDir])

  useEffect(() => {
    void window.callrec.whisper.status().then(setWhisper)
    void window.callrec.crash.count().then(setCrashes)
    void window.callrec.update.get().then(setUpdate)
    void window.callrec.ffmpeg.available().then(setFfmpegOk)
    return window.callrec.update.onStatus(setUpdate)
  }, [])

  const saveApiKey = async () => {
    setWhisper(await window.callrec.settings.setApiKey(apiKey))
    setApiKeyInput('')
  }

  const pickDir = async () => {
    const dir = await window.callrec.settings.pickDir()
    if (dir) onSettings({ recordingsDir: dir })
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="notice">
        <strong>{t('settings.legal.title')}</strong> {t('settings.legal.body')}
      </div>

      <div className="panel col">
        <strong>{t('settings.permissions')}</strong>
        {!permissions ? (
          <p className="muted">{t('settings.checking')}</p>
        ) : !permissions.managed ? (
          // Nút "Cấp quyền" ở đây từng là nút không làm gì trên Windows - thà nói thẳng.
          <p className="muted">{t('settings.permissionsNotNeeded')}</p>
        ) : (
          <>
            <p className="muted">
              {t('settings.permissionsState', { mic: permissions.microphone, screen: permissions.screen })}
            </p>
            {permissions.needsRestart && (
              <div className="alert">
                <span>{t('settings.needsRestart')}</span>
              </div>
            )}
            <div className="row">
              <button onClick={onRequestPermissions}>{t('settings.grant')}</button>
            </div>
          </>
        )}
      </div>

      <div className="panel col">
        <div className="field">
          <label>{t('settings.folder')}</label>
          <div className="row">
            <input
              id="rec-dir"
              value={dirDraft}
              onChange={(e) => setDirDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSettings({ recordingsDir: dirDraft })}
            />
            <button onClick={() => void pickDir()}>{t('app.choose')}</button>
            <button
              disabled={dirDraft.trim() === '' || dirDraft === settings.recordingsDir}
              onClick={() => onSettings({ recordingsDir: dirDraft })}
            >
              {t('app.apply')}
            </button>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>{t('settings.folderHint')}</span>
        </div>

        <div className="field">
          <label htmlFor="lang">{t('settings.language')}</label>
          <select id="lang" value={settings.language} onChange={(e) => onSettings({ language: e.target.value as 'vi' | 'en' })}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="field">
          <label>{t('settings.modelsOnDisk')}</label>
          {whisper && whisper.installedModels.length > 0 ? (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {whisper.installedModels.map((name) => (
                <button
                  key={name}
                  className="ghost"
                  onClick={() => void window.callrec.whisper.removeModel(name).then(setWhisper)}
                >
                  {t('settings.deleteModel', { name, size: WHISPER_MODELS[name].sizeMb })}
                </button>
              ))}
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>{t('settings.modelsNone')}</span>
          )}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.hideWhileRecording}
            onChange={(e) => onSettings({ hideWhileRecording: e.target.checked })}
          />
          <span>
            {t('settings.hideWhileRecording')}
            <br />
            <span className="muted">{t('settings.hideWhileRecordingHint')}</span>
          </span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.playConsentNotice}
            onChange={(e) => onSettings({ playConsentNotice: e.target.checked })}
          />
          <span>
            {t('settings.consent')}
            <br />
            <span className="muted">{t('settings.consentHint')}</span>
          </span>
        </label>

        <div className="field">
          <label htmlFor="whisper-model">{t('settings.whisperModel')}</label>
          <select
            id="whisper-model"
            value={settings.whisperModel}
            onChange={(e) => onSettings({ whisperModel: e.target.value as WhisperModelName })}
          >
            {(Object.keys(WHISPER_MODELS) as WhisperModelName[]).map((name) => (
              <option key={name} value={name}>
                {WHISPER_MODELS[name].label} — {WHISPER_MODELS[name].sizeMb} MB
                {whisper?.installedModels.includes(name) ? ` (${t('settings.modelDownloaded')})` : ''}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>
            {t(whisper?.binaryAvailable ? 'settings.modelHint' : 'settings.modelNoBinary')}
          </span>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.allowCloudSummary}
            onChange={(e) => onSettings({ allowCloudSummary: e.target.checked })}
          />
          <span>
            {t('settings.cloud')}
            <br />
            <span className="muted">{t('settings.cloudHint')}</span>
          </span>
        </label>

        {settings.allowCloudSummary && (
          <div className="field">
            <label htmlFor="api-key">{t('settings.apiKey')}</label>
            {whisper?.secureStorageAvailable === false ? (
              <div className="alert error">
                <span>{t('settings.noSecureStorage')}</span>
              </div>
            ) : (
              <>
                <div className="row">
                  <input
                    id="api-key"
                    type="password"
                    placeholder={whisper?.apiKeyConfigured ? t('settings.apiKeySaved') : 'sk-ant-...'}
                    value={apiKey}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                  />
                  <button onClick={() => void saveApiKey()} disabled={!apiKey.trim()}>{t('app.save')}</button>
                  {whisper?.apiKeyConfigured && (
                    <button
                      className="ghost"
                      onClick={() => void window.callrec.settings.clearApiKey().then(setWhisper)}
                    >
                      {t('app.delete')}
                    </button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{t('settings.apiKeyHint')}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="panel col">
        <strong>{t('settings.tools')}</strong>
        {/* FFmpeg thiếu là hỏng cả việc ghi; whisper thiếu chỉ hỏng gỡ băng. Phân biệt rõ hai mức. */}
        {ffmpegOk === null ? (
          <p className="muted">{t('settings.checking')}</p>
        ) : ffmpegOk ? (
          <p className="muted">{t('settings.ffmpegOk')}</p>
        ) : (
          <div className="alert error"><span>{t('settings.ffmpegMissing')}</span></div>
        )}
        <p className="muted">
          {t(whisper?.binaryAvailable ? 'settings.whisperOk' : 'settings.whisperMissing')}
        </p>
      </div>

      <div className="panel col">
        <strong>{t('update.title')}</strong>
        <p className="muted">{t('update.current', { version: update?.currentVersion ?? '…' })}</p>

        {update && <UpdateLine update={update} />}

        {update?.state === 'downloading' && (
          <div className="meter-bar">
            <div className="meter-fill" style={{ width: `${update.percent ?? 0}%`, background: 'var(--accent)' }} />
          </div>
        )}

        {installError && <div className="alert error"><span>{installError}</span></div>}

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            onClick={() => void window.callrec.update.check().then(setUpdate)}
            disabled={update?.state === 'checking' || update?.state === 'downloading'}
          >
            {t('update.check')}
          </button>
          {update?.state === 'downloaded' && (
            <button
              className="primary"
              disabled={!update.canInstall}
              onClick={() =>
                void window.callrec.update.install().then((r) => setInstallError(r.ok ? null : (r.reason ?? null)))
              }
            >
              {t('update.install')}
            </button>
          )}
          <button className="ghost" onClick={() => void window.callrec.update.openPage()}>
            {t('update.openPage')}
          </button>
        </div>
        {update?.state === 'downloaded' && update.busyRecording && (
          <span className="muted" style={{ fontSize: 12 }}>{t('update.installBusy')}</span>
        )}
      </div>

      <div className="panel col">
        <strong>{t('settings.crash')}</strong>
        <p className="muted">{t('settings.crashBody')}</p>
        <div className="row">
          <span className="muted">
            {crashes > 0 ? t('settings.crashCount', { count: crashes }) : t('settings.crashNone')}
          </span>
          <button onClick={() => void window.callrec.crash.open()} disabled={crashes === 0}>
            {t('settings.crashOpen')}
          </button>
          <button
            className="ghost"
            onClick={() => void window.callrec.crash.clear().then(() => setCrashes(0))}
            disabled={crashes === 0}
          >
            {t('settings.crashClear')}
          </button>
        </div>
      </div>
    </div>
  )
}
