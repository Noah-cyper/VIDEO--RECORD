import { dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import type { Bookmark, QualityPreset, RecordState, Settings } from '@shared/types'
import { CH, type CloseSessionInput, type OpenSessionInput, type RegisterStreamInput, type WriteChunkInput } from '@shared/ipc'
import * as storage from './storage'
import * as library from './library'
import { diskStatus, exportSession, extractAudio } from './exporter'
import { getSettings, setSettings } from './settings'
import { checkPermissions, requestPermissions } from './permissions'
import { listSources, pickSource, pickedSourceName } from './sources'
import { broadcast, getMainWindow, syncIndicator } from './windows'
import { mediaUrl } from './media-protocol'
import { updateTray } from './tray'

export function registerIpc(): void {
  ipcMain.handle(CH.sourcesList, () => listSources())
  ipcMain.handle(CH.sourcesPick, (_e, id: string, withLoopback: boolean) => pickSource(id, withLoopback))
  ipcMain.handle(CH.permissionsCheck, () => checkPermissions())
  ipcMain.handle(CH.permissionsRequest, () => requestPermissions())
  ipcMain.handle(CH.diskStatus, (_e, quality: QualityPreset) => diskStatus(quality))

  ipcMain.handle(CH.sessionOpen, (_e, input: OpenSessionInput) =>
    storage.openSession({ ...input, sourceName: input.sourceName ?? pickedSourceName() }),
  )
  ipcMain.handle(CH.sessionRegisterStream, (_e, input: RegisterStreamInput) =>
    storage.registerStream({ ...input, source: input.source ?? pickedSourceName() }),
  )
  ipcMain.handle(CH.sessionWriteChunk, (_e, input: WriteChunkInput) =>
    storage.writeChunk(input.sessionId, input.kind, input.data),
  )
  ipcMain.handle(CH.sessionSetState, (_e, id: string, state: RecordState, error?: string) =>
    storage.setState(id, state, error),
  )
  ipcMain.handle(CH.sessionBookmark, (_e, id: string, bookmark: Bookmark) => storage.addBookmark(id, bookmark))
  ipcMain.handle(CH.sessionOrphans, () => storage.findOrphans())
  ipcMain.handle(CH.sessionDiscard, (_e, id: string) => storage.discardSession(id))
  ipcMain.handle(CH.sessionClose, (_e, input: CloseSessionInput) =>
    exportSession(input.sessionId, input.durationMs, input.title, (p) => broadcast(CH.exportProgress, p)),
  )
  ipcMain.handle(CH.exportStart, (_e, id: string, durationMs: number, title?: string) =>
    exportSession(id, durationMs, title, (p) => broadcast(CH.exportProgress, p)),
  )

  ipcMain.handle(CH.libraryList, () => library.listRecordings())
  ipcMain.handle(CH.librarySearch, (_e, q: string) => library.searchRecordings(q))
  ipcMain.handle(CH.libraryRename, (_e, id: string, title: string) => library.renameRecording(id, title))
  ipcMain.handle(CH.libraryRemove, (_e, id: string) => library.removeRecording(id))
  ipcMain.handle(CH.libraryReveal, (_e, id: string) => library.revealRecording(id))
  ipcMain.handle(CH.libraryExtractAudio, async (_e, id: string, track: number) => {
    const rec = await library.getRecording(id)
    return rec ? extractAudio(rec.folder, rec.videoFile, track) : null
  })

  ipcMain.handle(CH.libraryMediaUrl, async (_e, id: string) => {
    const rec = await library.getRecording(id)
    return rec ? mediaUrl(join(rec.folder, rec.videoFile)) : null
  })

  ipcMain.handle(CH.settingsGet, () => getSettings())
  ipcMain.handle(CH.settingsSet, (_e, patch: Partial<Settings>) => setSettings(patch))
  ipcMain.handle(CH.settingsPickDir, async () => {
    const win = getMainWindow()
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  // Renderer giữ máy trạng thái; main chỉ phản chiếu ra overlay và khay hệ thống.
  ipcMain.on(CH.stateChanged, (_e, state: RecordState, elapsedMs: number) => {
    syncIndicator(state, elapsedMs)
    updateTray(state)
  })
}
