import type {
  AudioDevice, Bookmark, CaptureAlert, CaptureSource, DiskStatus, ExportProgress,
  QualityPreset, Recording, RecordState, SessionManifest, Settings, StreamKind,
} from './types'

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
  librarySearch: 'library:search',
  libraryRename: 'library:rename',
  libraryRemove: 'library:remove',
  libraryReveal: 'library:reveal',
  libraryExtractAudio: 'library:extractAudio',
  libraryMediaUrl: 'library:mediaUrl',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsPickDir: 'settings:pickDir',

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
  /** macOS chỉ áp dụng quyền ghi màn hình sau khi khởi động lại app (docs/03 mục 4.5). */
  needsRestart: boolean
}

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
    search(query: string): Promise<Recording[]>
    rename(id: string, title: string): Promise<void>
    remove(id: string): Promise<void>
    reveal(id: string): Promise<void>
    extractAudio(id: string, track: number): Promise<string | null>
    /** URL phát lại qua scheme riêng; renderer không tự dựng đường dẫn file được. */
    mediaUrl(id: string): Promise<string | null>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    pickDir(): Promise<string | null>
  }
  onCommand(cb: (cmd: MainCommand) => void): () => void
  /** Cửa sổ overlay dùng kênh này để hiển thị chỉ báo đang ghi. */
  onIndicator(cb: (p: { state: RecordState; elapsedMs: number }) => void): () => void
  onAlert(cb: (alert: CaptureAlert) => void): () => void
  reportState(state: RecordState, elapsedMs: number): void
}

export type { AudioDevice }
