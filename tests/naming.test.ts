import { describe, expect, it } from 'vitest'
import { assessDisk, formatBytes, formatDuration, makeRecordingFolder, makeSessionId, slugify, uniqueFolder } from '@shared/naming'

describe('slugify', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(slugify('Họp khách hàng ABC')).toBe('Hop-khach-hang-ABC')
    expect(slugify('Đơn hàng tuần trước')).toBe('Don-hang-tuan-truoc')
  })
  it('không để lại gạch nối thừa hai đầu', () => {
    expect(slugify('  --Cuộc gọi--  ')).toBe('Cuoc-goi')
  })
  it('trả về tên mặc định khi không còn ký tự hợp lệ', () => {
    expect(slugify('!!!')).toBe('ban-ghi')
    expect(slugify('')).toBe('ban-ghi')
  })
  it('cắt theo maxLen mà không để lại gạch nối cuối', () => {
    expect(slugify('a'.repeat(80)).length).toBe(60)
    expect(slugify('abc def ghi', 4)).toBe('abc')
  })
})

describe('makeSessionId', () => {
  it('sắp xếp được theo thời gian', () => {
    const a = makeSessionId(new Date(2026, 0, 1, 8, 0, 0), 0.1)
    const b = makeSessionId(new Date(2026, 0, 1, 9, 0, 0), 0.1)
    expect(a < b).toBe(true)
    expect(a).toMatch(/^\d{8}T\d{6}-[0-9a-f]{4}$/)
  })
})

describe('makeRecordingFolder', () => {
  const at = new Date(2026, 8, 5, 14, 30)
  it('dùng tên người dùng đặt', () => {
    expect(makeRecordingFolder(at, 'Họp khách hàng')).toBe('2026-09-05_1430_Hop-khach-hang')
  })
  it('lùi về tên cửa sổ khi chưa đặt tên', () => {
    expect(makeRecordingFolder(at, undefined, 'Zoom Meeting')).toBe('2026-09-05_1430_Zoom-Meeting')
  })
  it('lùi tiếp về tên mặc định khi không có gì', () => {
    expect(makeRecordingFolder(at)).toBe('2026-09-05_1430_ban-ghi')
  })
})

describe('uniqueFolder', () => {
  it('không ghi đè thư mục đã tồn tại', () => {
    const taken = new Set(['ban-ghi', 'ban-ghi-2'])
    expect(uniqueFolder('ban-ghi', (n) => taken.has(n))).toBe('ban-ghi-3')
  })
  it('giữ nguyên tên khi chưa tồn tại', () => {
    expect(uniqueFolder('moi', () => false)).toBe('moi')
  })
})

describe('format', () => {
  it('bỏ phần giờ khi dưới 1 tiếng', () => {
    expect(formatDuration(65_000)).toBe('01:05')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(formatDuration(-5)).toBe('00:00')
  })
  it('rút gọn dung lượng', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })
})

describe('assessDisk', () => {
  const GB = 1024 ** 3
  it('chặn ghi khi dưới 1 GB', () => {
    expect(assessDisk(0.5 * GB, '1080p30').canRecord).toBe(false)
  })
  it('cảnh báo khi dưới 5 GB nhưng vẫn cho ghi', () => {
    const s = assessDisk(3 * GB, '1080p30')
    expect(s.canRecord).toBe(true)
    expect(s.warn).toBe(true)
  })
  it('ước lượng số phút còn ghi được theo chất lượng', () => {
    // 10 GB ở 500 MB/giờ ≈ 20 giờ; chỉ ghi tiếng thì lâu hơn nhiều.
    expect(assessDisk(10 * GB, '1080p30').minutesLeft).toBe(1228)
    expect(assessDisk(10 * GB, 'audio-only').minutesLeft).toBeGreaterThan(5000)
  })
})
