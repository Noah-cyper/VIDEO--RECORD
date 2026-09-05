/**
 * Lấy binary FFmpeg cho bản đóng gói. Repo không chứa binary (quá lớn), nhưng installer thì
 * bắt buộc phải có - devDependency ffmpeg-static không đi theo bản cài.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const target = join(process.cwd(), 'resources', 'ffmpeg')
const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const dest = join(target, name)

if (existsSync(dest)) {
  console.log(`FFmpeg đã có sẵn: ${dest}`)
  process.exit(0)
}

let source
try {
  source = require('ffmpeg-static')
} catch {
  console.error('Không tìm thấy ffmpeg-static. Chạy `npm ci` trước, hoặc tự đặt binary vào resources/ffmpeg/.')
  process.exit(1)
}

if (!source || !existsSync(source)) {
  console.error('ffmpeg-static không tải được binary cho nền tảng này.')
  process.exit(1)
}

mkdirSync(target, { recursive: true })
copyFileSync(source, dest)
console.log(`Đã chép FFmpeg vào ${dest}`)
