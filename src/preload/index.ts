import { contextBridge, ipcRenderer } from 'electron'
import type { Bookmark, CaptureAlert, ExportProgress, QualityPreset, RecordState, Settings, SessionManifest } from '@shared/types'
import { CH, type CallrecApi, type CloseSessionInput, type MainCommand, type OpenSessionInput, type RegisterStreamInput, type WriteChunkInput } from '@shared/ipc'

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
    search: (q: string) => ipcRenderer.invoke(CH.librarySearch, q),
    rename: (id: string, title: string) => ipcRenderer.invoke(CH.libraryRename, id, title),
    remove: (id: string) => ipcRenderer.invoke(CH.libraryRemove, id),
    reveal: (id: string) => ipcRenderer.invoke(CH.libraryReveal, id),
    extractAudio: (id: string, track: number) => ipcRenderer.invoke(CH.libraryExtractAudio, id, track),
    mediaUrl: (id: string) => ipcRenderer.invoke(CH.libraryMediaUrl, id),
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    set: (patch: Partial<Settings>) => ipcRenderer.invoke(CH.settingsSet, patch),
    pickDir: () => ipcRenderer.invoke(CH.settingsPickDir),
  },
  onCommand: (cb: (cmd: MainCommand) => void) => on(CH.commandFromMain, cb),
  onIndicator: (cb) => on(CH.stateChanged, cb),
  onAlert: (cb: (alert: CaptureAlert) => void) => on(CH.alert, cb),
  onOrphans: (cb: (m: SessionManifest[]) => void) => on(CH.sessionOrphansFound, cb),
  reportState: (state: RecordState, elapsedMs: number) => ipcRenderer.send(CH.stateChanged, state, elapsedMs),
}

contextBridge.exposeInMainWorld('callrec', api)
