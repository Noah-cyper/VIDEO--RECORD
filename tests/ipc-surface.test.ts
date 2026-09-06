import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Bề mặt IPC là chỗ renderer chạm được vào đặc quyền của main, nên mỗi kênh thừa là một cánh cửa
 * mở mà không ai canh. Dự án này đã để lọt kênh chết hai lần, nên nó cần test đọc thẳng file thật.
 */
const read = (p: string) => readFileSync(p, 'utf-8')
const ipcContract = read('src/shared/ipc.ts')
const preload = read('src/preload/index.ts')
const mainHandlers = read('src/main/ipc.ts')

const mainSources = readdirSync('src/main')
  .filter((f) => f.endsWith('.ts'))
  .map((f) => read(join('src/main', f)))
  .join('\n')

/** Khoá kênh nằm trong khối `export const CH = { ... }`. */
const channelKeys = [...ipcContract.matchAll(/^ {2}([a-zA-Z]+): '[^']+',$/gm)].map((m) => m[1])

/** Kênh preload gọi qua invoke: phải có ipcMain.handle tương ứng. */
const invokedKeys = [...preload.matchAll(/ipcRenderer\.invoke\(CH\.([a-zA-Z]+)/g)].map((m) => m[1])

describe('bề mặt IPC', () => {
  it('đọc được hợp đồng kênh', () => {
    expect(channelKeys.length).toBeGreaterThan(20)
    expect(invokedKeys.length).toBeGreaterThan(20)
  })

  it('không có kênh nào khai báo mà main không hề nhắc tới', () => {
    // Kênh chết vẫn đi qua contextBridge được; đây đúng là cách `record:playConsent` tồn tại
    // suốt nhiều bản mà không ai dùng.
    const orphans = channelKeys.filter((k) => !mainSources.includes(`CH.${k}`))
    expect(orphans, `kênh không được main dùng: ${orphans.join(', ')}`).toEqual([])
  })

  it('mọi kênh preload gọi invoke đều có handler ở main', () => {
    // Thiếu handler thì lời gọi treo cho tới khi hết giờ, không báo lỗi gì.
    const missing = invokedKeys.filter((k) => !mainHandlers.includes(`ipcMain.handle(CH.${k}`))
    expect(missing, `thiếu handler cho: ${missing.join(', ')}`).toEqual([])
  })

  it('preload không lộ ra API tổng quát', () => {
    // Một hàm nhận channel tuỳ ý biến danh sách kênh cố định thành vô nghĩa.
    expect(preload).not.toMatch(/invoke\(\s*channel/)
    expect(preload).not.toMatch(/ipcRenderer\.invoke\((?!CH\.)/)
  })
})
