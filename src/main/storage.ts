import { app } from 'electron'
import { createWriteStream, WriteStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Bookmark, RecordState, SessionManifest, StreamKind } from '@shared/types'
import { isValidSessionId, makeSessionId } from '@shared/naming'
import type { OpenSessionInput, RegisterStreamInput } from '@shared/ipc'
import { readJson, writeJson, exists } from './jsonstore'

const FILE_OF: Record<StreamKind, string> = {
  mic: 'mic.webm',
  system: 'system.webm',
  video: 'video.webm',
}

export const sessionsRoot = () => join(app.getPath('userData'), 'sessions')

/** Cửa duy nhất từ id sang đường dẫn. Id sai định dạng thì dừng ngay, không tạo đường dẫn nào. */
export function sessionDir(id: string): string {
  if (!isValidSessionId(id)) throw new Error(`Session id không hợp lệ: ${JSON.stringify(id)}`)
  return join(sessionsRoot(), id)
}
const manifestPath = (id: string) => join(sessionDir(id), 'session.json')

/** Giữ stream mở suốt phiên: mở/đóng lại mỗi 5 giây sẽ tạo hàng nghìn syscall vô ích. */
const writers = new Map<string, WriteStream>()
const key = (id: string, kind: StreamKind) => `${id}:${kind}`

export async function openSession(input: OpenSessionInput): Promise<SessionManifest> {
  const id = makeSessionId()
  const manifest: SessionManifest = {
    id,
    startedAt: new Date().toISOString(),
    state: 'recording',
    title: input.title,
    quality: input.quality,
    streams: {},
    chunks: {},
    pausedMs: 0,
    bookmarks: [],
  }
  await fs.mkdir(sessionDir(id), { recursive: true })
  await writeJson(manifestPath(id), manifest)
  return manifest
}

export async function readManifest(id: string): Promise<SessionManifest | null> {
  if (!isValidSessionId(id)) return null
  return await readJson<SessionManifest | null>(manifestPath(id), null)
}

async function patchManifest(id: string, fn: (m: SessionManifest) => void): Promise<void> {
  const m = await readManifest(id)
  if (!m) return
  fn(m)
  await writeJson(manifestPath(id), m)
}

export async function registerStream(input: RegisterStreamInput): Promise<void> {
  if (!(input.kind in FILE_OF)) throw new Error(`Loại luồng không hợp lệ: ${JSON.stringify(input.kind)}`)
  await patchManifest(input.sessionId, (m) => {
    m.streams[input.kind] = {
      file: FILE_OF[input.kind],
      offsetMs: input.offsetMs,
      device: input.device,
      source: input.source,
      mimeType: input.mimeType,
    }
    m.chunks[input.kind] = 0
  })
}

export async function writeChunk(id: string, kind: StreamKind, data: ArrayBuffer): Promise<void> {
  if (!(kind in FILE_OF)) throw new Error(`Loại luồng không hợp lệ: ${JSON.stringify(kind)}`)
  const dir = sessionDir(id)
  const k = key(id, kind)
  let ws = writers.get(k)
  if (!ws) {
    await fs.mkdir(dir, { recursive: true })
    ws = createWriteStream(join(dir, FILE_OF[kind]), { flags: 'a' })
    writers.set(k, ws)
  }
  await new Promise<void>((resolve, reject) => {
    ws!.write(Buffer.from(data), (err) => (err ? reject(err) : resolve()))
  })
  await patchManifest(id, (m) => {
    m.chunks[kind] = (m.chunks[kind] ?? 0) + 1
  })
}

export async function setState(id: string, state: RecordState, error?: string): Promise<void> {
  await patchManifest(id, (m) => {
    m.state = state
    if (error) m.error = error
    if (state === 'finalizing' || state === 'done') m.endedAt = new Date().toISOString()
  })
}

export async function addBookmark(id: string, bookmark: Bookmark): Promise<void> {
  await patchManifest(id, (m) => {
    m.bookmarks.push(bookmark)
    m.bookmarks.sort((a, b) => a.atMs - b.atMs)
  })
}

export function hasOpenWriters(): boolean {
  return writers.size > 0
}

export async function closeAllWriters(): Promise<void> {
  const pending = [...writers.values()].map((ws) => new Promise<void>((resolve) => ws.end(() => resolve())))
  writers.clear()
  await Promise.all(pending)
}

export async function closeWriters(id: string): Promise<void> {
  const pending: Promise<void>[] = []
  for (const [k, ws] of writers) {
    if (!k.startsWith(`${id}:`)) continue
    writers.delete(k)
    pending.push(new Promise((resolve) => ws.end(() => resolve())))
  }
  await Promise.all(pending)
}

/**
 * Phiên còn ở trạng thái recording/paused khi app khởi động lại nghĩa là lần trước bị crash.
 * Dữ liệu vẫn còn nguyên tới chunk cuối cùng, chỉ cần chạy lại bước xuất file (NFR-03).
 */
export async function findOrphans(): Promise<SessionManifest[]> {
  const root = sessionsRoot()
  if (!(await exists(root))) return []
  const ids = await fs.readdir(root).catch(() => [] as string[])
  const out: SessionManifest[] = []
  for (const id of ids) {
    const m = await readManifest(id)
    if (!m) continue
    if (m.state === 'recording' || m.state === 'paused' || m.state === 'finalizing') out.push(m)
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export async function discardSession(id: string): Promise<void> {
  // sessionDir() ném lỗi trước khi có đường dẫn nào, nên xoá đệ quy không bao giờ chạm ra ngoài.
  const dir = sessionDir(id)
  await closeWriters(id)
  await fs.rm(dir, { recursive: true, force: true })
}

/** Chỉ xoá file thô SAU KHI đã xác nhận MP4 mở được - xoá sớm là cách nhanh nhất để mất bản ghi. */
export async function cleanupAfterExport(id: string, verifiedOutput: string): Promise<void> {
  const ok = await fs.stat(verifiedOutput).then((s) => s.size > 0, () => false)
  if (ok) await discardSession(id)
}
