import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseProgress, percentFrom, type FfmpegProgress } from '@shared/ffmpeg'

/** Sidecar đi kèm app; khi dev thì lấy từ resources/, khi đóng gói thì từ process.resourcesPath. */
/**
 * Danh sách nơi đã tìm, trả ra được để thông báo lỗi nói rõ "đã tìm ở đâu" thay vì chỉ "không thấy".
 * Không dựa vào app.getAppPath(): khi chạy chưa đóng gói nó trỏ vào thư mục của script đang chạy,
 * không phải gốc dự án.
 */
export function ffmpegCandidates(): string[] {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  if (app.isPackaged) return [join(process.resourcesPath, 'ffmpeg', name)]
  return [
    join(process.cwd(), 'resources', 'ffmpeg', name),
    join(process.cwd(), 'node_modules', 'ffmpeg-static', name),
    join(app.getAppPath(), 'resources', 'ffmpeg', name),
    join(app.getAppPath(), 'node_modules', 'ffmpeg-static', name),
  ]
}

export function ffmpegPath(): string {
  for (const c of ffmpegCandidates()) if (existsSync(c)) return c
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg' // để PATH lo
}

let available: boolean | null = null

/**
 * Chạy thử thật, không suy từ đường dẫn. Biết trước khi ghi quan trọng hơn nhiều so với biết
 * sau khi người dùng đã ghi xong một cuộc gọi và mất nó ở bước xuất file.
 */
export async function ffmpegAvailable(): Promise<boolean> {
  if (available !== null) return available
  available = await new Promise<boolean>((resolve) => {
    const child = spawn(ffmpegPath(), ['-version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
  return available
}

export class FfmpegMissingError extends Error {
  constructor() {
    super(
      'Không tìm thấy FFmpeg. Đã tìm ở:\n' +
        ffmpegCandidates().map((c) => `  ${c}`).join('\n') +
        '\nvà trong PATH.',
    )
    this.name = 'FfmpegMissingError'
  }
}

export interface RunOptions {
  totalMs?: number
  onProgress?: (percent: number, p: FfmpegProgress) => void
  signal?: AbortSignal
}

export function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath()
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
      const p = parseProgress(chunk)
      if (p && opts.onProgress) opts.onProgress(percentFrom(p, opts.totalMs ?? 0), p)
    })
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000)
    })

    opts.signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true })

    child.on('error', (err) => {
      reject((err as NodeJS.ErrnoException).code === 'ENOENT' ? new FfmpegMissingError() : err)
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg thoát với mã ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
  })
}
