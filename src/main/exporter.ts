import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { statfs } from 'node:fs/promises'
import type { DiskStatus, ExportProgress, QualityPreset, Recording } from '@shared/types'
import { CH } from '@shared/ipc'
import { assessDisk, makeRecordingFolder, pickRoot, uniqueFolder } from '@shared/naming'
import { buildAudioExtractArgs, buildExportArgs, buildThumbnailArgs, inputsFromManifest, videoCodecFor } from '@shared/ffmpeg'
import { cleanupAfterExport, closeWriters, findOrphans, readManifest, sessionDir, setState } from './storage'
import { runFfmpeg } from './ffmpeg'
import { addRecording } from './library'
import { getSettings } from './settings'
import { APP_FOLDER, probeWritable } from './paths'
import { broadcast, sendAlert } from './windows'
import { exists } from './jsonstore'

export type ProgressSink = (p: ExportProgress) => void

export async function diskStatus(quality: QualityPreset): Promise<DiskStatus> {
  const { recordingsDir } = await getSettings()
  // Ghi thử TRƯỚC khi ghi. Ổ USB chưa cắm hay ổ mạng đứt mà chỉ phát hiện ở bước xuất file thì
  // người dùng đã gọi xong cuộc gọi rồi - lúc đó báo lỗi là quá muộn.
  const problem = await probeWritable(recordingsDir)
  if (problem) {
    return { dir: recordingsDir, problem, freeBytes: 0, minutesLeft: 0, canRecord: false, warn: true }
  }
  try {
    const st = await statfs(recordingsDir)
    return { dir: recordingsDir, ...assessDisk(st.bavail * st.bsize, quality) }
  } catch {
    // Không đọc được dung lượng thì không chặn người dùng ghi, chỉ bỏ cảnh báo.
    return { dir: recordingsDir, freeBytes: Number.MAX_SAFE_INTEGER, minutesLeft: Infinity, canRecord: true, warn: false }
  }
}

/**
 * Thứ tự ưu tiên khi tìm chỗ đặt bản ghi. Chỗ người dùng chọn luôn đứng đầu; hai chỗ sau chỉ để
 * cứu bản ghi khi ổ đích biến mất GIỮA buổi (rút USB, mất mạng) - lúc đó preflight đã qua rồi.
 */
function rootCandidates(configured: string): string[] {
  return [...new Set([configured, join(app.getPath('videos'), APP_FOLDER), join(app.getPath('userData'), 'recordings')])]
}

