import type { Settings } from '@shared/types'
import type { PermissionStatus } from '@shared/ipc'

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
      </div>
    </div>
  )
}
