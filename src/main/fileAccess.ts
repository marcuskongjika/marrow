import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, normalize, resolve } from 'node:path'
import {
  DOCUMENT_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_PDF_BYTES,
  MARKDOWN_EXTENSIONS,
  type OpenOutcome
} from '../shared/types'
import { basename, extname, isInside, isPdfPath } from '../shared/paths'

/**
 * The one place the main process touches the filesystem on the renderer's
 * behalf, and the gate that makes `sandbox: true` meaningful.
 *
 * Rules:
 *  - Documents are only opened through `openDocumentFile`, which requires an
 *    absolute path with a markdown or PDF extension and a sane size. PDF bytes
 *    are never sent over IPC; the renderer fetches them via `marrow-file://`.
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

/** Markdown or PDF: anything Marrow opens in a tab. */
export function isDocumentFile(target: string): boolean {
  return (DOCUMENT_EXTENSIONS as readonly string[]).includes(extname(target))
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return 'File not found.'
    if (code === 'EACCES' || code === 'EPERM') return 'Permission denied.'
    if (code === 'EISDIR') return 'That path is a folder, not a document.'
    return error.message
  }
  return 'Unknown error.'
}

/**
 * Open a document for the renderer. Opening a path also grants read access to
 * its directory, which is what makes relative images, sibling documents and the
 * PDF's own bytes reachable without handing the renderer a filesystem.
 */
export async function openDocumentFile(target: unknown): Promise<OpenOutcome> {
  if (typeof target !== 'string' || target.trim() === '') {
    return { ok: false, error: 'No file path was provided.' }
  }
  if (target.includes('\0')) {
    return { ok: false, error: 'Invalid file path.' }
  }

  const absolute = resolve(target)

  if (!isDocumentFile(absolute)) {
    return {
      ok: false,
      path: absolute,
      error: `Marrow opens markdown and PDF files (${DOCUMENT_EXTENSIONS.join(', ')}).`
    }
  }

  const pdf = isPdfPath(absolute)

  try {
    const stats = await stat(absolute)
    if (!stats.isFile()) {
      return { ok: false, path: absolute, error: 'That path is not a file.' }
    }
    const maxBytes = pdf ? MAX_PDF_BYTES : MAX_FILE_BYTES
    if (stats.size > maxBytes) {
      const limit = Math.round(maxBytes / (1024 * 1024))
      return { ok: false, path: absolute, error: `File is larger than ${limit} MB.` }
    }

    const content = pdf ? '' : await readFile(absolute, 'utf8')
    const directory = dirname(absolute)
    grantRoot(directory)

    return {
      ok: true,
      file: {
        kind: pdf ? 'pdf' : 'markdown',
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

/**
 * Re-read a file that is already open (used by the file watcher). A PDF only
 * reports its new mtime; the renderer refetches the bytes itself.
 */
export async function rereadDocumentFile(
  target: string
): Promise<{ content: string; mtimeMs: number } | null> {
  try {
    const stats = await stat(target)
    if (!stats.isFile()) return null
    if (isPdfPath(target)) {
      return stats.size > MAX_PDF_BYTES ? null : { content: '', mtimeMs: stats.mtimeMs }
    }
    if (stats.size > MAX_FILE_BYTES) return null
    const content = await readFile(target, 'utf8')
    return { content, mtimeMs: stats.mtimeMs }
  } catch {
    return null
  }
}
