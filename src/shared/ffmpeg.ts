import type { SessionManifest, StreamKind } from './types'
import { offsetToSeconds } from './time'

export interface ExportOptions {
  /** Đường dẫn tuyệt đối tới từng file thô, thiếu luồng nào thì bỏ trống luồng đó. */
  inputs: Partial<Record<StreamKind, string>>
  offsetsMs: Partial<Record<StreamKind, number>>
  output: string
  /** copy = không encode lại video, nhanh hơn nhiều lần. Chỉ dùng h264 khi container đích cần. */
  videoCodec?: 'copy' | 'h264'
  audioBitrate?: string
  labels?: { mic: string; system: string }
}

const LOUDNORM = 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000'
const ORDER: StreamKind[] = ['mic', 'system', 'video']

/**
 * Mux hai track audio riêng biệt vào một MP4. Chuẩn hoá âm lượng RIÊNG từng track -
 * chuẩn hoá sau khi trộn sẽ kéo bên nói to hơn át bên kia (docs/03 mục 4.4).
 */
export function buildExportArgs(opts: ExportOptions): string[] {
  const present = ORDER.filter((k) => opts.inputs[k])
  if (present.length === 0) throw new Error('Không có luồng nào để xuất')

  const index = new Map<StreamKind, number>()
  const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error']

  present.forEach((kind, i) => {
    index.set(kind, i)
    args.push('-itsoffset', offsetToSeconds(opts.offsetsMs[kind] ?? 0), '-i', opts.inputs[kind] as string)
  })

  const filters: string[] = []
  const maps: string[] = []

  const video = index.get('video')
  if (video !== undefined) maps.push('-map', `${video}:v`)

  const labels = opts.labels ?? { mic: 'Toi', system: 'Doi phuong' }
  const audioTracks: { kind: StreamKind; label: string }[] = []

  for (const kind of ['mic', 'system'] as const) {
    const i = index.get(kind)
    if (i === undefined) continue
    const tag = kind === 'mic' ? 'a_me' : 'a_them'
    filters.push(`[${i}:a]${LOUDNORM}[${tag}]`)
    maps.push('-map', `[${tag}]`)
    audioTracks.push({ kind, label: labels[kind] })
  }

  if (filters.length > 0) args.push('-filter_complex', filters.join(';'))
  args.push(...maps)

  if (video !== undefined) args.push('-c:v', opts.videoCodec === 'h264' ? 'libx264' : 'copy')
  if (opts.videoCodec === 'h264') args.push('-preset', 'veryfast', '-crf', '23')

  if (audioTracks.length > 0) args.push('-c:a', 'aac', '-b:a', opts.audioBitrate ?? '128k')

  audioTracks.forEach((t, i) => {
    // MP4 không lưu 'title' cho từng track - nhãn thật nằm ở handler_name (đã kiểm chứng bằng
    // test tích hợp). Vẫn ghi cả title để container khác (MKV, WebM) hiển thị đúng.
    args.push(
      `-metadata:s:a:${i}`, `title=${t.label}`,
      `-metadata:s:a:${i}`, `handler_name=${t.label}`,
      `-metadata:s:a:${i}`, 'language=vie',
    )
  })

  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', opts.output)
  return args
}

/**
 * MediaRecorder chỉ cho h264 trên một số máy; chỗ còn lại trả về VP8/VP9. VP8 không nhét được
 * vào MP4 và VP9 thì cần cờ experimental, nên "copy" chỉ an toàn khi nguồn đã là h264 -
 * còn lại buộc phải encode lại, chậm hơn nhưng ra file mở được ở mọi nơi.
 */
export function videoCodecFor(mimeType: string | undefined): 'copy' | 'h264' {
  return mimeType && /h264|avc1/i.test(mimeType) ? 'copy' : 'h264'
}

export function buildThumbnailArgs(input: string, output: string, atSeconds = 10): string[] {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(atSeconds), '-i', input,
    '-frames:v', '1', '-vf', 'scale=480:-2',
    output,
  ]
}

/** Tách riêng file audio cho bản ghi chỉ cần tiếng (FR-14). */
export function buildAudioExtractArgs(input: string, output: string, track = 0): string[] {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-map', `0:a:${track}`, '-c:a', 'aac', '-b:a', '128k', output]
}

export interface FfmpegProgress {
  outTimeMs: number
  speed: number
  done: boolean
}

/**
 * `-progress pipe:1` trả về từng khối key=value. Lưu ý out_time_ms thực chất là MICRO giây
 * chứ không phải mili giây như tên gọi - đây là quirk lâu năm của ffmpeg.
 */
export function parseProgress(chunk: string): FfmpegProgress | null {
  const out: FfmpegProgress = { outTimeMs: 0, speed: 0, done: false }
  let seen = false
  for (const line of chunk.split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key === 'out_time_ms' || key === 'out_time_us') {
      const n = Number(value)
      if (Number.isFinite(n)) {
        out.outTimeMs = Math.round(n / 1000)
        seen = true
      }
    } else if (key === 'speed') {
      out.speed = parseFloat(value) || 0
      seen = true
    } else if (key === 'progress') {
      out.done = value === 'end'
      seen = true
    }
  }
  return seen ? out : null
}

export function percentFrom(progress: FfmpegProgress, totalMs: number): number {
  if (progress.done) return 100
  if (totalMs <= 0) return 0
  return Math.min(99, Math.round((progress.outTimeMs / totalMs) * 100))
}

/** Luồng nào cũng có thể thiếu (mic tắt, ghi audio-only) nên phải suy ra từ manifest. */
export function inputsFromManifest(manifest: SessionManifest, resolve: (file: string) => string) {
  const inputs: Partial<Record<StreamKind, string>> = {}
  const offsetsMs: Partial<Record<StreamKind, number>> = {}
  for (const kind of ORDER) {
    const s = manifest.streams[kind]
    if (!s) continue
    inputs[kind] = resolve(s.file)
    offsetsMs[kind] = s.offsetMs
  }
  return { inputs, offsetsMs }
}
