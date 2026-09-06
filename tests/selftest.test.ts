import { describe, expect, it } from 'vitest'
import { diagnose, formatReport, isHealthy, SIGNAL_THRESHOLD } from '@shared/selftest'

const probe = (label: string, peak: number) => ({ label, peak })

describe('diagnose', () => {
  it('cả hai luồng có tín hiệu là đạt', () => {
    const v = diagnose({ mic: probe('Yeti', 0.3), system: probe('Loa', 0.2) })
    expect(v).toEqual(['ok'])
    expect(isHealthy(v)).toBe(true)
  })

  it('phân biệt được "không mở được" với "mở được nhưng câm"', () => {
    // Hai ca này có cách xử lý hoàn toàn khác nhau nên không được gộp làm một.
    expect(diagnose({ mic: null, system: probe('Loa', 0.2) })).toEqual(['mic-missing'])
    expect(diagnose({ mic: probe('Yeti', 0), system: probe('Loa', 0.2) })).toEqual(['mic-silent'])
  })

  it('bắt được ca quan trọng nhất: có tiếng mình nhưng không có tiếng đầu bên kia', () => {
    expect(diagnose({ mic: probe('Yeti', 0.4), system: probe('Loa', 0.0001) })).toEqual(['system-silent'])
  })

  it('báo cả hai khi cả hai đều hỏng', () => {
    expect(diagnose({ mic: null, system: null })).toEqual(['mic-missing', 'system-missing'])
  })

  it('ngay tại ngưỡng thì coi là có tín hiệu', () => {
    expect(diagnose({ mic: probe('m', SIGNAL_THRESHOLD), system: probe('s', SIGNAL_THRESHOLD) })).toEqual(['ok'])
  })

  it('isHealthy chỉ đúng khi không còn vấn đề nào', () => {
    expect(isHealthy(['ok'])).toBe(true)
    expect(isHealthy(['system-silent'])).toBe(false)
  })
})

describe('formatReport', () => {
  const report = formatReport({
    version: '0.1.4',
    platform: 'Windows',
    mic: probe('Microphone (Realtek)', 0.42),
    system: probe('Màn hình 1', 0),
    verdicts: ['system-silent'],
  })

  it('nêu tên thiết bị và mức đỉnh để chẩn đoán từ xa', () => {
    expect(report).toContain('Microphone (Realtek)')
    expect(report).toContain('0.4200')
    expect(report).toContain('system-silent')
  })

  it('nói rõ luồng không mở được, không để trống', () => {
    expect(formatReport({ version: '1', platform: 'x', mic: null, system: null, verdicts: [] })).toContain(
      'không mở được',
    )
  })

  it('không chứa đường dẫn hay nội dung bản ghi', () => {
    expect(report).not.toMatch(/[A-Z]:\\|\/home\/|sk-ant/)
  })
})
