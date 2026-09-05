import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { getSettings } from './settings'
import { isInside } from './paths'

export const MEDIA_SCHEME = 'callrec-media'

/**
 * Renderer không được phép mở file:// tuỳ ý (dev chạy trên http://localhost nên Chromium chặn,
 * và cho phép file:// đại trà là mở toang cả ổ đĩa). Thay bằng scheme riêng chỉ phục vụ đúng
 * những file nằm trong thư mục bản ghi.
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ])
}

export function installMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    let target: string
    try {
      target = resolve(decodeURIComponent(new URL(request.url).pathname.replace(/^\//, '')))
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    if (!isInside((await getSettings()).recordingsDir, target)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}

export function mediaUrl(absolutePath: string): string {
  return `${MEDIA_SCHEME}://media/${encodeURIComponent(absolutePath)}`
}
