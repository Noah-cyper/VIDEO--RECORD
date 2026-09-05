import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Recording } from '@shared/types'
import type { TranscriptProgress } from '@shared/ipc'
import { buildWavExtractArgs } from '@shared/ffmpeg'
import { mergeTranscripts, parseWhisperJson, type Speaker, type Transcript, type TranscriptSegment } from '@shared/transcript'
import type { WhisperModelName } from '@shared/whisper'
import { runFfmpeg } from './ffmpeg'
import { ensureModel, runWhisper } from './whisper'
import { getRecording, patchRecording } from './library'
import { readJson, writeJson } from './jsonstore'

export const TRANSCRIPT_FILE = 'transcript.json'

export type ProgressSink = (p: TranscriptProgress) => void

export async function readTranscript(rec: Recording): Promise<Transcript | null> {
  if (!rec.transcriptFile) return null
  return readJson<Transcript | null>(join(rec.folder, rec.transcriptFile), null)
}

/**
 * Chạy whisper RIÊNG cho từng audio track. Nhãn người nói đến từ chỗ ngồi của track trong file,
 * không đến từ thuật toán đoán giọng - nên nó đúng tuyệt đối, không phải đúng theo xác suất.
 */
export async function transcribeRecording(
  id: string,
  model: WhisperModelName,
  language: string,
  onProgress: ProgressSink,
  signal?: AbortSignal,
): Promise<Transcript | null> {
  const rec = await getRecording(id)
  if (!rec) return null

  const tracks = rec.audioTracks?.length ? rec.audioTracks : (['me', 'them'] as Speaker[])
  const source = join(rec.folder, rec.videoFile)
  const wavs: string[] = []

  try {
    onProgress({ recordingId: id, phase: 'model', percent: 0 })
    await ensureModel(model, (percent) => onProgress({ recordingId: id, phase: 'model', percent }))

    const perTrack = new Map<Speaker, TranscriptSegment[]>()
    const failures: string[] = []

    for (const [index, speaker] of tracks.entries()) {
      const wav = join(rec.folder, `.track-${index}.wav`)
      wavs.push(wav)

      try {
      onProgress({ recordingId: id, phase: 'extracting', percent: 0, track: speaker })
      await runFfmpeg(buildWavExtractArgs(source, wav, index), { signal })

      const raw = await runWhisper({
        wavPath: wav,
        model,
        language,
        signal,
        // Hai track chạy tuần tự nên tiến độ tổng là phần của track này cộng phần đã xong.
        onProgress: (percent) =>
          onProgress({
            recordingId: id,
            phase: 'transcribing',
            percent: Math.round((index * 100 + percent) / tracks.length),
            track: speaker,
          }),
      })
      perTrack.set(speaker, parseWhisperJson(raw, speaker))
      } catch (err) {
        if (signal?.aborted) throw err
        // Bản ghi cũ có thể khai sai số track, hoặc một track hỏng. Mất một bên vẫn hơn mất cả hai.
        failures.push(`${speaker}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (perTrack.size === 0) throw new Error(`Không gỡ băng được track nào (${failures.join('; ')})`)

    const mine = perTrack.get('me') ?? []
    const theirs = perTrack.get('them') ?? []
    const transcript: Transcript = {
      language,
      model,
      createdAt: new Date().toISOString(),
      segments: mergeTranscripts(mine, theirs),
    }

    await writeJson(join(rec.folder, TRANSCRIPT_FILE), transcript)
    await patchRecording(id, { transcriptFile: TRANSCRIPT_FILE })
    onProgress({
      recordingId: id,
      phase: 'done',
      percent: 100,
      message: failures.length > 0 ? `Thiếu ${failures.length} track: ${failures.join('; ')}` : undefined,
    })
    return transcript
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onProgress({ recordingId: id, phase: 'error', percent: 0, message })
    return null
  } finally {
    // WAV 16 kHz của một giờ ghi là ~115 MB mỗi track, không có lý do gì giữ lại.
    await Promise.all(wavs.map((w) => fs.rm(w, { force: true })))
  }
}

export interface TranscriptHit {
  recording: Recording
  atMs: number
  speaker: Speaker
  text: string
}

/** Tìm toàn văn xuyên nhiều bản ghi (T-05); bản ghi chưa có transcript thì bỏ qua. */
export async function searchAllTranscripts(
  recordings: Recording[],
  query: string,
  limitPerRecording = 5,
): Promise<TranscriptHit[]> {
  const { searchSegments } = await import('@shared/transcript')
  const hits: TranscriptHit[] = []
  for (const rec of recordings) {
    const transcript = await readTranscript(rec)
    if (!transcript) continue
    for (const hit of searchSegments(transcript.segments, query).slice(0, limitPerRecording)) {
      hits.push({ recording: rec, atMs: hit.segment.startMs, speaker: hit.segment.speaker, text: hit.segment.text })
    }
  }
  return hits
}
