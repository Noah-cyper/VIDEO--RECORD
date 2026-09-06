import type {
  AudioDevice, Bookmark, CaptureAlert, CaptureSource, DiskStatus, ExportProgress,
  QualityPreset, Recording, RecordState, SessionManifest, Settings, StreamKind,
} from './types'
import type { LiveCaption } from './live'
import type { Speaker, Transcript } from './transcript'
import type { StoredSummary } from './summary'
import type { WhisperModelName } from './whisper'

/** Danh sách kênh cố định. Renderer không có nodeIntegration, mọi đặc quyền đi qua đây. */
export const CH = {
  sourcesList: 'sources:list',
  sourcesPick: 'sources:pick',
  permissionsCheck: 'permissions:check',
  permissionsRequest: 'permissions:request',
  diskStatus: 'disk:status',

  sessionOpen: 'session:open',
  sessionWriteChunk: 'session:writeChunk',
  sessionRegisterStream: 'session:registerStream',
  sessionBookmark: 'session:bookmark',
  sessionClose: 'session:close',
  sessionOrphans: 'session:orphans',
  sessionOrphansFound: 'session:orphansFound',
  sessionDiscard: 'session:discard',

  exportStart: 'export:start',
  exportProgress: 'export:progress',

  libraryList: 'library:list',
  libraryGet: 'library:get',
  librarySearch: 'library:search',
  libraryRename: 'library:rename',
  libraryRemove: 'library:remove',
  libraryReveal: 'library:reveal',
  libraryExtractAudio: 'library:extractAudio',
  libraryMediaUrl: 'library:mediaUrl',
  libraryTrim: 'library:trim',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsPickDir: 'settings:pickDir',
  settingsSetApiKey: 'settings:setApiKey',
  settingsClearApiKey: 'settings:clearApiKey',

  transcriptStart: 'transcript:start',
  transcriptCancel: 'transcript:cancel',
  transcriptProgress: 'transcript:progress',
  transcriptGet: 'transcript:get',
  transcriptExport: 'transcript:export',
  transcriptSearchAll: 'transcript:searchAll',
  transcriptTranslate: 'transcript:translate',
  transcriptGetTranslation: 'transcript:getTranslation',

  liveStart: 'live:start',
  liveStop: 'live:stop',
  liveAudio: 'live:audio',
  liveCaption: 'live:caption',

  summaryGet: 'summary:get',
  summaryCreate: 'summary:create',

  updateStatus: 'update:status',
  updateInstall: 'update:install',
  updateCheck: 'update:check',
  updateGet: 'update:get',
  updateOpenPage: 'update:openPage',
  updateDefer: 'update:defer',

  crashCount: 'crash:count',
  crashOpen: 'crash:open',
  crashClear: 'crash:clear',

  windowHide: 'window:hide',
  windowShow: 'window:show',
  ffmpegStatus: 'ffmpeg:status',
  whisperStatus: 'whisper:status',
  whisperRemoveModel: 'whisper:removeModel',

  stateChanged: 'record:stateChanged',
  alert: 'record:alert',
  commandFromMain: 'record:command',
} as const

export interface OpenSessionInput {
  quality: QualityPreset
  title?: string
  sourceName?: string
}

export interface RegisterStreamInput {
  sessionId: string
  kind: StreamKind
  offsetMs: number
  mimeType: string
  device?: string
  source?: string
}

export interface WriteChunkInput {
  sessionId: string
  kind: StreamKind
  data: ArrayBuffer
}

export interface CloseSessionInput {
  sessionId: string
  durationMs: number
  title?: string
}

export interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  /** Chỉ macOS mới thật sự có cửa xin quyền. Nơi khác thì nút "Cấp quyền" là nút không làm gì. */
  managed: boolean
  /** macOS chỉ áp dụng quyền ghi màn hình sau khi khởi động lại app (docs/03 mục 4.5). */
  needsRestart: boolean
}

export interface LiveStartInput {
  sessionId: string
  /** Mã ngôn ngữ đích, '' nếu chỉ muốn phụ đề nguyên văn. */
  target: string
  model: WhisperModelName
}

export interface LiveAudioInput {
  sessionId: string
  speaker: Speaker
  atMs: number
  /** PCM 16 bit mono 16 kHz. Gửi thô chứ không gửi WebM: main không phải giải mã lại. */
  pcm: ArrayBuffer
}

export type LiveFailure = 'no-binary' | 'cloud-off' | 'bad-target' | 'model' | 'busy'

export interface LiveStartResult {
  ok: boolean
  reason?: LiveFailure
  message?: string
}

export interface TranscriptProgress {
  recordingId: string
  phase: 'model' | 'extracting' | 'transcribing' | 'translating' | 'done' | 'error'
  percent: number
  track?: Speaker
  message?: string
}

