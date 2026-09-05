import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { statfs } from 'node:fs/promises'
import type { ExportProgress, QualityPreset, Recording } from '@shared/types'
import { assessDisk, makeRecordingFolder, uniqueFolder } from '@shared/naming'
import { buildAudioExtractArgs, buildExportArgs, buildThumbnailArgs, inputsFromManifest, videoCodecFor } from '@shared/ffmpeg'
import { cleanupAfterExport, closeWriters, readManifest, sessionDir, setState } from './storage'
import { runFfmpeg } from './ffmpeg'
import { addRecording } from './library'
import { getSettings } from './settings'
import { exists } from './jsonstore'

export type ProgressSink = (p: ExportProgress) => void

export async function diskStatus(quality: QualityPreset) {
  const { recordingsDir } = await getSettings()
  await fs.mkdir(recordingsDir, { recursive: true }).catch(() => undefined)
  try {
    const st = await statfs(recordingsDir)
    return assessDisk(st.bavail * st.bsize, quality)
  } catch {
    // Không đọc được dung lượng thì không chặn người dùng ghi, chỉ bỏ cảnh báo.
    return { freeBytes: Number.MAX_SAFE_INTEGER, minutesLeft: Infinity, canRecord: true, warn: false }
  }
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
  const root = settings.recordingsDir
  await fs.mkdir(root, { recursive: true })

  const existing = new Set(await fs.readdir(root).catch(() => [] as string[]))
  const folderName = uniqueFolder(base, (n) => existing.has(n))
  const folder = join(root, folderName)
  await fs.mkdir(folder, { recursive: true })

  const { inputs, offsetsMs } = inputsFromManifest(manifest, (f) => join(sessionDir(sessionId), f))
  const hasVideo = Boolean(inputs.video)
  const outName = hasVideo ? 'recording.mp4' : 'recording.m4a'
  const output = join(folder, outName)

  try {
    const videoCodec = videoCodecFor(manifest.streams.video?.mimeType)
    onProgress({ sessionId, phase: 'normalizing', percent: 0 })
    await runFfmpeg(buildExportArgs({ inputs, offsetsMs, output, videoCodec }), {
      totalMs: durationMs,
      onProgress: (percent) => onProgress({ sessionId, phase: 'muxing', percent }),
    })

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
    const message = err instanceof Error ? err.message : String(err)
    await setState(sessionId, 'error', message)
    // Giữ nguyên thư mục thô để người dùng thử xuất lại, đừng dọn khi chưa có file đích.
    onProgress({ sessionId, phase: 'error', percent: 0, message })
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
