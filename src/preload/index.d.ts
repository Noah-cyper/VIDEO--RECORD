import type { CallrecApi } from '@shared/ipc'
import type { SessionManifest } from '@shared/types'

declare global {
  interface Window {
    callrec: CallrecApi & { onOrphans(cb: (m: SessionManifest[]) => void): () => void }
  }
}

export {}
