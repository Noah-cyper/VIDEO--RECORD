export type WhisperModelName = 'tiny' | 'base' | 'small' | 'medium'

export interface WhisperModel {
  name: WhisperModelName
  file: string
  sizeMb: number
  label: string
}

/**
 * Model tiếng Việt: `base` chỉ đủ để tra cứu đại ý, `medium` mới là mức dùng được cho biên bản.
 * `small` là điểm cân bằng cho máy yếu. Không đưa `large` vào vì 3 GB và chậm gấp nhiều lần,
 * không tương xứng với mức cải thiện trên hội thoại điện thoại.
 */
export const WHISPER_MODELS: Record<WhisperModelName, WhisperModel> = {
  tiny: { name: 'tiny', file: 'ggml-tiny.bin', sizeMb: 75, label: 'Tiny — nhanh nhất, độ chính xác thấp' },
  base: { name: 'base', file: 'ggml-base.bin', sizeMb: 142, label: 'Base — nhanh, đủ để tra cứu' },
  small: { name: 'small', file: 'ggml-small.bin', sizeMb: 466, label: 'Small — cân bằng' },
  medium: { name: 'medium', file: 'ggml-medium.bin', sizeMb: 1500, label: 'Medium — chính xác nhất, cần 8 GB RAM' },
}

const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

export function modelUrl(name: WhisperModelName): string {
  return `${MODEL_BASE_URL}/${WHISPER_MODELS[name].file}`
}

export interface WhisperArgs {
  modelPath: string
  wavPath: string
  /** Tiền tố file đầu ra; whisper.cpp tự thêm đuôi .json. */
  outputPrefix: string
  language: string
  threads?: number
  /** whisper.cpp chỉ dịch được sang tiếng Anh; dùng cho phụ đề trực tiếp không cần mạng. */
  translate?: boolean
}

export function buildWhisperArgs(opts: WhisperArgs): string[] {
  return [
    '-m', opts.modelPath,
    '-f', opts.wavPath,
    '-l', opts.language,
    '-oj',
    '-of', opts.outputPrefix,
    '-t', String(opts.threads ?? 4),
    ...(opts.translate ? ['-tr'] : []),
    // -pp để đọc được tiến độ; -np bỏ phần in transcript ra stdout cho đỡ rác.
    '-pp',
    '-np',
  ]
}

/** whisper.cpp in tiến độ ra stderr dạng `whisper_print_progress_callback: progress =  35%`. */
export function parseWhisperProgress(chunk: string): number | null {
  let latest: number | null = null
  for (const match of chunk.matchAll(/progress\s*=\s*(\d+)%/g)) {
    const value = Number(match[1])
    if (Number.isFinite(value)) latest = Math.min(100, Math.max(0, value))
  }
  return latest
}

/** Whisper chỉ nhận WAV 16 kHz mono; đưa vào định dạng khác nó sẽ từ chối hoặc ra kết quả rác. */
export const WHISPER_SAMPLE_RATE = 16000
