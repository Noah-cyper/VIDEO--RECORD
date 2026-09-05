import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/** Ghi qua file tạm rồi rename: crash giữa chừng không để lại JSON hỏng. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const p = `${dir}/${e.name}`
    total += e.isDirectory() ? await dirSize(p) : await fs.stat(p).then((s) => s.size, () => 0)
  }
  return total
}
