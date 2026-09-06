import { contextBridge, ipcRenderer } from 'electron'
import type { Bookmark, CaptureAlert, ExportProgress, QualityPreset, RecordState, Settings, SessionManifest } from '@shared/types'
import type { WhisperModelName } from '@shared/whisper'
import {
  CH, type CallrecApi, type CloseSessionInput, type MainCommand, type OpenSessionInput,
  type RegisterStreamInput, type TranscriptFormat, type TranscriptProgress, type WriteChunkInput,
} from '@shared/ipc'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CallrecApi & { onOrphans(cb: (m: SessionManifest[]) => void): () => void } = {
  sources: {
    list: () => ipcRenderer.invoke(CH.sourcesList),
    pick: (sourceId, withLoopback) => ipcRenderer.invoke(CH.sourcesPick, sourceId, withLoopback),
  },
  permissions: {
    check: () => ipcRenderer.invoke(CH.permissionsCheck),
    request: () => ipcRenderer.invoke(CH.permissionsRequest),
  },
  disk: { status: (quality: QualityPreset) => ipcRenderer.invoke(CH.diskStatus, quality) },
  session: {
    open: (input: OpenSessionInput) => ipcRenderer.invoke(CH.sessionOpen, input),
    registerStream: (input: RegisterStreamInput) => ipcRenderer.invoke(CH.sessionRegisterStream, input),
    writeChunk: (input: WriteChunkInput) => ipcRenderer.invoke(CH.sessionWriteChunk, input),
    setState: (id: string, state: RecordState, error?: string) => ipcRenderer.invoke(CH.sessionSetState, id, state, error),
    bookmark: (id: string, bookmark: Bookmark) => ipcRenderer.invoke(CH.sessionBookmark, id, bookmark),
    close: (input: CloseSessionInput) => ipcRenderer.invoke(CH.sessionClose, input),
    orphans: () => ipcRenderer.invoke(CH.sessionOrphans),
    discard: (id: string) => ipcRenderer.invoke(CH.sessionDiscard, id),
  },
  exportRecording: {
    start: (id: string, durationMs: number, title?: string) => ipcRenderer.invoke(CH.exportStart, id, durationMs, title),
    onProgress: (cb: (p: ExportProgress) => void) => on(CH.exportProgress, cb),
  },
  library: {
    list: () => ipcRenderer.invoke(CH.libraryList),
    get: (id: string) => ipcRenderer.invoke(CH.libraryGet, id),
    search: (q: string) => ipcRenderer.invoke(CH.librarySearch, q),
    rename: (id: string, title: string) => ipcRenderer.invoke(CH.libraryRename, id, title),
    remove: (id: string) => ipcRenderer.invoke(CH.libraryRemove, id),
    reveal: (id: string) => ipcRenderer.invoke(CH.libraryReveal, id),
    extractAudio: (id: string, track: number) => ipcRenderer.invoke(CH.libraryExtractAudio, id, track),
    mediaUrl: (id: string) => ipcRenderer.invoke(CH.libraryMediaUrl, id),
    trim: (id: string, startMs: number, endMs: number) => ipcRenderer.invoke(CH.libraryTrim, id, startMs, endMs),
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    set: (patch: Partial<Settings>) => ipcRenderer.invoke(CH.settingsSet, patch),
    pickDir: () => ipcRenderer.invoke(CH.settingsPickDir),
    setApiKey: (key: string) => ipcRenderer.invoke(CH.settingsSetApiKey, key),
    clearApiKey: () => ipcRenderer.invoke(CH.settingsClearApiKey),
  },
  transcript: {
    start: (id: string, model: WhisperModelName) => ipcRenderer.invoke(CH.transcriptStart, id, model),
    cancel: (id: string) => ipcRenderer.invoke(CH.transcriptCancel, id),
    get: (id: string) => ipcRenderer.invoke(CH.transcriptGet, id),
    export: (id: string, format: TranscriptFormat) => ipcRenderer.invoke(CH.transcriptExport, id, format),
    searchAll: (query: string) => ipcRenderer.invoke(CH.transcriptSearchAll, query),
    translate: (id: string, code: string, languageName: string) =>
      ipcRenderer.invoke(CH.transcriptTranslate, id, code, languageName),
    getTranslation: (id: string, code: string) => ipcRenderer.invoke(CH.transcriptGetTranslation, id, code),
    onProgress: (cb: (p: TranscriptProgress) => void) => on(CH.transcriptProgress, cb),
  },
  summary: {
    get: (id: string) => ipcRenderer.invoke(CH.summaryGet, id),
    create: (id: string, useCloud: boolean) => ipcRenderer.invoke(CH.summaryCreate, id, useCloud),
  },
  update: {
    get: () => ipcRenderer.invoke(CH.updateGet),
    check: () => ipcRenderer.invoke(CH.updateCheck),
    openPage: () => ipcRenderer.invoke(CH.updateOpenPage),
    install: () => ipcRenderer.invoke(CH.updateInstall),
    defer: () => ipcRenderer.invoke(CH.updateDefer),
    onStatus: (cb) => on(CH.updateStatus, cb),
  },
  crash: {
    count: () => ipcRenderer.invoke(CH.crashCount),
    open: () => ipcRenderer.invoke(CH.crashOpen),
    clear: () => ipcRenderer.invoke(CH.crashClear),
  },
  window: {
    hide: () => ipcRenderer.invoke(CH.windowHide),
    show: () => ipcRenderer.invoke(CH.windowShow),
  },
  ffmpeg: { available: () => ipcRenderer.invoke(CH.ffmpegStatus) },
  whisper: {
    status: () => ipcRenderer.invoke(CH.whisperStatus),
    removeModel: (name: WhisperModelName) => ipcRenderer.invoke(CH.whisperRemoveModel, name),
  },
  onCommand: (cb: (cmd: MainCommand) => void) => on(CH.commandFromMain, cb),
  onIndicator: (cb) => on(CH.stateChanged, cb),
  onAlert: (cb: (alert: CaptureAlert) => void) => on(CH.alert, cb),
  onOrphans: (cb: (m: SessionManifest[]) => void) => on(CH.sessionOrphansFound, cb),
  reportState: (state: RecordState, elapsedMs: number) => ipcRenderer.send(CH.stateChanged, state, elapsedMs),
}

contextBridge.exposeInMainWorld('callrec', api)
