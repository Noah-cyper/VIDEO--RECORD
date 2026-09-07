/**
 * Lấy binary whisper.cpp cho bản đóng gói. Không có nó thì gỡ băng, phụ đề trực tiếp và dịch
 * đều không chạy được - và người dùng bình thường không thể tự build whisper.cpp.
 *
 * Best-effort: mọi trục trặc đều kết thúc bằng exit 0. Thiếu whisper chỉ làm mất tính năng gỡ
 * băng, còn để nó làm hỏng cả lượt phát hành thì mất luôn phần ghi - thứ quan trọng hơn nhiều.
 * App chạy thử binary thật (`whisperAvailable`) nên tải nhầm cũng chỉ quay về đúng trạng thái
 * hiện nay là "không có whisper", chứ không sinh ra lỗi khó hiểu.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const outDir = join(process.cwd(), 'resources', 'whisper')
const exeName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
const dest = join(outDir, exeName)

const done = (msg) => {
  console.log(msg)
  process.exit(0)
}

if (existsSync(dest)) done(`whisper.cpp đã có sẵn: ${dest}`)
mkdirSync(outDir, { recursive: true })

/** Tên file CLI đổi theo phiên bản (main -> whisper-cli), nên nhận cả hai. */
const CLI_NAMES = ['whisper-cli.exe', 'main.exe', 'whisper-cli', 'main']

function findCli(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findCli(path)
      if (found) return found
    } else if (CLI_NAMES.includes(entry.name)) {
      return path
    }
  }
  return null
}

async function fetchWindows() {
  const res = await fetch('https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=10', {
    headers: { 'user-agent': 'callrec-build' },
  })
  if (!res.ok) return done(`Không hỏi được danh sách bản phát hành whisper.cpp: HTTP ${res.status}`)

  const releases = await res.json()
  // Bản dựng sẵn cho Windows nằm ở asset dạng whisper-bin-x64.zip; chọn bản mới nhất có nó.
  const asset = releases
    .flatMap((r) => r.assets ?? [])
    .find((a) => /^whisper-bin-x64\.zip$/i.test(a.name))
  if (!asset) return done('Bản phát hành whisper.cpp hiện không có sẵn bản dựng cho Windows x64.')

  const zip = join(tmpdir(), 'whisper-bin-x64.zip')
  const work = join(tmpdir(), 'whisper-extract')
  rmSync(work, { recursive: true, force: true })

  const bin = await fetch(asset.browser_download_url)
  if (!bin.ok) return done(`Tải whisper.cpp hỏng: HTTP ${bin.status}`)
  writeFileSync(zip, Buffer.from(await bin.arrayBuffer()))

  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zip}' -DestinationPath '${work}' -Force`])
  const cli = findCli(work)
  if (!cli) return done('Không tìm thấy file chạy whisper trong gói vừa tải.')

  // Chỉ lấy CLI và các DLL nằm cạnh nó - whisper-cli.exe cần DLL mới chạy được. Gói tải về còn
  // kèm ~20 binary khác (server, bench, test-*, parakeet, wchess...) mà app không gọi tới; chép
  // hết thì installer phình thêm hàng trăm MB và người dùng phải tải lại chừng đó mỗi lần cập nhật.
  const dir = join(cli, '..')
  copyFileSync(cli, dest)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
      copyFileSync(join(dir, entry.name), join(outDir, entry.name))
    }
  }
  done(`Đã đặt whisper.cpp vào ${dest} (${(statSync(dest).size / 1048576).toFixed(1)} MB)`)
}

function fetchMac() {
  // Runner macOS của GitHub có sẵn Homebrew; whisper-cpp là công thức chính thức.
  try {
    execFileSync('brew', ['install', 'whisper-cpp'], { stdio: 'inherit' })
    const prefix = execFileSync('brew', ['--prefix'], { encoding: 'utf-8' }).trim()
    const cli = [join(prefix, 'bin', 'whisper-cli'), join(prefix, 'bin', 'whisper-cpp')].find((p) => existsSync(p))
    if (!cli) return done('Cài whisper-cpp xong nhưng không thấy file chạy trong bin của Homebrew.')
    copyFileSync(cli, dest)
    done(`Đã đặt whisper.cpp vào ${dest}`)
  } catch (err) {
    done(`Không cài được whisper-cpp qua Homebrew: ${err instanceof Error ? err.message : String(err)}`)
  }
}

try {
  if (process.platform === 'win32') await fetchWindows()
  else if (process.platform === 'darwin') fetchMac()
  else done('Nền tảng này không đóng gói whisper.cpp.')
} catch (err) {
  done(`Bỏ qua whisper.cpp: ${err instanceof Error ? err.message : String(err)}`)
}
