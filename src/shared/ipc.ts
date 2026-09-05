import type {
  AudioDevice, Bookmark, CaptureAlert, CaptureSource, DiskStatus, ExportProgress,
  QualityPreset, Recording, RecordState, SessionManifest, Settings, StreamKind,
} from './types'
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
  sessionSetState: 'session:setState',
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

  summaryGet: 'summary:get',
  summaryCreate: 'summary:create',

  updateStatus: 'update:status',
  updateInstall: 'update:install',

  crashCount: 'crash:count',
  crashOpen: 'crash:open',
  crashClear: 'crash:clear',

  whisperStatus: 'whisper:status',
  whisperRemoveModel: 'whisper:removeModel',

  stateChanged: 'record:stateChanged',
  alert: 'record:alert',
  commandFromMain: 'record:command',
  consentPlay: 'record:playConsent',
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

export interface UpdateStatus {
  state: 'available' | 'downloaded' | 'error'
  version?: string
  message?: string
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
    setState(sessionId: string, state: RecordState, error?: string): Promise<void>
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
  summary: {
    get(recordingId: string): Promise<StoredSummary | null>
    create(recordingId: string, useCloud: boolean): Promise<StoredSummary | null>
  }
  update: {
    install(): Promise<{ ok: boolean; reason?: string }>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
  crash: {
    count(): Promise<number>
    open(): Promise<void>
    clear(): Promise<void>
  }
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