export interface WhisperStatus {
  binaryAvailable: boolean
  installedModels: WhisperModelName[]
  /** Khoá API đã lưu chưa - chỉ trả về true/false, không bao giờ trả về chính khoá. */
  apiKeyConfigured: boolean
  secureStorageAvailable: boolean
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'
  /** Chạy từ mã nguồn, không có kênh cập nhật. */
  | 'unsupported'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  /** Phiên bản tìm thấy trên máy chủ, nếu có. */
  version?: string
  percent?: number
  bytesPerSecond?: number
  message?: string
  canInstall: boolean
  busyRecording: boolean
  /** Số giây còn lại trước khi tự cài; không có nghĩa là không có đếm ngược nào đang chạy. */
  autoInstallInSec?: number
}

export interface TranscriptHitDto {
  recordingId: string
  recordingTitle: string
  atMs: number
  speaker: Speaker
  text: string
}

export type TranscriptFormat = 'txt' | 'srt' | 'md'

/** Lệnh phát từ main (phím tắt toàn cục, menu khay) xuống renderer. */
export type MainCommand = 'toggle-record' | 'pause' | 'stop' | 'bookmark'

export interface CallrecApi {
  sources: {
    list(): Promise<CaptureSource[]>
    pick(sourceId: string, withLoopback: boolean): Promise<void>
  }
  permissions: {
    check(): Promise<PermissionStatus>
    request(): Promise<PermissionStatus>
  }
  disk: { status(quality: QualityPreset): Promise<DiskStatus> }
  session: {
    open(input: OpenSessionInput): Promise<SessionManifest>
    registerStream(input: RegisterStreamInput): Promise<void>
    writeChunk(input: WriteChunkInput): Promise<void>
    bookmark(sessionId: string, bookmark: Bookmark): Promise<void>
    close(input: CloseSessionInput): Promise<Recording | null>
    orphans(): Promise<SessionManifest[]>
    discard(sessionId: string): Promise<void>
  }
  exportRecording: {
    start(sessionId: string, durationMs: number, title?: string): Promise<Recording | null>
    onProgress(cb: (p: ExportProgress) => void): () => void
  }
  library: {
    list(): Promise<Recording[]>
    get(id: string): Promise<Recording | undefined>
    search(query: string): Promise<Recording[]>
    rename(id: string, title: string): Promise<void>
    remove(id: string): Promise<void>
    reveal(id: string): Promise<void>
    extractAudio(id: string, track: number): Promise<string | null>
    /** URL phát lại qua scheme riêng; renderer không tự dựng đường dẫn file được. */
    mediaUrl(id: string): Promise<string | null>
    trim(id: string, startMs: number, endMs: number): Promise<Recording | null>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    pickDir(): Promise<string | null>
    setApiKey(key: string): Promise<WhisperStatus>
    clearApiKey(): Promise<WhisperStatus>
  }
  transcript: {
    start(recordingId: string, model: WhisperModelName): Promise<Transcript | null>
    cancel(recordingId: string): Promise<void>
    get(recordingId: string): Promise<Transcript | null>
    export(recordingId: string, format: TranscriptFormat): Promise<string | null>
    searchAll(query: string): Promise<TranscriptHitDto[]>
    translate(recordingId: string, code: string, languageName: string): Promise<Transcript | null>
    getTranslation(recordingId: string, code: string): Promise<Transcript | null>
    onProgress(cb: (p: TranscriptProgress) => void): () => void
  }
  live: {
    start(input: LiveStartInput): Promise<LiveStartResult>
    stop(): Promise<void>
    /** send chứ không invoke: đợi main trả lời cho từng đoạn tiếng là tự chuốc thêm độ trễ. */
    audio(input: LiveAudioInput): void
    onCaption(cb: (caption: LiveCaption) => void): () => void
  }
  summary: {
    get(recordingId: string): Promise<StoredSummary | null>
    create(recordingId: string, useCloud: boolean): Promise<StoredSummary | null>
  }
  update: {
    get(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    install(): Promise<{ ok: boolean; reason?: string }>
    defer(): Promise<void>
    openPage(): Promise<void>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
  crash: {
    count(): Promise<number>
    open(): Promise<void>
    clear(): Promise<void>
  }
  window: { hide(): Promise<void>; show(): Promise<void> }
  ffmpeg: { available(): Promise<boolean> }
  whisper: {
    status(): Promise<WhisperStatus>
    removeModel(name: WhisperModelName): Promise<WhisperStatus>
  }
  onCommand(cb: (cmd: MainCommand) => void): () => void
  /** Cửa sổ overlay dùng kênh này để hiển thị chỉ báo đang ghi. */
  onIndicator(cb: (p: { state: RecordState; elapsedMs: number }) => void): () => void
  onAlert(cb: (alert: CaptureAlert) => void): () => void
  reportState(state: RecordState, elapsedMs: number): void
}

export type { AudioDevice }
