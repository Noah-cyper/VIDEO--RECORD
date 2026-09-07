import { app } from 'electron'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { WHISPER_MODELS } from '@shared/whisper'
import { isCustomLanguageCode, isSpokenLanguage, SPOKEN_AUTO, TARGET_LANGUAGES } from '@shared/translate'
import { readJson, writeJson } from './jsonstore'
import { isUsableRecordingsDir, normalizeRecordingsDir, probeWritable } from './paths'

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
    liveTargetLabel: '',
    liveModel: 'base',
    spokenLanguage: SPOKEN_AUTO,
    captionBar: true,
  }
}

async function assertWritable(dir: string): Promise<void> {
  const problem = await probeWritable(dir)
  if (problem) throw new Error(`Không ghi được vào thư mục này: ${problem}`)
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
  // Mã ngôn ngữ đích của phụ đề đi thẳng vào prompt gửi ra dịch vụ ngoài, và cả vào tên file bản
  // dịch - nên nhận mã trong danh sách, hoặc mã tự đặt đúng khuôn customLanguageCode() sinh ra.
  if (patch.liveTarget !== undefined && patch.liveTarget !== '') {
    const known = TARGET_LANGUAGES.some((l) => l.code === patch.liveTarget)
    if (!known && !isCustomLanguageCode(patch.liveTarget)) {
      throw new Error(`Ngôn ngữ phụ đề không hợp lệ: ${JSON.stringify(patch.liveTarget)}`)
    }
    // Ngôn ngữ ngoài danh sách chỉ có tên do người dùng gõ; không có tên thì không dịch nổi.
    const label = (patch.liveTargetLabel ?? current.liveTargetLabel).trim()
    if (!known && label === '') {
      throw new Error('Ngôn ngữ ngoài danh sách phải kèm tên ngôn ngữ.')
    }
  }
  if (patch.liveTargetLabel !== undefined) {
    // Chuỗi này đi vào prompt gửi ra ngoài: cắt ngắn và bỏ ký tự điều khiển, đừng nhận nguyên xi.
    next.liveTargetLabel = patch.liveTargetLabel.replace(/[\p{C}]/gu, ' ').trim().slice(0, 60)
  }
  if (patch.spokenLanguage !== undefined && !isSpokenLanguage(patch.spokenLanguage)) {
    throw new Error(`Ngôn ngữ đang nói không hợp lệ: ${JSON.stringify(patch.spokenLanguage)}`)
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
