import Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { LiveStartInput, LiveStartResult } from '@shared/ipc'
import { CH } from '@shared/ipc'
import {
  buildLivePrompt, cleanLiveText, encodeWav, liveTargetMode, MAX_SEGMENT_BYTES, pushBounded,
  stripQuotes, type LiveCaption,
} from '@shared/live'
import { parseWhisperJson, type Speaker } from '@shared/transcript'
import { languageLabel, TARGET_LANGUAGES } from '@shared/translate'
import type { WhisperModelName } from '@shared/whisper'
import { getSettings } from './settings'
import { getApiKey } from './secrets'
import { ensureModel, runWhisper, whisperAvailable } from './whisper'
import { broadcast, setOverlayCaptions } from './windows'

const MODEL = 'claude-opus-5'

interface LiveSession {
  id: string
  target: string
  targetName: string
  model: WhisperModelName
  language: string
  client: Anthropic | null
}

interface Job {
  id: number
  speaker: Speaker
  atMs: number
  pcm: Buffer
}

let session: LiveSession | null = null
let queue: Job[] = []
let draining = false
let seq = 0
let reportedError = false

const workDir = () => join(app.getPath('temp'), 'callrec-live')

/** Mã ngôn ngữ từ renderer đi vào prompt gửi ra ngoài; chỉ nhận đúng những mã app tự khai. */
function targetName(code: string): string | null {
  if (!code) return ''
  return TARGET_LANGUAGES.some((l) => l.code === code) ? languageLabel(code) : null
}

export async function startLive(input: LiveStartInput): Promise<LiveStartResult> {
  const name = targetName(input.target)
  if (name === null) return { ok: false, reason: 'bad-target' }
  if (!(await whisperAvailable())) return { ok: false, reason: 'no-binary' }

  const settings = await getSettings()
  let client: Anthropic | null = null
  if (liveTargetMode(input.target) === 'cloud') {
    const apiKey = settings.allowCloudSummary ? await getApiKey() : null
    if (!apiKey) return { ok: false, reason: 'cloud-off' }
    client = new Anthropic({ apiKey })
  }

  try {
    // Tải model TRƯỚC khi nhận đoạn tiếng đầu tiên: tải giữa chừng thì mấy phút đầu cuộc gọi
    // không có phụ đề mà người dùng không hiểu vì sao.
    await ensureModel(input.model)
    await fs.mkdir(workDir(), { recursive: true })
  } catch (err) {
    return { ok: false, reason: 'model', message: err instanceof Error ? err.message : String(err) }
  }

  session = {
    id: input.sessionId,
    target: input.target,
    targetName: name,
    model: input.model,
    language: settings.language,
    client,
  }
  queue = []
  reportedError = false
  setOverlayCaptions(true)
  return { ok: true }
}

export async function stopLive(): Promise<void> {
  session = null
  queue = []
  setOverlayCaptions(false)
  // Đoạn tiếng nằm trong thư mục tạm là lời thoại thật; dọn ngay chứ không đợi hệ điều hành.
  await fs.rm(workDir(), { recursive: true, force: true }).catch(() => undefined)
}

export function pushLiveAudio(sessionId: string, speaker: Speaker, atMs: number, pcm: Buffer): void {
  if (!session || session.id !== sessionId) return
  if (speaker !== 'me' && speaker !== 'them') return
  if (!Number.isFinite(atMs) || atMs < 0) return
  if (pcm.byteLength < 2 || pcm.byteLength > MAX_SEGMENT_BYTES) return

  const pushed = pushBounded(queue, { id: ++seq, speaker, atMs, pcm })
  queue = pushed.queue
  // Bỏ đoạn cũ là mất lời, nên phải nói ra; im lặng thì người dùng tưởng bên kia không nói gì.
  if (pushed.dropped > 0) {
    broadcast(CH.alert, { kind: 'info', messageKey: 'live.behind' })
  }
  void drain()
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    // Một tiến trình whisper tại một thời điểm: chạy song song thì hai luồng giành CPU với chính
    // việc ghi hình, và NFR-01 vỡ trước khi phụ đề kịp có ích.
    while (session && queue.length > 0) {
      const job = queue.shift() as Job
      const current = session
      try {
        await transcribeSegment(current, job)
      } catch (err) {
        if (!reportedError) {
          reportedError = true
          broadcast(CH.alert, {
            kind: 'stream-error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  } finally {
    draining = false
  }
}

async function transcribeSegment(current: LiveSession, job: Job): Promise<void> {
  const wav = join(workDir(), `seg-${job.id}.wav`)
  // Uint8Array.from sao chép ra buffer riêng, căn đúng 2 byte - đọc thẳng buffer của IPC có thể
  // lệch offset và Int16Array sẽ ném lỗi.
  const bytes = Uint8Array.from(job.pcm)
  await fs.writeFile(wav, encodeWav(new Int16Array(bytes.buffer)))

  try {
    const raw = await runWhisper({
      wavPath: wav,
      model: current.model,
      language: current.language,
      translate: liveTargetMode(current.target) === 'local',
    })
    if (session !== current) return

    const text = cleanLiveText(
      parseWhisperJson(raw, job.speaker)
        .map((s) => s.text)
        .join(' '),
    )
    if (!text) return

    const needsCloud = liveTargetMode(current.target) === 'cloud'
    const caption: LiveCaption = { id: job.id, speaker: job.speaker, atMs: job.atMs, text, pending: needsCloud }
    broadcast(CH.liveCaption, caption)
    // Không await: bản dịch tới sau vài giây, còn hàng đợi gỡ băng phải chạy tiếp ngay.
    if (needsCloud) void translateCaption(current, caption)
  } finally {
    await fs.rm(wav, { force: true }).catch(() => undefined)
  }
}

async function translateCaption(current: LiveSession, caption: LiveCaption): Promise<void> {
  try {
    const message = await (current.client as Anthropic).beta.messages.create({
      model: MODEL,
      max_tokens: 1000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Dịch một câu thoại ngắn không cần nghĩ sâu, mà độ trễ ở đây là thứ người dùng cảm nhận được.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: buildLivePrompt(caption.text, current.targetName) }],
    })
    if (session !== current || message.stop_reason === 'refusal') return

    const translated = stripQuotes(
      message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' '),
    )
    broadcast(CH.liveCaption, { ...caption, pending: false, translated: translated || undefined })
  } catch (err) {
    // Mất bản dịch một câu không đáng dừng cả phiên; giữ nguyên văn và báo đúng một lần.
    broadcast(CH.liveCaption, { ...caption, pending: false })
    if (!reportedError) {
      reportedError = true
      broadcast(CH.alert, { kind: 'stream-error', message: err instanceof Error ? err.message : String(err) })
    }
  }
}
