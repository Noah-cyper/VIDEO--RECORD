import { app } from 'electron'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { readJson, writeJson } from './jsonstore'

const file = () => join(app.getPath('userData'), 'settings.json')

function defaults(): Settings {
  return {
    recordingsDir: join(app.getPath('videos'), 'CallRec'),
    quality: '1080p30',
    micDeviceId: null,
    language: 'vi',
    playConsentNotice: true,
    allowCloudSummary: false,
  }
}

let cache: Settings | null = null

export async function getSettings(): Promise<Settings> {
  if (!cache) cache = { ...defaults(), ...(await readJson<Partial<Settings>>(file(), {})) }
  return cache
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  // Gửi nội dung cuộc gọi ra ngoài phải là hành động có ý thức, không bật ngầm được (NFR-06).
  if (patch.allowCloudSummary === undefined) next.allowCloudSummary = (await getSettings()).allowCloudSummary
  cache = next
  await writeJson(file(), next)
  return next
}
