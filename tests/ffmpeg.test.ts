import { describe, expect, it } from 'vitest'
import { buildAudioExtractArgs, buildExportArgs, buildThumbnailArgs, inputsFromManifest, parseProgress, percentFrom } from '@shared/ffmpeg'
import type { SessionManifest } from '@shared/types'

const full = {
  inputs: { mic: '/s/mic.webm', system: '/s/system.webm', video: '/s/video.webm' },
  offsetsMs: { mic: 0, system: 42, video: 118 },
  output: '/out/recording.mp4',
}

describe('buildExportArgs', () => {
  const args = buildExportArgs(full)
  const joined = args.join(' ')

  it('bù offset cho từng input', () => {
    expect(joined).toContain('-itsoffset 0.000 -i /s/mic.webm')
    expect(joined).toContain('-itsoffset 0.042 -i /s/system.webm')
    expect(joined).toContain('-itsoffset 0.118 -i /s/video.webm')
  })

  it('chuẩn hoá âm lượng riêng từng track, không chuẩn hoá sau khi trộn', () => {
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toBe('[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a_me];[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a_them]')
    expect(filter).not.toContain('amix')
  })

  it('giữ hai audio track riêng biệt trong file đích', () => {
    expect(joined).toContain('-map [a_me]')
    expect(joined).toContain('-map [a_them]')
    expect(joined).toContain('-metadata:s:a:0 title=Toi')
    expect(joined).toContain('-metadata:s:a:1 title=Doi phuong')
    // handler_name là chỗ MP4 thật sự lưu nhãn track.
    expect(joined).toContain('-metadata:s:a:0 handler_name=Toi')
    expect(joined).toContain('-metadata:s:a:1 handler_name=Doi phuong')
  })

  it('không encode lại video theo mặc định', () => {
    expect(joined).toContain('-c:v copy')
    expect(joined).not.toContain('libx264')
  })

  it('bật faststart và ghi tiến độ ra stdout', () => {
    expect(joined).toContain('-movflags +faststart')
    expect(joined).toContain('-progress pipe:1')
    expect(args[args.length - 1]).toBe('/out/recording.mp4')
  })

  it('encode lại khi yêu cầu h264', () => {
    const a = buildExportArgs({ ...full, videoCodec: 'h264' }).join(' ')
    expect(a).toContain('-c:v libx264')
    expect(a).toContain('-crf 23')
  })
})

describe('buildExportArgs khi thiếu luồng', () => {
  it('ghi chỉ có tiếng vẫn ra hai track', () => {
    const a = buildExportArgs({
      inputs: { mic: '/s/mic.webm', system: '/s/system.webm' },
      offsetsMs: { mic: 0, system: 10 },
      output: '/out/a.m4a',
    }).join(' ')
    expect(a).toContain('-map [a_me]')
    expect(a).toContain('-map [a_them]')
    expect(a).not.toContain('-c:v')
  })

  it('mất mic vẫn xuất được phía đối phương, và index input phải dịch lại', () => {
    const a = buildExportArgs({
      inputs: { system: '/s/system.webm', video: '/s/video.webm' },
      offsetsMs: { system: 0, video: 60 },
      output: '/out/a.mp4',
    })
    const filter = a[a.indexOf('-filter_complex') + 1]
    expect(filter).toBe('[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a_them]')
    expect(a.join(' ')).toContain('-map 1:v')
    expect(a.join(' ')).toContain('-metadata:s:a:0 title=Doi phuong')
  })

  it('báo lỗi rõ ràng khi không có luồng nào', () => {
    expect(() => buildExportArgs({ inputs: {}, offsetsMs: {}, output: '/out/a.mp4' })).toThrow(/Không có luồng nào/)
  })
})

describe('parseProgress', () => {
  it('đổi micro giây sang mili giây', () => {
    expect(parseProgress('out_time_ms=12345678\nspeed=1.5x\nprogress=continue')).toEqual({
      outTimeMs: 12_346,
      speed: 1.5,
      done: false,
    })
  })
  it('nhận biết kết thúc', () => {
    expect(parseProgress('progress=end')?.done).toBe(true)
  })
  it('bỏ qua khối không chứa thông tin tiến độ', () => {
    expect(parseProgress('random noise\n')).toBeNull()
  })
})

describe('percentFrom', () => {
  it('không báo 100% trước khi thực sự xong', () => {
    expect(percentFrom({ outTimeMs: 600_000, speed: 1, done: false }, 600_000)).toBe(99)
  })
  it('trả 100 khi ffmpeg báo end', () => {
    expect(percentFrom({ outTimeMs: 0, speed: 0, done: true }, 0)).toBe(100)
  })
  it('không chia cho 0', () => {
    expect(percentFrom({ outTimeMs: 500, speed: 1, done: false }, 0)).toBe(0)
  })
})

describe('inputsFromManifest', () => {
  it('chỉ lấy những luồng thực sự có trong manifest', () => {
    const manifest = {
      streams: { mic: { file: 'mic.webm', offsetMs: 0 }, video: { file: 'video.webm', offsetMs: 90 } },
    } as unknown as SessionManifest
    const { inputs, offsetsMs } = inputsFromManifest(manifest, (f) => `/s/${f}`)
    expect(inputs).toEqual({ mic: '/s/mic.webm', video: '/s/video.webm' })
    expect(offsetsMs).toEqual({ mic: 0, video: 90 })
  })
})

describe('lệnh phụ trợ', () => {
  it('thumbnail lấy đúng mốc thời gian', () => {
    expect(buildThumbnailArgs('/a.mp4', '/t.jpg', 7).join(' ')).toContain('-ss 7 -i /a.mp4')
  })
  it('tách audio theo chỉ số track', () => {
    expect(buildAudioExtractArgs('/a.mp4', '/o.m4a', 1).join(' ')).toContain('-map 0:a:1')
  })
})
