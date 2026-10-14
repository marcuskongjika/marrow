/**
 * Minimal cross-platform path helpers.
 *
 * The renderer runs sandboxed with no Node access, but it still has to resolve
 * relative image sources and links against the directory of the document being
 * viewed. `node:path` is not available there, so the handful of operations we
 * need live here and are unit tested against both Windows and POSIX shapes.
 */

import { MARKDOWN_EXTENSIONS } from './types'

const WINDOWS_DRIVE_ABS = /^[a-zA-Z]:[\\/]/
const WINDOWS_DRIVE_ONLY = /^[a-zA-Z]:$/
const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const SEPARATORS = /[\\/]+/

export function isWindowsPath(input: string): boolean {
  return WINDOWS_DRIVE_ABS.test(input) || input.startsWith('\\\\')
}

export function isAbsolutePath(input: string): boolean {
  return isWindowsPath(input) || input.startsWith('/')
}

export function hasScheme(input: string): boolean {
  // `C:\notes` would otherwise look like the scheme "c:".
  if (WINDOWS_DRIVE_ABS.test(input)) return false
  return SCHEME.test(input)
}

/** True for anything that should go to the OS browser rather than be resolved locally. */
export function isExternalHref(href: string): boolean {
  return hasScheme(href) || href.startsWith('//')
}

interface RootSplit {
  root: string
  rest: string
  sep: string
}

function splitRoot(input: string): RootSplit {
  if (WINDOWS_DRIVE_ABS.test(input)) {
    return { root: input.slice(0, 2) + '\\', rest: input.slice(3), sep: '\\' }
  }
  if (input.startsWith('\\\\')) {
    const segments = input.slice(2).split(SEPARATORS)
    const server = segments.shift() ?? ''
    const share = segments.shift() ?? ''
    return { root: '\\\\' + server + '\\' + share + '\\', rest: segments.join('\\'), sep: '\\' }
  }
  if (input.startsWith('/')) {
    return { root: '/', rest: input.slice(1), sep: '/' }
  }
  return { root: '', rest: input, sep: input.includes('\\') ? '\\' : '/' }
}

/** Collapse `.` and `..` segments and normalize separators, preserving the root. */
export function normalizePath(input: string): string {
  if (input === '') return ''
  const { root, rest, sep } = splitRoot(input)
  const out: string[] = []
  for (const segment of rest.split(SEPARATORS)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      const last = out[out.length - 1]
      if (out.length > 0 && last !== '..') out.pop()
      else if (root === '') out.push('..')
      continue
    }
    out.push(segment)
  }
  const joined = out.join(sep)
  if (root === '') return joined === '' ? '.' : joined
  return root + joined
}

export function dirname(input: string): string {
  const normalized = normalizePath(input)
  const { root, sep } = splitRoot(normalized)
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (index < 0) return '.'
  const head = normalized.slice(0, index)
  if (head === '') return sep
  if (WINDOWS_DRIVE_ONLY.test(head)) return head + '\\'
  if (root !== '' && head.length < root.length) return root
  return head
}

export function basename(input: string, stripExtension = false): string {
  const index = Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\'))
  const name = index < 0 ? input : input.slice(index + 1)
  if (!stripExtension) return name
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export function extname(input: string): string {
  const name = basename(input)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

/** Resolve `relative` against the directory `baseDir`, matching its separator style. */
export function resolveFrom(baseDir: string, relative: string): string {
  if (relative === '') return normalizePath(baseDir)
  if (isAbsolutePath(relative)) return normalizePath(relative)
  const sep = isWindowsPath(baseDir) ? '\\' : '/'
  const trimmed = baseDir.replace(/[\\/]+$/, '')
  const base = trimmed === '' ? baseDir : trimmed
  return normalizePath(base + sep + relative)
}

export function isMarkdownPath(input: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extname(input))
}

/** Case-insensitive on Windows, exact elsewhere. */
export function pathsEqual(a: string, b: string): boolean {
  const left = normalizePath(a)
  const right = normalizePath(b)
  if (isWindowsPath(left) || isWindowsPath(right)) {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

/** True when `child` is inside `root`, or is `root` itself. */
export function isInside(root: string, child: string): boolean {
  const normalizedRoot = normalizePath(root).replace(/[\\/]+$/, '')
  const normalizedChild = normalizePath(child)
  const windows = isWindowsPath(normalizedRoot) || isWindowsPath(normalizedChild)
  const a = windows ? normalizedRoot.toLowerCase() : normalizedRoot
  const b = windows ? normalizedChild.toLowerCase() : normalizedChild
  if (a === b) return true
  const sep = isWindowsPath(normalizedRoot) ? '\\' : '/'
  return b.startsWith(a.endsWith(sep) ? a : a + sep)
}

/** Split a markdown href into its path, query and fragment parts. */
export function splitHref(href: string): { path: string; query: string; hash: string } {
  const hashIndex = href.indexOf('#')
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : ''
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const queryIndex = withoutHash.indexOf('?')
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : ''
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
  return { path, query, hash }
}
