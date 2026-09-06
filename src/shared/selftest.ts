/** Dưới ngưỡng này coi như không có tín hiệu; nhiễu nền của micro thường quanh 0.001-0.005. */
export const SIGNAL_THRESHOLD = 0.01

export interface StreamProbe {
  /** Tên thiết bị hoặc nguồn mà hệ điều hành báo về; rất hữu ích khi chẩn đoán từ xa. */
  label: string
  peak: number
}

export interface SelfTestInput {
  mic: StreamProbe | null
  system: StreamProbe | null
}

/**
 * Mỗi mã tương ứng một câu chẩn đoán cụ thể. Đây là câu trả lời cho câu hỏi lớn nhất của cả dự án:
 * "máy này có bắt được tiếng cả hai bên không" - trước đó chỉ trả lời được bằng cách gọi thật rồi
 * nhìn hai thanh mức âm.
 */
export type SelfTestVerdict =
  | 'ok'
  | 'mic-missing'
  | 'mic-silent'
  | 'system-missing'
  | 'system-silent'

export function diagnose(input: SelfTestInput): SelfTestVerdict[] {
  const out: SelfTestVerdict[] = []

  if (!input.mic) out.push('mic-missing')
  else if (input.mic.peak < SIGNAL_THRESHOLD) out.push('mic-silent')

  if (!input.system) out.push('system-missing')
  else if (input.system.peak < SIGNAL_THRESHOLD) out.push('system-silent')

  return out.length === 0 ? ['ok'] : out
}

export function isHealthy(verdicts: SelfTestVerdict[]): boolean {
  return verdicts.length === 1 && verdicts[0] === 'ok'
}

export interface DiagnosticReport {
  version: string
  platform: string
  mic: StreamProbe | null
  system: StreamProbe | null
  verdicts: SelfTestVerdict[]
}

/**
 * Văn bản để người dùng dán lại khi báo lỗi. Cố tình chỉ chứa tên thiết bị và mức tín hiệu -
 * không đụng tới nội dung bản ghi, đường dẫn cá nhân hay khoá API.
 */
export function formatReport(r: DiagnosticReport): string {
  const line = (name: string, p: StreamProbe | null) =>
    p ? `${name}: ${p.label || '(không tên)'} — mức đỉnh ${p.peak.toFixed(4)}` : `${name}: không mở được`
  return [
    `CallRec ${r.version} · ${r.platform}`,
    line('Micro', r.mic),
    line('Âm hệ thống', r.system),
    `Kết luận: ${r.verdicts.join(', ')}`,
  ].join('\n')
}
