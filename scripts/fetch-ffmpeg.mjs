/**
 * Lấy binary FFmpeg cho bản đóng gói. Repo không chứa binary (quá lớn), nhưng installer thì
 * bắt buộc phải có - devDependency ffmpeg-static không đi theo bản cài.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// ffmpeg-static chỉ tải binary cho ĐÚNG hệ đang chạy. Dựng chéo (ví dụ đóng gói Windows trên
// Linux) sẽ chép nhầm binary của host vào gói - app cài xong trông vẫn bình thường nhưng mọi
// thao tác xuất file đều hỏng. Thà dừng ở đây còn hơn giao một bản cài hỏng ngầm.
const target = process.env.BUILD_TARGET_PLATFORM ?? process.platform
if (target !== process.platform) {
  console.error(
    `Không dựng chéo được: ffmpeg-static chỉ có binary cho ${process.platform}, ` +
      `trong khi đang đóng gói cho ${target}. Hãy dựng trên đúng hệ điều hành đó (CI đã làm vậy).`,
  )
  process.exit(1)
}

const require = createRequire(import.meta.url)
const outDir = join(process.cwd(), 'resources', 'ffmpeg')
const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const dest = join(outDir, name)

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

mkdirSync(outDir, { recursive: true })
copyFileSync(source, dest)
console.log(`Đã chép FFmpeg vào ${dest}`)
