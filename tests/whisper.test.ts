import { describe, expect, it } from 'vitest'
import { buildWhisperArgs, modelUrl, parseWhisperProgress, WHISPER_MODELS } from '@shared/whisper'
import { buildWavExtractArgs } from '@shared/ffmpeg'

describe('buildWhisperArgs', () => {
  const args = buildWhisperArgs({
    modelPath: '/models/ggml-small.bin',
    wavPath: '/tmp/track-0.wav',
    outputPrefix: '/tmp/track-0',
    language: 'vi',
  })
  const joined = args.join(' ')

  it('yêu cầu đầu ra JSON để đọc được offsets', () => {
    expect(args).toContain('-oj')
    expect(joined).toContain('-of /tmp/track-0')
  })
  it('truyền đúng model, file và ngôn ngữ', () => {
    expect(joined).toContain('-m /models/ggml-small.bin')
    expect(joined).toContain('-f /tmp/track-0.wav')
    expect(joined).toContain('-l vi')
  })
  it('bật in tiến độ và tắt in transcript ra stdout', () => {
    expect(args).toContain('-pp')
    expect(args).toContain('-np')
  })
  it('cho phép chỉnh số luồng', () => {
    expect(buildWhisperArgs({ modelPath: 'm', wavPath: 'w', outputPrefix: 'o', language: 'vi', threads: 6 })).toContain('6')
  })
})

describe('parseWhisperProgress', () => {
  it('đọc phần trăm từ dòng log của whisper.cpp', () => {
    expect(parseWhisperProgress('whisper_print_progress_callback: progress =  35%')).toBe(35)
  })
  it('lấy giá trị mới nhất khi một khối có nhiều dòng', () => {
    expect(parseWhisperProgress('progress = 10%\nprogress = 60%\n')).toBe(60)
  })
  it('trả null cho khối không có tiến độ', () => {
    expect(parseWhisperProgress('whisper_init_from_file_with_params_no_state: loading model')).toBeNull()
  })
  it('kẹp giá trị trong khoảng 0-100', () => {
    expect(parseWhisperProgress('progress = 250%')).toBe(100)
  })
})

describe('model', () => {
  it('URL trỏ đúng tên file ggml', () => {
    expect(modelUrl('medium')).toContain('ggml-medium.bin')
  })
  it('mọi model đều khai báo dung lượng để cảnh báo trước khi tải', () => {
    expect(Object.values(WHISPER_MODELS).every((m) => m.sizeMb > 0)).toBe(true)
  })
})

describe('buildWavExtractArgs', () => {
  const args = buildWavExtractArgs('/rec/recording.mp4', '/tmp/t1.wav', 1)
  it('chọn đúng track theo chỉ số', () => {
    expect(args.join(' ')).toContain('-map 0:a:1')
  })
  it('ép về 16 kHz mono - định dạng duy nhất whisper nhận', () => {
    const joined = args.join(' ')
    expect(joined).toContain('-ac 1')
    expect(joined).toContain('-ar 16000')
    expect(joined).toContain('-c:a pcm_s16le')
  })
})
