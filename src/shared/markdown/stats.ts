import type { Element, Root, RootContent } from 'hast'
import { CODE_TAG, MERMAID_TAG } from './code'

export interface DocStats {
  words: number
  characters: number
  readingMinutes: number
}

/** Average adult silent reading speed for technical prose. */
export const WORDS_PER_MINUTE = 200

const SKIPPED_TAGS = new Set([CODE_TAG, MERMAID_TAG, 'pre', 'style', 'script', 'svg'])

function isHidden(node: Element): boolean {
  return node.properties?.ariaHidden === 'true'
}

function collectProse(node: Root | RootContent, out: string[]): void {
  if (node.type === 'text') {
    out.push(node.value)
    return
  }
  if (node.type === 'element') {
    if (SKIPPED_TAGS.has(node.tagName) || isHidden(node)) return
  }
  if ('children' in node) {
    for (const child of node.children) collectProse(child, out)
  }
}

/**
 * Word count and reading time over the document's prose. Code blocks, Mermaid
 * sources and the hidden heading-anchor glyphs are excluded so the numbers match
 * what a reader actually reads.
 */
export function computeStats(tree: Root): DocStats {
  const parts: string[] = []
  collectProse(tree, parts)
  const text = parts.join(' ').replace(/\s+/g, ' ').trim()
  const words = text === '' ? 0 : text.split(' ').length
  return {
    words,
    characters: text.length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE))
  }
}
