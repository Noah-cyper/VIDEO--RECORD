import { describe, expect, it } from 'vitest'
import { buildAudioExtractArgs, buildExportArgs, buildThumbnailArgs, inputsFromManifest, parseProgress, percentFrom, rawRescuePlan, filterUsableInputs, MIN_USABLE_INPUT_BYTES, buildRemuxArgs,
} from '@shared/ffmpeg'
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

describe('kế hoạch cứu file thô', () => {
  const paths = { mic: '/s/mic.webm', system: '/s/system.webm', video: '/s/video.webm' }

  it('chép cả ba luồng, giữ nguyên tên theo luồng', () => {
    const plan = rawRescuePlan(paths)
    expect(plan.copies.map((c) => c.to)).toEqual(['mic.webm', 'system.webm', 'video.webm'])
    expect(plan.copies.map((c) => c.from)).toEqual([paths.mic, paths.system, paths.video])
  })

  it('file đại diện là hình khi có hình', () => {
    expect(rawRescuePlan(paths)).toMatchObject({ mainFile: 'video.webm', hasVideo: true })
  })

  it('chỉ có tiếng thì lấy track của mình làm đại diện', () => {
    expect(rawRescuePlan({ mic: paths.mic, system: paths.system })).toMatchObject({
      mainFile: 'mic.webm',
      hasVideo: false,
    })
  })

  it('mất mic thì đại diện là track đối phương, không phải file rỗng', () => {
    expect(rawRescuePlan({ system: paths.system }).mainFile).toBe('system.webm')
  })

  it('không có luồng nào thì nói thẳng chứ đừng tạo bản ghi rỗng', () => {
    expect(() => rawRescuePlan({})).toThrow(/không có file thô/i)
  })
})

describe('loại luồng rỗng trước khi mux', () => {
  const paths = { mic: '/s/mic.webm', system: '/s/system.webm', video: '/s/video.webm' }
  const sizes = (map: Record<string, number>) => (file: string) => map[file] ?? 0

  it('đủ dữ liệu thì giữ nguyên cả ba', () => {
    const big = MIN_USABLE_INPUT_BYTES * 10
    const out = filterUsableInputs(paths, sizes({ [paths.mic]: big, [paths.system]: big, [paths.video]: big }))
    expect(out.dropped).toEqual([])
    expect(out.usable).toEqual(paths)
  })

  /** Ca thật trên Windows: loopback không đẩy byte nào khi không có tiếng phát ra loa. */
  it('system.webm rỗng thì bỏ nó ra, KHÔNG kéo theo mic và hình', () => {
    const big = MIN_USABLE_INPUT_BYTES * 10
    const out = filterUsableInputs(paths, sizes({ [paths.mic]: big, [paths.system]: 0, [paths.video]: big }))
    expect(out.dropped).toEqual(['system'])
    expect(out.usable).toEqual({ mic: paths.mic, video: paths.video })
  })

  it('file chỉ có header cũng coi là rỗng', () => {
    const out = filterUsableInputs({ mic: paths.mic }, sizes({ [paths.mic]: MIN_USABLE_INPUT_BYTES - 1 }))
    expect(out.dropped).toEqual(['mic'])
    expect(out.usable).toEqual({})
  })

  it('không đọc được kích thước thì coi như rỗng, đừng đưa vào lệnh ffmpeg', () => {
    expect(filterUsableInputs(paths, () => 0).usable).toEqual({})
  })
})

describe('nhét thẳng vào WebM khi không dựng được MP4', () => {
  const inputs = { mic: '/s/mic.webm', system: '/s/system.webm', video: '/s/video.webm' }
  const args = buildRemuxArgs({ inputs, offsetsMs: { mic: 0, system: 42, video: 118 }, output: '/out/rec.webm' })

  it('không encode lại gì cả - đó là toàn bộ lý do bậc này tồn tại', () => {
    expect(args.join(' ')).toContain('-c copy')
    expect(args.join(' ')).not.toContain('libx264')
    expect(args.join(' ')).not.toContain('loudnorm')
  })

  it('vẫn bù lệch từng luồng như đường xuất chính', () => {
    expect(args.join(' ')).toContain('-itsoffset 0.042 -i /s/system.webm')
    expect(args.join(' ')).toContain('-itsoffset 0.118 -i /s/video.webm')
  })

  it('giữ đủ hai track tiếng, có nhãn, đúng thứ tự mic trước', () => {
    const joined = args.join(' ')
    expect(joined).toContain('-metadata:s:a:0 title=Toi')
    expect(joined).toContain('-metadata:s:a:1 title=Doi phuong')
  })

  it('thiếu luồng nào thì bỏ luồng đó, không dựng lệnh rỗng', () => {
    expect(buildRemuxArgs({ inputs: { mic: '/s/mic.webm' }, offsetsMs: {}, output: '/o.webm' }).join(' '))
      .toContain('-map 0:a')
    expect(() => buildRemuxArgs({ inputs: {}, offsetsMs: {}, output: '/o.webm' })).toThrow(/không có luồng/i)
  })
})
