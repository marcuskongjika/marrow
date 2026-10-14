import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'
import {
  dirname,
  hasScheme,
  isAbsolutePath,
  isExternalHref,
  isMarkdownPath,
  resolveFrom,
  splitHref
} from '../paths'
import { localFileUrl } from '../token'

/**
 * Rewrites document-relative references so they work inside a sandboxed
 * renderer that has no filesystem access:
 *
 * - `<img src="./diagram.png">` becomes `marrow-file://local/<token>`, which the
 *   main process serves after checking the path against the granted roots.
 * - Links to other markdown files get `data-local-md` with the resolved absolute
 *   path, so clicking one opens a tab in Marrow instead of navigating the window.
 * - Links to other local files get `data-local-file` and are handed to the OS.
 * - External links get `data-external` plus `rel="noopener noreferrer"`.
 */

export interface LocalRefOptions {
  /** Absolute path of the document being rendered, or null for untitled buffers. */
  basePath?: string | null
}

function stringProperty(node: Element, name: string): string | null {
  const value = node.properties?.[name]
  return typeof value === 'string' ? value : null
}

/** `file:///C:/a/b.png` -> `C:/a/b.png`, `file:///a/b.png` -> `/a/b.png` */
function pathFromFileUrl(href: string): string | null {
  if (!/^file:\/\//i.test(href)) return null
  let rest = href.replace(/^file:\/\//i, '')
  if (rest.startsWith('/') && /^\/[a-zA-Z]:/.test(rest)) rest = rest.slice(1)
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

export function rehypeLocalRefs(options: LocalRefOptions = {}) {
  const basePath = options.basePath ?? null
  const baseDir = basePath ? dirname(basePath) : null

  return function transform(tree: Root): void {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'img') rewriteImage(node, baseDir)
      else if (node.tagName === 'a') rewriteLink(node, baseDir)
    })
  }
}

function rewriteImage(node: Element, baseDir: string | null): void {
  const src = stringProperty(node, 'src')
  if (!src || src.startsWith('#')) return

  node.properties ??= {}
  node.properties.loading = 'lazy'

  const fileUrlPath = pathFromFileUrl(src)
  if (fileUrlPath) {
    node.properties.src = localFileUrl(fileUrlPath)
    return
  }
  if (hasScheme(src)) return // http(s) and data: URLs are left alone

  const { path } = splitHref(src)
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }

  if (isAbsolutePath(decoded)) {
    node.properties.src = localFileUrl(decoded)
    return
  }
  if (!baseDir) return
  node.properties.src = localFileUrl(resolveFrom(baseDir, decoded))
}

function rewriteLink(node: Element, baseDir: string | null): void {
  const href = stringProperty(node, 'href')
  if (!href) return

  node.properties ??= {}

  if (href.startsWith('#')) {
    node.properties.dataAnchor = href.slice(1)
    return
  }

  if (isExternalHref(href)) {
    const fileUrlPath = pathFromFileUrl(href)
    if (fileUrlPath) {
      applyLocalTarget(node, fileUrlPath, '')
      return
    }
    node.properties.dataExternal = 'true'
    node.properties.rel = ['noopener', 'noreferrer']
    node.properties.target = '_blank'
    return
  }

  const { path, hash } = splitHref(href)
  if (path === '') return

  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }

  const absolute = isAbsolutePath(decoded)
    ? decoded
    : baseDir
      ? resolveFrom(baseDir, decoded)
      : null
  if (!absolute) return

  applyLocalTarget(node, absolute, hash)
}

function applyLocalTarget(node: Element, absolutePath: string, hash: string): void {
  node.properties ??= {}
  if (isMarkdownPath(absolutePath)) {
    node.properties.dataLocalMd = absolutePath
    if (hash) node.properties.dataHash = hash.slice(1)
  } else {
    node.properties.dataLocalFile = absolutePath
  }
}
