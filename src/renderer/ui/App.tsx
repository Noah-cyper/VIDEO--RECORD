import { useCallback, useEffect, useState } from 'react'
import type { SessionManifest, Settings } from '@shared/types'
import type { PermissionStatus, UpdateStatus } from '@shared/ipc'
import { RecordView } from './RecordView'
import { LibraryView } from './LibraryView'
import { SettingsView } from './SettingsView'
import { LangProvider, useT } from './i18n'
import { translate, type TranslationKey } from '@shared/i18n'

type Tab = 'record' | 'library' | 'settings'

const TABS: { id: Tab; labelKey: TranslationKey }[] = [
  { id: 'record', labelKey: 'tab.record' },
  { id: 'library', labelKey: 'tab.library' },
  { id: 'settings', labelKey: 'tab.settings' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('record')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null)
  const [orphans, setOrphans] = useState<SessionManifest[]>([])
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    void window.callrec.settings.get().then(setSettings)
    void window.callrec.permissions.check().then(setPermissions)
    void window.callrec.session.orphans().then(setOrphans)
    const offOrphans = window.callrec.onOrphans(setOrphans)
    const offUpdate = window.callrec.update.onStatus(setUpdate)
    return () => {
      offOrphans()
      offUpdate()
    }
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
    if (!window.confirm(translate(settings?.language ?? 'vi', 'orphan.confirmDiscard'))) return
    await window.callrec.session.discard(m.id)
    setOrphans((prev) => prev.filter((o) => o.id !== m.id))
  }

  // Chờ có settings mới dựng cây: LangProvider phải biết ngôn ngữ trước khi con nó gọi useT.
  if (!settings) return <div className="content muted">…</div>

  return (
    <LangProvider lang={settings.language}>
      <Shell
        tab={tab}
        setTab={setTab}
        settings={settings}
        permissions={permissions}
        orphans={orphans}
        update={update}
        updateError={updateError}
        setUpdateError={setUpdateError}
        patchSettings={patchSettings}
        setPermissions={setPermissions}
        recoverOrphan={recoverOrphan}
        discardOrphan={discardOrphan}
      />
    </LangProvider>
  )
}

function Shell({
  tab, setTab, settings, permissions, orphans, update, updateError,
  setUpdateError, patchSettings, setPermissions, recoverOrphan, discardOrphan,
}: {
  tab: Tab
  setTab: (t: Tab) => void
  settings: Settings
  permissions: PermissionStatus | null
  orphans: SessionManifest[]
  update: UpdateStatus | null
  updateError: string | null
  setUpdateError: (v: string | null) => void
  patchSettings: (patch: Partial<Settings>) => void
  setPermissions: (p: PermissionStatus) => void
  recoverOrphan: (m: SessionManifest) => Promise<void>
  discardOrphan: (m: SessionManifest) => Promise<void>
}) {
  const t = useT()

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map((tab_) => (
          <button key={tab_.id} aria-current={tab === tab_.id} onClick={() => setTab(tab_.id)}>
            {t(tab_.labelKey)}
          </button>
        ))}
      </nav>

      <div className="content col" style={{ gap: 18 }}>
        {update?.state === 'downloaded' && (
          <div className="alert">
            <span>
              {t('update.downloaded', { version: update.version ?? '' })}
              {updateError ? ` ${updateError}` : ''}
            </span>
            <button
              onClick={() =>
                void window.callrec.update.install().then((r) => setUpdateError(r.ok ? null : (r.reason ?? null)))
              }
            >
              {t('update.installNow')}
            </button>
          </div>
        )}
        {orphans.map((m) => (
          <div key={m.id} className="alert">
            <span>{t('orphan.found', { when: new Date(m.startedAt).toLocaleString() })}</span>
            <div className="row">
              <button onClick={() => void recoverOrphan(m)}>{t('orphan.export')}</button>
              <button className="ghost" onClick={() => void discardOrphan(m)}>{t('orphan.discard')}</button>
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
