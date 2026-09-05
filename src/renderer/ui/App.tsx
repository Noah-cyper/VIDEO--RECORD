import { useCallback, useEffect, useState } from 'react'
import type { SessionManifest, Settings } from '@shared/types'
import type { PermissionStatus } from '@shared/ipc'
import { RecordView } from './RecordView'
import { LibraryView } from './LibraryView'
import { SettingsView } from './SettingsView'

type Tab = 'record' | 'library' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'record', label: 'Ghi' },
  { id: 'library', label: 'Thư viện' },
  { id: 'settings', label: 'Cài đặt' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('record')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null)
  const [orphans, setOrphans] = useState<SessionManifest[]>([])

  useEffect(() => {
    void window.callrec.settings.get().then(setSettings)
    void window.callrec.permissions.check().then(setPermissions)
    void window.callrec.session.orphans().then(setOrphans)
    return window.callrec.onOrphans(setOrphans)
  }, [])

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    void window.callrec.settings.set(patch).then(setSettings)
  }, [])

  const recoverOrphan = async (m: SessionManifest) => {
    const started = new Date(m.startedAt).getTime()
    const ended = m.endedAt ? new Date(m.endedAt).getTime() : Date.now()
    await window.callrec.exportRecording.start(m.id, Math.max(0, ended - started))
    setOrphans((prev) => prev.filter((o) => o.id !== m.id))
  }

  const discardOrphan = async (m: SessionManifest) => {
    if (!window.confirm('Xoá hẳn phần đã ghi của phiên này?')) return
    await window.callrec.session.discard(m.id)
    setOrphans((prev) => prev.filter((o) => o.id !== m.id))
  }

  if (!settings) return <div className="content muted">Đang tải…</div>

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="content col" style={{ gap: 18 }}>
        {orphans.map((m) => (
          <div key={m.id} className="alert">
            <span>
              Phiên ghi ngày {new Date(m.startedAt).toLocaleString('vi-VN')} chưa được xuất file — có thể ứng dụng
              đã bị đóng đột ngột. Phần đã ghi vẫn còn.
            </span>
            <div className="row">
              <button onClick={() => void recoverOrphan(m)}>Xuất file</button>
              <button className="ghost" onClick={() => void discardOrphan(m)}>Bỏ</button>
            </div>
          </div>
        ))}

        {tab === 'record' && <RecordView settings={settings} onSettings={patchSettings} />}
        {tab === 'library' && <LibraryView settings={settings} />}
        {tab === 'settings' && (
          <SettingsView
            settings={settings}
            permissions={permissions}
            onSettings={patchSettings}
            onRequestPermissions={() => void window.callrec.permissions.request().then(setPermissions)}
          />
        )}
      </div>
    </div>
  )
}
