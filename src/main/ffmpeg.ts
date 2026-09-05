import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseProgress, percentFrom, type FfmpegProgress } from '@shared/ffmpeg'

/** Sidecar đi kèm app; khi dev thì lấy từ resources/, khi đóng gói thì từ process.resourcesPath. */
export function ffmpegPath(): string {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'ffmpeg', name)]
    : [
        join(app.getAppPath(), 'resources', 'ffmpeg', name),
        // ffmpeg-static là devDependency: nhờ nó mà `npm run dev` chạy được ngay, không bắt
        // lập trình viên tự tải binary. Bản đóng gói không có nó nên nhánh này chỉ dùng khi dev.
        join(app.getAppPath(), 'node_modules', 'ffmpeg-static', name),
      ]
  for (const c of candidates) if (existsSync(c)) return c
  return name // để PATH lo, hữu ích khi dev trên máy đã cài sẵn ffmpeg
}

export class FfmpegMissingError extends Error {
  constructor() {
    super('Không tìm thấy FFmpeg. Đặt binary vào resources/ffmpeg/ hoặc cài FFmpeg vào PATH.')
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
