import { desktopCapturer, session, type DesktopCapturerSource } from 'electron'
import type { CaptureSource } from '@shared/types'

let picked: { sourceId: string; withLoopback: boolean } | null = null
let cache: DesktopCapturerSource[] = []

export async function listSources(): Promise<CaptureSource[]> {
  cache = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  })
  return cache.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnailDataUrl: s.thumbnail.toDataURL(),
    appIcon: s.appIcon?.toDataURL(),
  }))
}

export function pickSource(sourceId: string, withLoopback: boolean): void {
  picked = { sourceId, withLoopback }
}

export function pickedSourceName(): string | undefined {
  return cache.find((s) => s.id === picked?.sourceId)?.name
}

/**
 * Điểm mấu chốt của cả ứng dụng: audio 'loopback' cho system audio trên cả Windows (WASAPI)
 * lẫn macOS (ScreenCaptureKit), không cần người dùng cài driver ảo nào (docs/03 mục 1).
 */
export function installDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = cache.length > 0 ? cache : await desktopCapturer.getSources({ types: ['screen', 'window'] })
      const chosen = sources.find((s) => s.id === picked?.sourceId) ?? sources[0]
      if (!chosen) return callback({})
      callback({ video: chosen, audio: picked?.withLoopback === false ? undefined : 'loopback' })
    },
    // Tự làm bộ chọn nguồn để kiểm soát giao diện và biết trước người dùng đã chọn gì.
    { useSystemPicker: false },
  )
}
