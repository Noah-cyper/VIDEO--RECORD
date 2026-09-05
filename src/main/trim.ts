import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Recording } from '@shared/types'
import { isValidRange, buildTrimArgs, shiftBookmarks, shiftSegments, type TrimRange } from '@shared/trim'
import { makeRecordingFolder, uniqueFolder } from '@shared/naming'
import { runFfmpeg } from './ffmpeg'
import { addRecording, getRecording } from './library'
import { readTranscript, TRANSCRIPT_FILE } from './transcribe'
import { getSettings } from './settings'
import { isInside } from './paths'
import { writeJson } from './jsonstore'

/**
 * Không đụng vào bản gốc. Cắt là thao tác không đảo ngược được, còn đây là bản ghi cuộc gọi -
 * thà tốn thêm dung lượng còn hơn để người dùng cắt nhầm rồi mất phần quan trọng.
 */
export async function trimRecording(id: string, range: TrimRange): Promise<Recording | null> {
  const source = await getRecording(id)
  if (!source) return null
  if (!isValidRange(range, source.durationMs)) throw new Error('Khoảng cắt không hợp lệ')

  const { recordingsDir } = await getSettings()
  if (!isInside(recordingsDir, source.folder)) throw new Error('Bản ghi nằm ngoài thư mục cho phép')

  const createdAt = new Date()
  const base = makeRecordingFolder(createdAt, `${source.title} (da cat)`)
  const existing = new Set(await fs.readdir(recordingsDir).catch(() => [] as string[]))
  const folder = join(recordingsDir, uniqueFolder(base, (n) => existing.has(n)))
  await fs.mkdir(folder, { recursive: true })

  const output = join(folder, source.videoFile)
  await runFfmpeg(buildTrimArgs(join(source.folder, source.videoFile), output, range))

  const size = await fs.stat(output).then((s) => s.size, () => 0)
  if (size === 0) {
    await fs.rm(folder, { recursive: true, force: true })
    throw new Error('Cắt xong nhưng file đầu ra rỗng')
  }

  const transcript = await readTranscript(source)
  if (transcript) {
    await writeJson(join(folder, TRANSCRIPT_FILE), {
      ...transcript,
      segments: shiftSegments(transcript.segments, range),
    })
  }

  const trimmed: Recording = {
    ...source,
    id: `${source.id}-trim-${Date.now().toString(36)}`,
    title: `${source.title} (đã cắt)`,
    folder,
    createdAt: createdAt.toISOString(),
    durationMs: range.endMs - range.startMs,
    sizeBytes: size,
    bookmarks: shiftBookmarks(source.bookmarks, range),
    transcriptFile: transcript ? TRANSCRIPT_FILE : undefined,
    // Tóm tắt cũ nói về phần đã bị cắt bỏ, mang sang là sai lệch; để người dùng chạy lại.
    summaryFile: undefined,
  }

  await fs.writeFile(join(folder, 'metadata.json'), JSON.stringify({ trimmedFrom: source.id, range, recording: trimmed }, null, 2), 'utf-8')
  await addRecording(trimmed)
  return trimmed
}
