import { describe, expect, it } from 'vitest'
import { isValidSessionId, makeSessionId, SESSION_ID_RE } from '@shared/naming'
import { win32, posix } from 'node:path'
import {
  APP_FOLDER, assertInside, isInside, isInsideWith, isRootWith,
  isUsableRecordingsDirWith, normalizeRecordingsDirWith,
} from '../src/main/paths'

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

describe('thư mục lưu bản ghi trên Windows', () => {
  // Lớp lỗi này chỉ xuất hiện trên Windows nhưng máy dựng chạy Linux, nên phải kiểm bằng win32
  // tường minh. Chính chỗ này từng khiến người dùng chọn D:\ mà bị từ chối thẳng.
  it('chấp nhận gốc ổ đĩa và tự đưa vào thư mục con', () => {
    expect(isUsableRecordingsDirWith(win32, 'D:\\')).toBe(true)
    expect(normalizeRecordingsDirWith(win32, 'D:\\')).toBe(`D:\\${APP_FOLDER}`)
  })

  it('giữ nguyên thư mục thường', () => {
    expect(normalizeRecordingsDirWith(win32, 'C:\\Users\\tdhvn\\Videos\\CallRec')).toBe(
      'C:\\Users\\tdhvn\\Videos\\CallRec',
    )
  })

  it('nhận biết gốc ổ đĩa dù viết hoa hay có dấu gạch cuối', () => {
    expect(isRootWith(win32, 'D:\\')).toBe(true)
    expect(isRootWith(win32, 'd:\\')).toBe(true)
    expect(isRootWith(win32, 'D:\\Ghi')).toBe(false)
  })

  it('đường dẫn UNC cũng được đưa vào thư mục con', () => {
    expect(normalizeRecordingsDirWith(win32, '\\\\nas\\chung')).toContain(APP_FOLDER)
  })

  it('từ chối đường dẫn tương đối - resolve sẽ ghim vào thư mục cài app', () => {
    expect(isUsableRecordingsDirWith(win32, 'BanGhi')).toBe(false)
    expect(isUsableRecordingsDirWith(win32, '..\\BanGhi')).toBe(false)
  })

  it('từ chối chuỗi rỗng và kiểu lạ', () => {
    for (const bad of ['', '   ', null, undefined, 42, {}]) {
      expect(isUsableRecordingsDirWith(win32, bad)).toBe(false)
    }
  })

  it('containment vẫn đúng sau khi chuẩn hoá gốc ổ đĩa', () => {
    const root = normalizeRecordingsDirWith(win32, 'D:\\')
    expect(isInsideWith(win32, root, `${root}\\2026-09-05_1430_Hop`)).toBe(true)
    // Biên phải nằm ở D:\CallRec chứ không phải cả ổ D - đó là lý do chuẩn hoá thay vì nhận thẳng.
    expect(isInsideWith(win32, root, 'D:\\Windows\\System32')).toBe(false)
  })
})

describe('thư mục lưu bản ghi trên POSIX', () => {
  it('gốc / cũng được đưa vào thư mục con', () => {
    expect(normalizeRecordingsDirWith(posix, '/')).toBe(`/${APP_FOLDER}`)
  })
  it('giữ nguyên thư mục thường', () => {
    expect(normalizeRecordingsDirWith(posix, '/home/user/Videos/CallRec')).toBe('/home/user/Videos/CallRec')
  })
  it('từ chối đường dẫn tương đối', () => {
    expect(isUsableRecordingsDirWith(posix, 'ban-ghi')).toBe(false)
  })
})
