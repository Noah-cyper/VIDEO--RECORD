import Anthropic from '@anthropic-ai/sdk'
import { join } from 'node:path'
import type { StoredSummary } from '@shared/summary'
import { buildSummaryPrompt, summarizeLocal } from '@shared/summary'
import { getRecording, patchRecording } from './library'
import { readTranscript } from './transcribe'
import { getSettings } from './settings'
import { getApiKey } from './secrets'
import { readJson, writeJson } from './jsonstore'

export const SUMMARY_FILE = 'summary.json'
const MODEL = 'claude-opus-5'

export async function readSummary(id: string): Promise<StoredSummary | null> {
  const rec = await getRecording(id)
  if (!rec?.summaryFile) return null
  return readJson<StoredSummary | null>(join(rec.folder, rec.summaryFile), null)
}

export class CloudSummaryUnavailable extends Error {}

/**
 * Mặc định tóm tắt cục bộ. Đường qua API chỉ chạy khi người dùng đã bật công tắc VÀ đã nhập khoá -
 * nội dung cuộc gọi có cả lời của người khác, nên việc nó rời khỏi máy phải là hành động
 * có ý thức chứ không phải hệ quả phụ của một tính năng bật sẵn (NFR-06).
 */
export async function summarizeRecording(id: string, useCloud: boolean): Promise<StoredSummary | null> {
  const rec = await getRecording(id)
  if (!rec) return null
  const transcript = await readTranscript(rec)
  if (!transcript || transcript.segments.length === 0) return null

  const local = summarizeLocal(transcript.segments)
  let stored: StoredSummary = {
    createdAt: new Date().toISOString(),
    source: 'local-extractive',
    keyPoints: local.keyPoints,
    actionItems: local.actionItems,
  }

  if (useCloud) {
    const settings = await getSettings()
    if (!settings.allowCloudSummary) {
      throw new CloudSummaryUnavailable('Tính năng gửi transcript ra dịch vụ ngoài đang tắt trong Cài đặt.')
    }
    const apiKey = await getApiKey()
    if (!apiKey) throw new CloudSummaryUnavailable('Chưa có khoá API. Nhập khoá ở màn hình Cài đặt.')

    const client = new Anthropic({ apiKey })
    // Transcript một giờ gọi có thể rất dài -> stream để không đụng timeout của request.
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: buildSummaryPrompt(transcript.segments, rec.title) }],
    })
    const message = await stream.finalMessage()

    if (message.stop_reason === 'refusal') {
      throw new CloudSummaryUnavailable('Dịch vụ đã từ chối xử lý nội dung này. Bản tóm tắt cục bộ vẫn được giữ.')
    }
    const markdown = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (markdown) stored = { ...stored, source: 'cloud', model: message.model, markdown }
  }

  await writeJson(join(rec.folder, SUMMARY_FILE), stored)
  await patchRecording(id, { summaryFile: SUMMARY_FILE })
  return stored
}
