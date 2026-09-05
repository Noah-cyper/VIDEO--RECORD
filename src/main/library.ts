import { app, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Recording } from '@shared/types'
import { slugify } from '@shared/naming'
import { readJson, writeJson, exists } from './jsonstore'
import { isInside } from './paths'
import { getSettings } from './settings'

const indexFile = () => join(app.getPath('userData'), 'library.json')

/**
 * Chỉ mục là một file JSON chứ không phải SQLite: tránh native dependency phải build lại
 * cho từng phiên bản Electron, và vài nghìn bản ghi vẫn nằm trong tầm xử lý thoải mái.
 */
async function readIndex(): Promise<Recording[]> {
  return await readJson<Recording[]>(indexFile(), [])
}

async function writeIndex(items: Recording[]): Promise<void> {
  await writeJson(indexFile(), items)
}

export async function addRecording(rec: Recording): Promise<void> {
  const items = await readIndex()
  await writeIndex([rec, ...items.filter((r) => r.id !== rec.id)])
}

export async function listRecordings(): Promise<Recording[]> {
  const items = await readIndex()
  // Bản ghi có thể bị xoá ngoài app; lọc luôn để danh sách không hiện mục chết.
  const alive: Recording[] = []
  let changed = false
  for (const r of items) {
    if (await exists(join(r.folder, r.videoFile))) alive.push(r)
    else changed = true
  }
  if (changed) await writeIndex(alive)
  return alive
}

/** Bỏ dấu cả hai vế để gõ "hop khach hang" vẫn tìm ra "Họp khách hàng". */
export async function searchRecordings(query: string): Promise<Recording[]> {
  const q = slugify(query).toLowerCase()
  if (!q) return listRecordings()
  return (await listRecordings()).filter(
    (r) => slugify(r.title).toLowerCase().includes(q) || r.createdAt.includes(query),
  )
}

export async function patchRecording(id: string, patch: Partial<Recording>): Promise<void> {
  const items = await readIndex()
  const index = items.findIndex((r) => r.id === id)
  if (index < 0) return
  items[index] = { ...items[index], ...patch, id }
  await writeIndex(items)
}

export async function renameRecording(id: string, title: string): Promise<void> {
  await patchRecording(id, { title })
}

export async function removeRecording(id: string): Promise<void> {
  const items = await readIndex()
  const target = items.find((r) => r.id === id)
  if (target) {
    // Chỉ số nằm trên đĩa và có thể bị sửa; không kiểm tra thì một entry bịa ra sẽ xoá đệ quy
    // bất cứ đâu. Ngoài thư mục bản ghi thì gỡ khỏi danh sách nhưng không đụng vào file.
    const { recordingsDir } = await getSettings()
    if (isInside(recordingsDir, target.folder)) {
      await fs.rm(target.folder, { recursive: true, force: true })
    }
  }
  await writeIndex(items.filter((r) => r.id !== id))
}

export async function revealRecording(id: string): Promise<void> {
  const target = (await readIndex()).find((r) => r.id === id)
  if (target) shell.showItemInFolder(join(target.folder, target.videoFile))
}

export async function getRecording(id: string): Promise<Recording | undefined> {
  return (await readIndex()).find((r) => r.id === id)
}
