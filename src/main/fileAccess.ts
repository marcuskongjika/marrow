import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, normalize, resolve } from 'node:path'
import { MAX_FILE_BYTES, MARKDOWN_EXTENSIONS, type OpenOutcome } from '../shared/types'
import { basename, extname, isInside } from '../shared/paths'

/**
 * The one place the main process touches the filesystem on the renderer's
 * behalf, and the gate that makes `sandbox: true` meaningful.
 *
 * Rules:
 *  - Markdown is only read through `openMarkdownFile`, which requires an
 *    absolute path with a markdown extension and a sane size.
 *  - Any other file (images for `marrow-file://`, assets inlined into an HTML
 *    export) must live under a *granted root*: the directory of a document the
 *    user has explicitly opened. The renderer cannot widen that set itself.
 */

const grantedRoots = new Set<string>()

export function grantRoot(directory: string): void {
  if (!isAbsolute(directory)) return
  grantedRoots.add(normalize(directory))
}

export function isPathGranted(target: string): boolean {
  if (!isAbsolute(target)) return false
  const normalized = normalize(target)
  for (const root of grantedRoots) {
    if (isInside(root, normalized)) return true
  }
  return false
}

export function isMarkdownFile(target: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extname(target))
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return 'File not found.'
    if (code === 'EACCES' || code === 'EPERM') return 'Permission denied.'
    if (code === 'EISDIR') return 'That path is a folder, not a markdown file.'
    return error.message
  }
  return 'Unknown error.'
}

/**
 * Read a markdown file for the renderer. Opening a path also grants read access
 * to its directory, which is what makes relative images and sibling documents
 * work without handing the renderer a filesystem.
 */
export async function openMarkdownFile(target: unknown): Promise<OpenOutcome> {
  if (typeof target !== 'string' || target.trim() === '') {
    return { ok: false, error: 'No file path was provided.' }
  }
  if (target.includes('\0')) {
    return { ok: false, error: 'Invalid file path.' }
  }

  const absolute = resolve(target)

  if (!isMarkdownFile(absolute)) {
    return {
      ok: false,
      path: absolute,
      error: `Marrow opens markdown files (${MARKDOWN_EXTENSIONS.join(', ')}).`
    }
  }

  try {
    const stats = await stat(absolute)
    if (!stats.isFile()) {
      return { ok: false, path: absolute, error: 'That path is not a file.' }
    }
    if (stats.size > MAX_FILE_BYTES) {
      const limit = Math.round(MAX_FILE_BYTES / (1024 * 1024))
      return { ok: false, path: absolute, error: `File is larger than ${limit} MB.` }
    }

    const content = await readFile(absolute, 'utf8')
    const directory = dirname(absolute)
    grantRoot(directory)

    return {
      ok: true,
      file: {
        path: absolute,
        name: basename(absolute),
        dir: directory,
        content,
        mtimeMs: stats.mtimeMs
      }
    }
  } catch (error) {
    return { ok: false, path: absolute, error: describeError(error) }
  }
}

/** Re-read a file that is already open (used by the file watcher). */
export async function rereadMarkdownFile(
  target: string
): Promise<{ content: string; mtimeMs: number } | null> {
  try {
    const stats = await stat(target)
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) return null
    const content = await readFile(target, 'utf8')
    return { content, mtimeMs: stats.mtimeMs }
  } catch {
    return null
  }
}
