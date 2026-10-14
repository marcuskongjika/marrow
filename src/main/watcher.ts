import { watch, type FSWatcher } from 'chokidar'
import { rereadMarkdownFile } from './fileAccess'
import type { FileChangedPayload } from '../shared/types'

/**
 * Live reload. One watcher per (window, file) pair so closing a tab or a window
 * tears down exactly the watchers it owns.
 *
 * `awaitWriteFinish` matters more than it looks: most editors save by writing a
 * temp file and renaming it, which otherwise produces a read of a half-written
 * or missing file.
 */

type ChangeHandler = (payload: FileChangedPayload) => void

const watchers = new Map<number, Map<string, FSWatcher>>()

function keyFor(ownerId: number): Map<string, FSWatcher> {
  let owned = watchers.get(ownerId)
  if (!owned) {
    owned = new Map()
    watchers.set(ownerId, owned)
  }
  return owned
}

export function watchFile(ownerId: number, filePath: string, onChange: ChangeHandler): void {
  const owned = keyFor(ownerId)
  if (owned.has(filePath)) return

  const watcher = watch(filePath, {
    ignoreInitial: true,
    atomic: 300,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 40 }
  })

  const reload = (): void => {
    void rereadMarkdownFile(filePath).then((result) => {
      if (!result) return
      onChange({ path: filePath, content: result.content, mtimeMs: result.mtimeMs })
    })
  }

  watcher.on('change', reload)
  watcher.on('add', reload)
  watcher.on('error', (error) => {
    console.warn('[marrow] watcher error for', filePath, error)
  })

  owned.set(filePath, watcher)
}

export function unwatchFile(ownerId: number, filePath: string): void {
  const owned = watchers.get(ownerId)
  const watcher = owned?.get(filePath)
  if (!owned || !watcher) return
  owned.delete(filePath)
  void watcher.close()
  if (owned.size === 0) watchers.delete(ownerId)
}

export function unwatchOwner(ownerId: number): void {
  const owned = watchers.get(ownerId)
  if (!owned) return
  for (const watcher of owned.values()) void watcher.close()
  watchers.delete(ownerId)
}

export function unwatchAll(): void {
  for (const ownerId of [...watchers.keys()]) unwatchOwner(ownerId)
}
