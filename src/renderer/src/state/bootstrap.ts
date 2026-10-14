import type { OpenedFile } from '@shared/types'
import type { Bootstrap } from '../../../preload/index'

/**
 * Startup handshake, deliberately outside React.
 *
 * `ready()` must be called exactly once per renderer - it hands back the files
 * the OS asked us to open before the window existed - and files can arrive in
 * the gap between that call resolving and React mounting its listener. Both
 * problems go away by doing this at module scope and buffering.
 */

const earlyFiles: OpenedFile[] = []
let sink: ((file: OpenedFile) => void) | null = null

window.marrow.onOpenFile((file) => {
  if (sink) sink(file)
  else earlyFiles.push(file)
})

export const bootstrapPromise: Promise<Bootstrap> = window.marrow.ready()

/** Attach the real handler and flush anything that arrived first. */
export function receiveOpenedFiles(handler: (file: OpenedFile) => void): () => void {
  sink = handler
  while (earlyFiles.length > 0) {
    const file = earlyFiles.shift()
    if (file) handler(file)
  }
  return () => {
    sink = null
  }
}
