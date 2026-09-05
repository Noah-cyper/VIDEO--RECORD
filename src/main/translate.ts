import Anthropic from '@anthropic-ai/sdk'
import { join } from 'node:path'
import type { Recording } from '@shared/types'
import type { TranscriptProgress } from '@shared/ipc'
import type { Transcript } from '@shared/transcript'
import { applyTranslation, buildTranslatePrompt, chunkSegments, languageLabel, parseTranslation } from '@shared/translate'
import { getRecording, patchRecording } from './library'
import { readTranscript } from './transcribe'
import { getSettings } from './settings'
import { getApiKey } from './secrets'
import { CloudSummaryUnavailable } from './summarize'
import { readJson, writeJson } from './jsonstore'

const MODEL = 'claude-opus-5'

export const translationFile = (code: string) => `transcript.${code}.json`

export async function readTranslation(rec: Recording, code: string): Promise<Transcript | null> {
  return readJson<Transcript | null>(join(rec.folder, translationFile(code)), null)
}

/**
 * Dịch bằng API, cùng một cánh cửa với tóm tắt: phải bật công tắc VÀ có khoá. Dịch gửi TOÀN BỘ
 * lời thoại ra ngoài, còn nhiều hơn tóm tắt, nên không có lý do gì để nới lỏng hơn.
 */
export async function translateRecording(
  id: string,
  targetCode: string,
  targetName: string,
  onProgress: (p: TranscriptProgress) => void,
  signal?: AbortSignal,
): Promise<Transcript | null> {
  const rec = await getRecording(id)
  if (!rec) return null
  const transcript = await readTranscript(rec)
  if (!transcript || transcript.segments.length === 0) return null

  const settings = await getSettings()
  if (!settings.allowCloudSummary) {
    throw new CloudSummaryUnavailable('Tính năng gửi transcript ra dịch vụ ngoài đang tắt trong Cài đặt.')
  }
  const apiKey = await getApiKey()
  if (!apiKey) throw new CloudSummaryUnavailable('Chưa có khoá API. Nhập khoá ở màn hình Cài đặt.')

  const client = new Anthropic({ apiKey })
  const batches = chunkSegments(transcript.segments)
  const translated: string[] = []

  for (const [index, batch] of batches.entries()) {
    onProgress({
      recordingId: id,
      phase: 'translating',
      percent: Math.round((index / batches.length) * 100),
    })

    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        messages: [{ role: 'user', content: buildTranslatePrompt(batch, targetName) }],
      },
      { signal },
    )
    const message = await stream.finalMessage()

    if (message.stop_reason === 'refusal') {
      throw new CloudSummaryUnavailable('Dịch vụ đã từ chối xử lý nội dung này.')
    }
    const raw = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    const texts = parseTranslation(raw, batch.length)
    if (!texts) {
      throw new Error(
        `Bản dịch trả về không khớp ${batch.length} dòng của mẻ ${index + 1}/${batches.length}. ` +
          'Không ghép được vì mọi mốc thời gian sau đó sẽ lệch.',
      )
    }
    translated.push(...texts)
  }

  const out: Transcript = {
    ...transcript,
    language: targetCode,
    createdAt: new Date().toISOString(),
    segments: applyTranslation(transcript.segments, translated),
  }
  await writeJson(join(rec.folder, translationFile(targetCode)), out)

  const langs = [...new Set([...(rec.translations ?? []), targetCode])]
  await patchRecording(id, { translations: langs })

  onProgress({ recordingId: id, phase: 'done', percent: 100, message: languageLabel(targetCode) })
  return out
}