export async function exportSession(
  sessionId: string,
  durationMs: number,
  title: string | undefined,
  onProgress: ProgressSink,
): Promise<Recording | null> {
  const manifest = await readManifest(sessionId)
  if (!manifest) return null

  await closeWriters(sessionId)
  await setState(sessionId, 'finalizing')

  const settings = await getSettings()
  const startedAt = new Date(manifest.startedAt)
  const sourceName = manifest.streams.video?.source
  const base = makeRecordingFolder(startedAt, title ?? manifest.title, sourceName)

  // Chọn chỗ đặt file nằm TRONG try: không còn ổ nào ghi được cũng phải đi đúng đường báo lỗi,
  // để phiên chuyển sang error và giữ file thô, chứ không ném thẳng ra ngoài rồi treo ở finalizing.
  try {
    const choice = await pickRoot(rootCandidates(settings.recordingsDir), probeWritable)
    const root = choice.root
    if (choice.fellBackFrom) {
      // Lưu được nhưng không đúng chỗ vẫn là chuyện phải nói to: người dùng sẽ đi tìm ở ổ của họ.
      sendAlert({
        kind: 'stream-error',
        messageKey: 'record.savedElsewhere',
        params: { wanted: choice.fellBackFrom, used: root, reason: choice.reason ?? '' },
      })
    }
    await fs.mkdir(root, { recursive: true })

    const existing = new Set(await fs.readdir(root).catch(() => [] as string[]))
    const folderName = uniqueFolder(base, (n) => existing.has(n))
    const folder = join(root, folderName)
    await fs.mkdir(folder, { recursive: true })

    const { inputs, offsetsMs } = inputsFromManifest(manifest, (f) => join(sessionDir(sessionId), f))
    const hasVideo = Boolean(inputs.video)
    const outName = hasVideo ? 'recording.mp4' : 'recording.m4a'
    const output = join(folder, outName)

    const videoCodec = videoCodecFor(manifest.streams.video?.mimeType)
    onProgress({ sessionId, phase: 'normalizing', percent: 0 })

    const mux = (codec: 'copy' | 'h264') =>
      runFfmpeg(buildExportArgs({ inputs, offsetsMs, output, videoCodec: codec }), {
        totalMs: durationMs,
        onProgress: (percent) => onProgress({ sessionId, phase: 'muxing', percent }),
      })

    try {
      await mux(videoCodec)
    } catch (err) {
      // Chromium có thể sinh codec mà container đích không nhận (h264 trong webm là ca hay gặp).
      // Chép thẳng hỏng thì encode lại: chậm hơn nhiều nhưng cứu được buổi ghi.
      if (videoCodec !== 'copy' || !hasVideo) throw err
      onProgress({ sessionId, phase: 'muxing', percent: 0, message: 'Chép thẳng không được, đang encode lại…' })
      await mux('h264')
    }

    if (hasVideo) {
      onProgress({ sessionId, phase: 'thumbnail', percent: 99 })
      const thumbAt = Math.min(10, Math.max(1, Math.floor(durationMs / 2000)))
      await runFfmpeg(buildThumbnailArgs(output, join(folder, 'thumbnail.jpg'), thumbAt)).catch(() => undefined)
    }

    const size = await fs.stat(output).then((s) => s.size, () => 0)
    if (size === 0) throw new Error('FFmpeg tạo ra file rỗng')

    // Thứ tự này phải khớp đúng thứ tự -map trong buildExportArgs (mic trước, system sau).
    const audioTracks: ('me' | 'them')[] = []
    if (inputs.mic) audioTracks.push('me')
    if (inputs.system) audioTracks.push('them')

    const recording: Recording = {
      id: sessionId,
      title: title ?? manifest.title ?? folderName,
      folder,
      videoFile: outName,
      createdAt: manifest.startedAt,
      durationMs,
      sizeBytes: size,
      hasVideo,
      bookmarks: manifest.bookmarks,
      audioTracks,
    }
    await fs.writeFile(join(folder, 'metadata.json'), JSON.stringify({ ...manifest, recording }, null, 2), 'utf-8')
    await addRecording(recording)
    await setState(sessionId, 'done')
    await cleanupAfterExport(sessionId, output)

    onProgress({ sessionId, phase: 'done', percent: 100 })
    return recording
  } catch (err) {
    const message = `${err instanceof Error ? err.message : String(err)} — file thô vẫn còn, xuất lại được từ banner ở đầu cửa sổ.`
    await setState(sessionId, 'error', message)
    // Giữ nguyên thư mục thô để người dùng thử xuất lại, đừng dọn khi chưa có file đích.
    onProgress({ sessionId, phase: 'error', percent: 0, message })
    // Đẩy banner lên NGAY. Trước đây danh sách phiên cần cứu chỉ được gửi lúc khởi động app, nên
    // hỏng xong người dùng đổi tab là mất sạch dấu vết - đúng cách một bản ghi biến mất im lặng.
    broadcast(CH.sessionOrphansFound, await findOrphans())
    return null
  }
}

export async function extractAudio(folder: string, videoFile: string, track: number): Promise<string | null> {
  const input = join(folder, videoFile)
  if (!(await exists(input))) return null
  const output = join(folder, `audio-track-${track + 1}.m4a`)
  await runFfmpeg(buildAudioExtractArgs(input, output, track))
  return output
}
