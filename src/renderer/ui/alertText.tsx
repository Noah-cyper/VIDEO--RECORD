import type { CaptureAlert } from '@shared/types'
import type { TranslationKey } from '@shared/i18n'
import type { Translator } from './i18n'

/** Cảnh báo có thể mang khoá dịch (từ engine) hoặc chuỗi đã thành hình (từ hệ điều hành, ffmpeg). */
export function alertText(t: Translator, alert: CaptureAlert): string {
  if (alert.messageKey) return t(alert.messageKey as TranslationKey, alert.params)
  return alert.message ?? ''
}
