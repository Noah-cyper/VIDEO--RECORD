import { dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import type { Bookmark, QualityPreset, RecordState, Settings } from '@shared/types'
import { promises as fsp } from 'node:fs'
import {
  CH, type CloseSessionInput, type OpenSessionInput, type RegisterStreamInput,
  type TranscriptFormat, type TranscriptHitDto, type WhisperStatus, type WriteChunkInput,
} from '@shared/ipc'
import { toMarkdown, toSrt, toTxt, type SpeakerLabels } from '@shared/transcript'
import { translate } from '@shared/i18n'
import { WHISPER_MODELS, type WhisperModelName } from '@shared/whisper'

import { readTranscript, searchAllTranscripts, transcribeRecording } from './transcribe'
import { readTranslation, translateRecording } from './translate'
import { CloudSummaryUnavailable, readSummary, summarizeRecording } from './summarize'
import { modelInstalled, removeModel, whisperAvailable } from './whisper'
import { ffmpegAvailable } from './ffmpeg'
import { clearApiKey, hasApiKey, secureStorageAvailable, setApiKey } from './secrets'
import { checkForUpdates, installUpdate, openReleasesPage, snapshot } from './updater'
import { clearCrashDumps, countCrashDumps, openCrashDumpDir } from './crash'
import { trimRecording } from './trim'
import * as storage from './storage'
import * as library from './library'
import { diskStatus, exportSession, extractAudio } from './exporter'
import { getSettings, setSettings } from './settings'
import { checkPermissions, requestPermissions } from './permissions'
import { listSources, pickSource, pickedSourceName } from './sources'
import { broadcast, getMainWindow, syncIndicator } from './windows'
import { mediaUrl } from './media-protocol'
import { updateTray } from './tray'

/** Tên model từ renderer được ghép vào đường dẫn file và URL tải, nên phải nằm trong bảng. */
function assertModel(name: unknown): WhisperModelName {
  if (typeof name !== 'string' || !(name in WHISPER_MODELS)) {
    throw new Error(`Model không hợp lệ: ${JSON.stringify(name)}`)
  }
  return name as WhisperModelName
}

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
  ipcMain.handle(CH.libraryExtractAudio, async (_e, id: string, track: unknown) => {
    if (!Number.isInteger(track) || (track as number) < 0 || (track as number) > 15) {
      throw new Error(`Chỉ số track không hợp lệ: ${JSON.stringify(track)}`)
    }
    const rec = await library.getRecording(id)
    return rec ? extractAudio(rec.folder, rec.videoFile, track as number) : null
  })

  ipcMain.handle(CH.libraryMediaUrl, async (_e, id: string) => {
    const rec = await library.getRecording(id)
    return rec ? mediaUrl(join(rec.folder, rec.videoFile)) : null
  })

  ipcMain.handle(CH.libraryTrim, (_e, id: string, startMs: unknown, endMs: unknown) => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error('Khoảng cắt không hợp lệ')
    return trimRecording(id, { startMs: startMs as number, endMs: endMs as number })
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

  ipcMain.handle(CH.transcriptStart, async (_e, id: string, rawModel: unknown) => {
    const model = assertModel(rawModel)
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
    // format đi thẳng vào tên file; không giới hạn thì `../x` ghi ra ngoài thư mục bản ghi.
    if (!['txt', 'srt', 'md'].includes(format)) throw new Error(`Định dạng không hợp lệ: ${format}`)
    const rec = await library.getRecording(id)
    if (!rec) return null
    const transcript = await readTranscript(rec)
    if (!transcript) return null
    // Nhãn trong file xuất ra phải theo ngôn ngữ người dùng đang chọn, không cứng tiếng Việt.
    const { language } = await getSettings()
    const labels: SpeakerLabels = {
      me: translate(language, 'speaker.me'),
      them: translate(language, 'speaker.them'),
    }
    const body =
      format === 'srt' ? toSrt(transcript.segments, labels)
      : format === 'md' ? toMarkdown(transcript.segments, rec.title, labels, translate(language, 'transcript.overlap'))
      : toTxt(transcript.segments, labels)
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

  ipcMain.handle(CH.transcriptTranslate, async (_e, id: string, code: string, languageName: string) => {
    if (running.has(id)) return null
    const controller = new AbortController()
    running.set(id, controller)
    try {
      return await translateRecording(
        id,
        code,
        languageName,
        (p) => broadcast(CH.transcriptProgress, p),
        controller.signal,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      broadcast(CH.transcriptProgress, { recordingId: id, phase: 'error', percent: 0, message })
      return null
    } finally {
      running.delete(id)
    }
  })
  ipcMain.handle(CH.transcriptGetTranslation, async (_e, id: string, code: string) => {
    const rec = await library.getRecording(id)
    return rec ? readTranslation(rec, code) : null
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
  ipcMain.handle(CH.updateGet, () => snapshot())
  ipcMain.handle(CH.updateCheck, () => checkForUpdates())
  ipcMain.handle(CH.updateOpenPage, () => openReleasesPage())
  ipcMain.handle(CH.crashCount, () => countCrashDumps())
  ipcMain.handle(CH.crashOpen, () => openCrashDumpDir())
  ipcMain.handle(CH.crashClear, () => clearCrashDumps())

  ipcMain.handle(CH.ffmpegStatus, () => ffmpegAvailable())
  ipcMain.handle(CH.whisperStatus, () => whisperStatus())
  ipcMain.handle(CH.whisperRemoveModel, async (_e, name: unknown) => {
    await removeModel(assertModel(name))
    return whisperStatus()
  })
  ipcMain.handle(CH.settingsSet, (_e, patch: Partial<Settings>) => setSettings(patch))
  ipcMain.handle(CH.settingsPickDir, async () => {
    const win = getMainWindow()
    // defaultPath mở hộp thoại ngay tại thư mục đang dùng, thay vì một chỗ ngẫu nhiên.
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: (await getSettings()).recordingsDir,
    }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return res.canceled ? null : res.filePaths[0]
  })

  // Renderer giữ máy trạng thái; main chỉ phản chiếu ra overlay và khay hệ thống.
  ipcMain.on(CH.stateChanged, (_e, state: RecordState, elapsedMs: number) => {
    syncIndicator(state, elapsedMs)
    updateTray(state)
  })
}
