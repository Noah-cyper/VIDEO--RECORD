import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { WHISPER_MODELS } from '@shared/whisper'
import { TARGET_LANGUAGES } from '@shared/translate'
import { readJson, writeJson } from './jsonstore'
import { isUsableRecordingsDir, normalizeRecordingsDir } from './paths'

const file = () => join(app.getPath('userData'), 'settings.json')

function defaults(): Settings {
  return {
    recordingsDir: join(app.getPath('videos'), 'CallRec'),
    quality: '1080p30',
    whisperModel: 'small',
    micDeviceId: null,
    language: 'vi',
    playConsentNotice: true,
    hideWhileRecording: true,
    autoInstallUpdates: true,
    allowCloudSummary: false,
    liveCaptions: false,
    liveTarget: '',
    liveModel: 'tiny',
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
  const next = { ...current, ...patch }
  if (patch.recordingsDir !== undefined) {
    if (!isUsableRecordingsDir(patch.recordingsDir)) {
      throw new Error(
        `Đường dẫn không dùng được: "${String(patch.recordingsDir)}". Cần một đường dẫn tuyệt đối, ví dụ D:\\CallRec.`,
      )
    }
    // Gốc ổ đĩa được đưa vào thư mục con thay vì bị từ chối; giá trị lưu lại là giá trị đã chuẩn hoá.
    next.recordingsDir = normalizeRecordingsDir(patch.recordingsDir.trim())
    // Tạo và thử ghi thật. Thư mục chỉ-đọc hay ổ mạng đã ngắt sẽ lộ ra NGAY ở đây, thay vì
    // im lặng cho tới lúc người dùng ghi xong một cuộc gọi rồi mới hỏng ở bước xuất file.
    await assertWritable(next.recordingsDir)
  }
  // Mã ngôn ngữ đích của phụ đề đi thẳng vào prompt gửi ra dịch vụ ngoài; chỉ nhận mã app tự khai.
  if (patch.liveTarget !== undefined && patch.liveTarget !== '') {
    if (!TARGET_LANGUAGES.some((l) => l.code === patch.liveTarget)) {
      throw new Error(`Ngôn ngữ phụ đề không hợp lệ: ${JSON.stringify(patch.liveTarget)}`)
    }
  }
  if (patch.liveModel !== undefined && !(patch.liveModel in WHISPER_MODELS)) {
    throw new Error(`Model phụ đề không hợp lệ: ${JSON.stringify(patch.liveModel)}`)
  }
  // Gửi nội dung cuộc gọi ra ngoài phải là hành động có ý thức, không bật ngầm được (NFR-06).
  if (patch.allowCloudSummary === undefined) next.allowCloudSummary = current.allowCloudSummary
  cache = next
  await writeJson(file(), next)
  return next
}
