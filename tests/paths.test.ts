import { describe, expect, it } from 'vitest'
import { isValidSessionId, makeSessionId, SESSION_ID_RE } from '@shared/naming'
import { assertInside, isInside, isUsableRecordingsDir } from '../src/main/paths'

describe('isValidSessionId', () => {
  it('chấp nhận id do chính app sinh ra', () => {
    for (let i = 0; i < 50; i++) expect(isValidSessionId(makeSessionId())).toBe(true)
  })

  it('chặn mọi dạng thoát thư mục', () => {
    // Không có bộ lọc này, discardSession() sẽ xoá đệ quy đúng thứ mà chuỗi trỏ tới.
    for (const bad of [
      '..', '../..', '../../etc', 'a/../../b', './x',
      '20260905T143012-a3f9/../..', '/etc/passwd', 'C:\\Windows',
      '20260905T143012-a3f9\\..\\..',
    ]) {
      expect(isValidSessionId(bad), bad).toBe(false)
    }
  })

  it('chặn kiểu dữ liệu lạ từ IPC', () => {
    for (const bad of [null, undefined, 42, {}, [], true]) expect(isValidSessionId(bad)).toBe(false)
  })

  it('chặn id gần đúng nhưng sai định dạng', () => {
    expect(isValidSessionId('20260905T143012-A3F9')).toBe(false) // hex phải chữ thường
    expect(isValidSessionId('20260905T143012-a3f')).toBe(false)
    expect(isValidSessionId('20260905T143012-a3f9x')).toBe(false)
    expect(isValidSessionId(' 20260905T143012-a3f9')).toBe(false)
  })

  it('biểu thức neo cả hai đầu, không cho nhét thêm dòng', () => {
    expect(SESSION_ID_RE.test('20260905T143012-a3f9\n../..')).toBe(false)
  })
})

describe('isInside', () => {
  it('nhận thư mục con và chính nó', () => {
    expect(isInside('/data/rec', '/data/rec')).toBe(true)
    expect(isInside('/data/rec', '/data/rec/2026/a.mp4')).toBe(true)
  })

  it('từ chối thư mục chỉ trùng tiền tố tên', () => {
    // Không có dấu phân cách thì "/data/rec-cu" bị coi nhầm là nằm trong "/data/rec".
    expect(isInside('/data/rec', '/data/rec-cu/a.mp4')).toBe(false)
  })

  it('từ chối đường dẫn thoát ra bằng ..', () => {
    expect(isInside('/data/rec', '/data/rec/../../etc/passwd')).toBe(false)
    expect(isInside('/data/rec', '/etc/passwd')).toBe(false)
  })
})

describe('assertInside', () => {
  it('trả về đường dẫn đã chuẩn hoá khi hợp lệ', () => {
    expect(assertInside('/data/rec', '/data/rec/./a.mp4', 'test')).toBe('/data/rec/a.mp4')
  })
  it('ném lỗi khi nằm ngoài', () => {
    expect(() => assertInside('/data/rec', '/tmp/x', 'test')).toThrow(/ngoài thư mục cho phép/)
  })
})

describe('isUsableRecordingsDir', () => {
  it('nhận đường dẫn tuyệt đối bình thường', () => {
    expect(isUsableRecordingsDir('/home/user/Videos/CallRec')).toBe(true)
  })
  it('từ chối gốc ổ đĩa - xoá một bản ghi ở đây là quét sạch phân vùng', () => {
    expect(isUsableRecordingsDir('/')).toBe(false)
  })
  it('từ chối chuỗi rỗng và kiểu lạ', () => {
    for (const bad of ['', '   ', null, undefined, 42, {}]) expect(isUsableRecordingsDir(bad)).toBe(false)
  })
})
