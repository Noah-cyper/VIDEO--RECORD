import { app } from 'electron'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { readJson, writeJson } from './jsonstore'
import { isUsableRecordingsDir } from './paths'

const file = () => join(app.getPath('userData'), 'settings.json')

function defaults(): Settings {
  return {
    recordingsDir: join(app.getPath('videos'), 'CallRec'),
    quality: '1080p30',
    whisperModel: 'small',
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
  const current = await getSettings()
  // Thư mục bản ghi vừa là nơi ghi file vừa là biên của scheme phát lại; nhận bừa một chuỗi từ
  // renderer là mở đường đọc/xoá ngoài phạm vi.
  if (patch.recordingsDir !== undefined && !isUsableRecordingsDir(patch.recordingsDir)) {
    throw new Error('Thư mục lưu bản ghi không hợp lệ')
  }
  const next = { ...current, ...patch }
  // Gửi nội dung cuộc gọi ra ngoài phải là hành động có ý thức, không bật ngầm được (NFR-06).
  if (patch.allowCloudSummary === undefined) next.allowCloudSummary = current.allowCloudSummary
  cache = next
  await writeJson(file(), next)
  return next
}
