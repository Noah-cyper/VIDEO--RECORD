import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import type { PermissionStatus, WhisperStatus } from '@shared/ipc'
import { WHISPER_MODELS, type WhisperModelName } from '@shared/whisper'

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
  const [whisper, setWhisper] = useState<WhisperStatus | null>(null)
  const [apiKey, setApiKeyInput] = useState('')
  const [crashes, setCrashes] = useState(0)

  useEffect(() => {
    void window.callrec.whisper.status().then(setWhisper)
    void window.callrec.crash.count().then(setCrashes)
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
        <strong>Trách nhiệm khi ghi cuộc gọi.</strong> Luật về ghi âm khác nhau theo từng nơi, và nhiều nơi
        yêu cầu <em>tất cả</em> các bên phải đồng ý chứ không chỉ người bấm nút ghi. CallRec luôn hiển thị
        chỉ báo đang ghi và không có chế độ ghi ẩn. Việc xin phép những người còn lại trong cuộc gọi
        thuộc trách nhiệm của bạn.
      </div>

      <div className="panel col">
        <strong>Quyền hệ thống</strong>
        {permissions ? (
          <>
            <p className="muted">Microphone: {permissions.microphone} · Ghi màn hình: {permissions.screen}</p>
            {permissions.needsRestart && (
              <div className="alert">
                <span>Quyền ghi màn hình chỉ có hiệu lực sau khi khởi động lại CallRec.</span>
              </div>
            )}
          </>
        ) : (
          <p className="muted">Đang kiểm tra…</p>
        )}
        <div className="row">
          <button onClick={onRequestPermissions}>Cấp quyền</button>
        </div>
      </div>

      <div className="panel col">
        <div className="field">
          <label>Thư mục lưu bản ghi</label>
          <div className="row">
            <input readOnly value={settings.recordingsDir} />
            <button onClick={() => void pickDir()}>Chọn…</button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="lang">Ngôn ngữ</label>
          <select id="lang" value={settings.language} onChange={(e) => onSettings({ language: e.target.value as 'vi' | 'en' })}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.playConsentNotice}
            onChange={(e) => onSettings({ playConsentNotice: e.target.checked })}
          />
          <span>
            Phát câu thông báo &ldquo;Cuộc gọi này đang được ghi lại&rdquo; khi bắt đầu ghi.
            <br />
            <span className="muted">Câu này phát ra loa nên nằm luôn trong bản ghi, làm bằng chứng đã thông báo.</span>
          </span>
        </label>

        <div className="field">
          <label htmlFor="whisper-model">Model gỡ băng</label>
          <select
            id="whisper-model"
            value={settings.whisperModel}
            onChange={(e) => onSettings({ whisperModel: e.target.value as WhisperModelName })}
          >
            {(Object.keys(WHISPER_MODELS) as WhisperModelName[]).map((name) => (
              <option key={name} value={name}>
                {WHISPER_MODELS[name].label} — {WHISPER_MODELS[name].sizeMb} MB
                {whisper?.installedModels.includes(name) ? ' (đã tải)' : ''}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>
            {whisper?.binaryAvailable
              ? 'Model tự tải về lần đầu dùng và lưu lại cho những lần sau.'
              : 'Chưa tìm thấy whisper.cpp — xem hướng dẫn cài ở docs/06-transcript.md.'}
          </span>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.allowCloudSummary}
            onChange={(e) => onSettings({ allowCloudSummary: e.target.checked })}
          />
          <span>
            Cho phép gửi transcript tới dịch vụ tóm tắt bên ngoài.
            <br />
            <span className="muted">
              Mặc định tắt. Bật lên nghĩa là nội dung cuộc gọi — gồm cả lời của người khác — sẽ rời khỏi máy này.
            </span>
          </span>
        </label>

        {settings.allowCloudSummary && (
          <div className="field">
            <label htmlFor="api-key">Khoá API Anthropic</label>
            {whisper?.secureStorageAvailable === false ? (
              <div className="alert error">
                <span>
                  Hệ điều hành này không cung cấp kho khoá an toàn, nên CallRec từ chối lưu khoá API.
                  Tóm tắt qua API sẽ không dùng được.
                </span>
              </div>
            ) : (
              <>
                <div className="row">
                  <input
                    id="api-key"
                    type="password"
                    placeholder={whisper?.apiKeyConfigured ? 'Đã lưu một khoá' : 'sk-ant-...'}
                    value={apiKey}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                  />
                  <button onClick={() => void saveApiKey()} disabled={!apiKey.trim()}>Lưu</button>
                  {whisper?.apiKeyConfigured && (
                    <button
                      className="ghost"
                      onClick={() => void window.callrec.settings.clearApiKey().then(setWhisper)}
                    >
                      Xoá
                    </button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Khoá được mã hoá bằng kho khoá của hệ điều hành và không bao giờ được gửi ngược
                  về phần giao diện.
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="panel col">
        <strong>Báo lỗi</strong>
        <p className="muted">
          CallRec thu thập crash dump nhưng <b>không gửi đi đâu cả</b>. Một crash dump có thể chứa
          mảnh bộ nhớ của bản ghi đang mở, nên nó nằm nguyên trên máy này. Muốn gửi cho người phát
          triển thì bạn tự mở thư mục và tự quyết định gửi file nào.
        </p>
        <div className="row">
          <span className="muted">{crashes > 0 ? `Có ${crashes} báo cáo sự cố` : 'Chưa có báo cáo sự cố nào'}</span>
          <button onClick={() => void window.callrec.crash.open()} disabled={crashes === 0}>Mở thư mục</button>
          <button
            className="ghost"
            onClick={() => void window.callrec.crash.clear().then(() => setCrashes(0))}
            disabled={crashes === 0}
          >
            Xoá hết
          </button>
        </div>
      </div>
    </div>
  )
}
