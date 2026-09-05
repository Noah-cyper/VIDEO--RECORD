import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Quy trình phát hành đã hỏng hai lần theo cách người dùng nhìn thấy, và lần gần nhất là vì một
 * lệnh sửa file không khớp mẫu rồi im lặng bỏ qua - file được commit mà không có thay đổi nào.
 * Những assert dưới đây canh đúng lớp lỗi đó: chúng đọc file thật, không đọc ý định.
 */
const workflow = readFileSync('.github/workflows/release.yml', 'utf-8')
const builder = readFileSync('electron-builder.yml', 'utf-8')

describe('quy trình phát hành', () => {
  it('có job publish chạy sau job build', () => {
    expect(workflow).toContain('publish:')
    expect(workflow).toMatch(/publish:\s*\n\s*needs: release/)
  })

  it('job publish có quyền ghi để chuyển release khỏi trạng thái nháp', () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: write/)
    expect(workflow).toContain('updateRelease')
  })

  it('kiểm đủ file của mọi nền tảng trước khi phát hành', () => {
    // Thiếu latest.yml là người dùng Windows bấm kiểm tra sẽ nhận "đang dùng bản mới nhất" sai.
    expect(workflow).toContain('latest.yml')
    expect(workflow).toContain('latest-mac.yml')
    expect(workflow).toContain("endsWith('.exe')")
  })

  it('build ra draft, vì publish job mới là nơi quyết định phát hành', () => {
    expect(builder).toMatch(/releaseType:\s*draft/)
  })

  it('vẫn tải artifact lên kể cả khi bước đóng gói hỏng', () => {
    expect(workflow).toMatch(/if: always\(\)\s*\n\s*uses: actions\/upload-artifact/)
  })
})
