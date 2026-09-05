import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { buildExportArgs, buildWavExtractArgs, videoCodecFor } from '@shared/ffmpeg'

const run = promisify(execFile)

async function ffmpegBin(): Promise<string | null> {
  try {
    const mod = (await import('ffmpeg-static')) as unknown as { default: string | null }
    return mod.default ?? null
  } catch {
    return null
  }
}

const bin = await ffmpegBin()
// Không có ffmpeg thì bỏ qua thay vì làm đỏ CI của người chỉ sửa phần giao diện.
const maybe = bin ? describe : describe.skip

maybe('xuất file thật bằng ffmpeg', () => {
  let dir = ''
  const inputs: Record<string, string> = {}

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'callrec-'))
    inputs.mic = join(dir, 'mic.webm')
    inputs.system = join(dir, 'system.webm')
    inputs.video = join(dir, 'video.webm')

    // Hai tần số khác nhau để phân biệt được track nào là track nào khi nghe lại.
    await run(bin!, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'libopus', inputs.mic])
    await run(bin!, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', '-c:a', 'libopus', inputs.system])
    await run(bin!, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=3', '-c:v', 'libvpx', inputs.video])
  }, 120_000)

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  async function probe(file: string): Promise<string> {
    // ffmpeg-static không kèm ffprobe; `-i` in mô tả stream ra stderr rồi thoát với mã lỗi.
    try {
      await run(bin!, ['-hide_banner', '-i', file])
      return ''
    } catch (err) {
      return (err as { stderr?: string }).stderr ?? ''
    }
  }

  it('tạo MP4 có đúng hai audio track riêng biệt', async () => {
    const output = join(dir, 'recording.mp4')
    await run(bin!, buildExportArgs({
      inputs: { mic: inputs.mic, system: inputs.system, video: inputs.video },
      offsetsMs: { mic: 0, system: 42, video: 118 },
      output,
      videoCodec: 'h264',
    }), { maxBuffer: 1 << 24 })

    const info = await probe(output)
    const audioStreams = info.match(/Stream #0:\d+.*: Audio:/g) ?? []
    const videoStreams = info.match(/Stream #0:\d+.*: Video:/g) ?? []

    expect(audioStreams).toHaveLength(2)
    expect(videoStreams).toHaveLength(1)
    // Nhãn track là thứ cho người nghe biết đang nghe ai; mất nhãn là mất nửa giá trị bản ghi.
    expect(info).toContain('handler_name    : Toi')
    expect(info).toContain('handler_name    : Doi phuong')
  }, 120_000)

  it('ghi chỉ có tiếng vẫn giữ hai track', async () => {
    const output = join(dir, 'audio.m4a')
    await run(bin!, buildExportArgs({
      inputs: { mic: inputs.mic, system: inputs.system },
      offsetsMs: { mic: 0, system: 0 },
      output,
    }), { maxBuffer: 1 << 24 })

    const info = await probe(output)
    expect(info.match(/Stream #0:\d+.*: Audio:/g) ?? []).toHaveLength(2)
  }, 120_000)

  it('tách được từng track ra WAV 16 kHz mono cho whisper, và hai track khác nhau thật', async () => {
    const output = join(dir, 'two-track.mp4')
    await run(bin!, buildExportArgs({
      inputs: { mic: inputs.mic, system: inputs.system },
      offsetsMs: { mic: 0, system: 0 },
      output,
    }), { maxBuffer: 1 << 24 })

    const wav0 = join(dir, 't0.wav')
    const wav1 = join(dir, 't1.wav')
    await run(bin!, buildWavExtractArgs(output, wav0, 0))
    await run(bin!, buildWavExtractArgs(output, wav1, 1))

    for (const wav of [wav0, wav1]) {
      const info = await probe(wav)
      expect(info).toContain('16000 Hz')
      expect(info).toContain('mono')
    }

    // Track 0 là sine 440 Hz, track 1 là 880 Hz. Nội dung phải khác nhau - nếu -map 0:a:N sai
    // thì cả hai file sẽ giống hệt và transcript sẽ gán cùng một giọng cho cả hai bên.
    const [a, b] = await Promise.all([readFile(wav0), readFile(wav1)])
    expect(a.equals(b)).toBe(false)
  }, 120_000)

  it('VP8 không copy thẳng vào MP4 được - đây là lý do phải chọn codec theo mimeType', async () => {
    expect(videoCodecFor('video/webm;codecs=vp8')).toBe('h264')
    expect(videoCodecFor('video/webm;codecs=h264')).toBe('copy')

    const output = join(dir, 'broken.mp4')
    await expect(
      run(bin!, buildExportArgs({
        inputs: { mic: inputs.mic, system: inputs.system, video: inputs.video },
        offsetsMs: {},
        output,
        videoCodec: 'copy',
      })),
    ).rejects.toThrow()
  }, 120_000)
})
