export type StreamKind = 'mic' | 'system' | 'video'

export type RecordState =
  | 'idle'
  | 'armed'
  | 'recording'
  | 'paused'
  | 'finalizing'
  | 'done'
  | 'error'

/** Trạng thái ghi được coi là "đang hoạt động" -> bắt buộc hiện chỉ báo (FR-08). */
export const ACTIVE_STATES: readonly RecordState[] = ['recording', 'paused', 'finalizing']

export interface StreamInfo {
  file: string
  /** Lệch so với mốc t0 của phiên, dùng cho -itsoffset khi mux. */
  offsetMs: number
  device?: string
  source?: string
  mimeType?: string
}

export interface Bookmark {
  atMs: number
  label: string
}

export interface SessionManifest {
  id: string
  startedAt: string
  endedAt?: string
  state: RecordState
  title?: string
  quality: QualityPreset
  streams: Partial<Record<StreamKind, StreamInfo>>
  chunks: Partial<Record<StreamKind, number>>
  /** Tổng thời gian đã tạm dừng, trừ ra khi tính thời lượng thực. */
  pausedMs: number
  bookmarks: Bookmark[]
  error?: string
}

export type QualityPreset = 'audio-only' | '720p30' | '1080p30' | '1080p60'

export interface QualitySpec {
  width?: number
  height?: number
  frameRate?: number
  /** MB mỗi giờ, dùng để cảnh báo dung lượng trước khi ghi. */
  mbPerHour: number
}

export const QUALITY: Record<QualityPreset, QualitySpec> = {
  'audio-only': { mbPerHour: 115 },
  '720p30': { width: 1280, height: 720, frameRate: 30, mbPerHour: 320 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30, mbPerHour: 500 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60, mbPerHour: 850 },
}

export interface CaptureSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  thumbnailDataUrl: string
  appIcon?: string
}

export interface AudioDevice {
  deviceId: string
  label: string
}

export interface Recording {
  id: string
  title: string
  folder: string
  videoFile: string
  createdAt: string
  durationMs: number
  sizeBytes: number
  hasVideo: boolean
  bookmarks: Bookmark[]
  /**
   * Thứ tự audio track trong file đích. Khi thiếu mic thì track 0 là đối phương chứ không phải
   * mình - không lưu lại thì transcript sẽ gán nhãn ngược cho cả cuộc gọi.
   */
  audioTracks: ('me' | 'them')[]
  transcriptFile?: string
  summaryFile?: string
  /** Mã ngôn ngữ đã dịch sẵn; mỗi mã tương ứng một file transcript.<code>.json cạnh bản ghi. */
  translations?: string[]
}

export interface Settings {
  recordingsDir: string
  /** Model whisper.cpp dùng cho gỡ băng; đổi model không ảnh hưởng bản ghi đã có. */
  whisperModel: 'tiny' | 'base' | 'small' | 'medium'
  quality: QualityPreset
  micDeviceId: string | null
  language: 'vi' | 'en'
  playConsentNotice: boolean
  /** Ghi ngầm: tự thu cửa sổ xuống khay khi bắt đầu ghi, để màn hình đang ghi không bị che. */
  hideWhileRecording: boolean
  /** Không bao giờ mặc định bật: gửi dữ liệu ra ngoài phải là hành động có ý thức (NFR-06). */
  allowCloudSummary: boolean
}

export interface DiskStatus {
  freeBytes: number
  /** Ước lượng số phút còn ghi được ở chất lượng hiện tại. */
  minutesLeft: number
  canRecord: boolean
  warn: boolean
}

export interface ExportProgress {
  sessionId: string
  phase: 'normalizing' | 'muxing' | 'thumbnail' | 'done' | 'error'
  percent: number
  message?: string
}

/** Cảnh báo phát ra khi một luồng im lặng bất thường hoặc thiết bị bị rút. */
export interface CaptureAlert {
  kind: 'silence' | 'device-lost' | 'device-changed' | 'disk-low' | 'stream-error' | 'info'
  stream?: StreamKind
  /** Khoá dịch; nơi phát cảnh báo không biết người dùng đang dùng ngôn ngữ nào. */
  messageKey?: string
  params?: Record<string, string | number>
  /** Chuỗi đã thành hình từ hệ điều hành hoặc ffmpeg - không dịch được, hiện nguyên văn. */
  message?: string
}
