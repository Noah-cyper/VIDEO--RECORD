import { describe, expect, it } from 'vitest'
import { enDict, LANG_KEYS, translate, viDict } from '@shared/i18n'

describe('từ điển', () => {
  it('hai ngôn ngữ có đúng cùng một bộ khoá', () => {
    // Thiếu một khoá ở bản dịch nghĩa là chỗ đó sẽ lặng lẽ rơi về tiếng Việt giữa giao diện tiếng Anh.
    expect(Object.keys(enDict).sort()).toEqual(Object.keys(viDict).sort())
  })

  it('không có chuỗi rỗng', () => {
    for (const dict of [viDict, enDict]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `khoá rỗng: ${key}`).not.toBe('')
      }
    }
  })

  it('mọi tham số {x} ở bản Việt đều xuất hiện lại ở bản Anh', () => {
    const params = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort()
    for (const key of LANG_KEYS) {
      expect(params(enDict[key]), `khoá lệch tham số: ${key}`).toEqual(params(viDict[key]))
    }
  })
})

describe('translate', () => {
  it('trả đúng chuỗi theo ngôn ngữ', () => {
    expect(translate('vi', 'record.start')).toBe('Bắt đầu ghi')
    expect(translate('en', 'record.start')).toBe('Start recording')
  })

  it('nội suy tham số', () => {
    expect(translate('vi', 'record.saved', { title: 'Họp ABC' })).toBe('Đã lưu: Họp ABC')
    expect(translate('en', 'record.diskLow', { minutes: 12 })).toContain('12 minutes')
  })

  it('giữ nguyên chỗ trống khi thiếu tham số, thay vì in "undefined"', () => {
    expect(translate('vi', 'record.saved')).toBe('Đã lưu: {title}')
    expect(translate('vi', 'record.saved', {})).toBe('Đã lưu: {title}')
  })

  it('ngôn ngữ lạ thì rơi về tiếng Việt chứ không hiện tên khoá', () => {
    expect(translate('de' as 'vi', 'app.close')).toBe('Đóng')
  })
})
