import { app } from 'electron'
import { promises as fs } from 'node:fs'
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

async function assertWritable(dir: string): Promise<void> {
  const probe = join(dir, '.callrec-write-test')
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(probe, '')
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Không ghi được vào thư mục này: ${reason}`)
  } finally {
    await fs.rm(probe, { force: true }).catch(() => undefined)
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
  if (patch.recordingsDir !== undefined) {
    if (!isUsableRecordingsDir(patch.recordingsDir)) {
      throw new Error(`Đường dẫn không dùng được: ${String(patch.recordingsDir)}`)
    }
    // Tạo và thử ghi thật. Thư mục chỉ-đọc hay ổ mạng đã ngắt sẽ lộ ra NGAY ở đây, thay vì
    // im lặng cho tới lúc người dùng ghi xong một cuộc gọi rồi mới hỏng ở bước xuất file.
    await assertWritable(patch.recordingsDir)
  }
  const next = { ...current, ...patch }
  // Gửi nội dung cuộc gọi ra ngoài phải là hành động có ý thức, không bật ngầm được (NFR-06).
  if (patch.allowCloudSummary === undefined) next.allowCloudSummary = current.allowCloudSummary
  cache = next
  await writeJson(file(), next)
  return next
}
