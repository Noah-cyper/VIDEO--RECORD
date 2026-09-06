import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { buildWhisperArgs, modelUrl, parseWhisperProgress, WHISPER_MODELS, type WhisperModelName } from '@shared/whisper'

export const modelsDir = () => join(app.getPath('userData'), 'models')

export class WhisperMissingError extends Error {
  constructor() {
    super(
      'Không tìm thấy whisper.cpp. Đặt binary `whisper-cli` vào resources/whisper/ hoặc cài vào PATH. ' +
        'Xem hướng dẫn ở docs/06-transcript.md.',
    )
    this.name = 'WhisperMissingError'
  }
}

export function whisperPath(): string {
  const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'whisper', name)]
    // Không dùng app.getAppPath() ở đây: chạy chưa đóng gói nó trỏ vào thư mục script, không phải
    // gốc dự án - đúng lỗi đã làm preflight FFmpeg báo nhầm là thiếu.
    : [join(process.cwd(), 'resources', 'whisper', name), join(app.getAppPath(), 'resources', 'whisper', name)]
  for (const c of candidates) if (existsSync(c)) return c
  return name
}

let availability: boolean | null = null

/**
 * Không suy ra từ đường dẫn: nếu whisperPath() rơi về tên trần thì chỉ có cách chạy thử mới biết
 * PATH có nó hay không. Đoán bừa là "có" khiến nút gỡ băng bật lên rồi hỏng lúc người dùng bấm.
 */
export async function whisperAvailable(): Promise<boolean> {
  if (availability !== null) return availability
  const p = whisperPath()
  if (p.includes('/') || p.includes('\\')) {
    availability = existsSync(p)
    return availability
  }
  availability = await new Promise<boolean>((resolve) => {
    const child = spawn(p, ['--help'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', () => resolve(true))
  })
  return availability
}

export function modelPath(name: WhisperModelName): string {
  return join(modelsDir(), WHISPER_MODELS[name].file)
}

export function modelInstalled(name: WhisperModelName): boolean {
  return existsSync(modelPath(name))
}

/**
 * Model tải một lần rồi dùng mãi. Tải qua file tạm và chỉ rename khi xong - tải dở dang mà
 * để nguyên tên thật thì lần sau app tưởng đã có model và whisper sẽ lỗi khó hiểu.
 */
export async function ensureModel(
  name: WhisperModelName,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const target = modelPath(name)
  if (existsSync(target)) return target

  await fs.mkdir(modelsDir(), { recursive: true })
  const tmp = `${target}.part`
  const response = await net.fetch(modelUrl(name))
  if (!response.ok || !response.body) {
    throw new Error(`Không tải được model ${name}: HTTP ${response.status}`)
  }

  const total = Number(response.headers.get('content-length')) || WHISPER_MODELS[name].sizeMb * 1024 * 1024
  const file = createWriteStream(tmp)
  const reader = response.body.getReader()
  let received = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      onProgress?.(Math.min(99, Math.round((received / total) * 100)))
      if (!file.write(Buffer.from(value))) await new Promise<void>((r) => file.once('drain', () => r()))
    }
    await new Promise<void>((resolve, reject) => file.end((err?: Error | null) => (err ? reject(err) : resolve())))
  } catch (err) {
    file.destroy()
    await fs.rm(tmp, { force: true })
    throw err
  }

  await fs.rename(tmp, target)
  onProgress?.(100)
  return target
}

export async function removeModel(name: WhisperModelName): Promise<void> {
  await fs.rm(modelPath(name), { force: true })
}

export interface TranscribeOptions {
  wavPath: string
  model: WhisperModelName
  language: string
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  /** Dịch thẳng sang tiếng Anh trong lúc nhận dạng, dùng cho phụ đề trực tiếp không cần mạng. */
  translate?: boolean
}

/** Trả về nội dung JSON thô của whisper.cpp; việc diễn giải để cho @shared/transcript lo. */
export async function runWhisper(opts: TranscribeOptions): Promise<string> {
  const outputPrefix = opts.wavPath.replace(/\.wav$/i, '')
  const args = buildWhisperArgs({
    modelPath: await ensureModel(opts.model),
    wavPath: opts.wavPath,
    outputPrefix,
    language: opts.language,
    translate: opts.translate,
    threads: Math.max(2, Math.min(8, cpus().length - 1)),
  })

  await new Promise<void>((resolve, reject) => {
    const child = spawn(whisperPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000)
      const percent = parseWhisperProgress(chunk)
      if (percent !== null) opts.onProgress?.(percent)
    })
    opts.signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true })
    child.on('error', (err) =>
      reject((err as NodeJS.ErrnoException).code === 'ENOENT' ? new WhisperMissingError() : err),
    )
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`whisper.cpp thoát với mã ${code}: ${stderr.trim()}`)),
    )
  })

  const jsonPath = `${outputPrefix}.json`
  const raw = await fs.readFile(jsonPath, 'utf-8')
  await fs.rm(jsonPath, { force: true })
  return raw
}
