import { dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import type { Bookmark, QualityPreset, RecordState, Settings } from '@shared/types'
import { promises as fsp } from 'node:fs'
import {
  CH, type CloseSessionInput, type OpenSessionInput, type RegisterStreamInput,
  type TranscriptFormat, type TranscriptHitDto, type WhisperStatus, type WriteChunkInput,
} from '@shared/ipc'
import { toMarkdown, toSrt, toTxt } from '@shared/transcript'
import { WHISPER_MODELS, type WhisperModelName } from '@shared/whisper'
import { readTranscript, searchAllTranscripts, transcribeRecording } from './transcribe'
import { CloudSummaryUnavailable, readSummary, summarizeRecording } from './summarize'
import { modelInstalled, removeModel, whisperAvailable } from './whisper'
import { clearApiKey, hasApiKey, secureStorageAvailable, setApiKey } from './secrets'
import { installUpdate } from './updater'
import { clearCrashDumps, countCrashDumps, openCrashDumpDir } from './crash'
import * as storage from './storage'
import * as library from './library'
import { diskStatus, exportSession, extractAudio } from './exporter'
import { getSettings, setSettings } from './settings'
import { checkPermissions, requestPermissions } from './permissions'
import { listSources, pickSource, pickedSourceName } from './sources'
import { broadcast, getMainWindow, syncIndicator } from './windows'
import { mediaUrl } from './media-protocol'
import { updateTray } from './tray'

async function whisperStatus(): Promise<WhisperStatus> {
  return {
    binaryAvailable: await whisperAvailable(),
    installedModels: (Object.keys(WHISPER_MODELS) as WhisperModelName[]).filter(modelInstalled),
    apiKeyConfigured: await hasApiKey(),
    secureStorageAvailable: secureStorageAvailable(),
  }
}

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
  ipcMain.handle(CH.libraryGet, (_e, id: string) => library.getRecording(id))
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
  ipcMain.handle(CH.settingsSetApiKey, async (_e, key: string) => {
    await setApiKey(key)
    return whisperStatus()
  })
  ipcMain.handle(CH.settingsClearApiKey, async () => {
    await clearApiKey()
    return whisperStatus()
  })

  // Một bản ghi chỉ chạy một tiến trình gỡ băng; giữ controller để nút Huỷ có tác dụng thật.
  const running = new Map<string, AbortController>()

  ipcMain.handle(CH.transcriptStart, async (_e, id: string, model: WhisperModelName) => {
    if (running.has(id)) return null
    const controller = new AbortController()
    running.set(id, controller)
    try {
      const settings = await getSettings()
      return await transcribeRecording(
        id,
        model,
        settings.language,
        (p) => broadcast(CH.transcriptProgress, p),
        controller.signal,
      )
    } finally {
      running.delete(id)
    }
  })
  ipcMain.handle(CH.transcriptCancel, (_e, id: string) => {
    running.get(id)?.abort()
    running.delete(id)
  })
  ipcMain.handle(CH.transcriptGet, async (_e, id: string) => {
    const rec = await library.getRecording(id)
    return rec ? readTranscript(rec) : null
  })
  ipcMain.handle(CH.transcriptExport, async (_e, id: string, format: TranscriptFormat) => {
    const rec = await library.getRecording(id)
    if (!rec) return null
    const transcript = await readTranscript(rec)
    if (!transcript) return null
    const body =
      format === 'srt' ? toSrt(transcript.segments)
      : format === 'md' ? toMarkdown(transcript.segments, rec.title)
      : toTxt(transcript.segments)
    const out = join(rec.folder, `transcript.${format}`)
    await fsp.writeFile(out, body, 'utf-8')
    return out
  })
  ipcMain.handle(CH.transcriptSearchAll, async (_e, query: string): Promise<TranscriptHitDto[]> => {
    const hits = await searchAllTranscripts(await library.listRecordings(), query)
    return hits.map((h) => ({
      recordingId: h.recording.id,
      recordingTitle: h.recording.title,
      atMs: h.atMs,
      speaker: h.speaker,
      text: h.text,
    }))
  })

  ipcMain.handle(CH.summaryGet, (_e, id: string) => readSummary(id))
  ipcMain.handle(CH.summaryCreate, async (_e, id: string, useCloud: boolean) => {
    try {
      return await summarizeRecording(id, useCloud)
    } catch (err) {
      // Người dùng cần biết vì sao đường qua API không chạy, không phải nhận một ô trống.
      if (err instanceof CloudSummaryUnavailable) {
        broadcast(CH.alert, { kind: 'stream-error', message: err.message })
        return summarizeRecording(id, false)
      }
      throw err
    }
  })

  ipcMain.handle(CH.updateInstall, () => installUpdate())
  ipcMain.handle(CH.crashCount, () => countCrashDumps())
  ipcMain.handle(CH.crashOpen, () => openCrashDumpDir())
  ipcMain.handle(CH.crashClear, () => clearCrashDumps())

  ipcMain.handle(CH.whisperStatus, () => whisperStatus())
  ipcMain.handle(CH.whisperRemoveModel, async (_e, name: WhisperModelName) => {
    await removeModel(name)
    return whisperStatus()
  })
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
