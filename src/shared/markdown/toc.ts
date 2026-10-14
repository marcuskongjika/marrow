import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'
import { rawText } from './code'

export interface TocEntry {
  id: string
  text: string
  depth: number
}

const HEADING = /^h([1-6])$/

export interface TocOptions {
  /** Array the collected headings are pushed into. */
  into: TocEntry[]
}

/**
 * Collects the heading outline. Runs after `rehype-slug` (so ids exist) and
 * before `rehype-autolink-headings` (so the anchor glyph is not part of the
 * heading text).
 */
export function rehypeToc(options: TocOptions) {
  return function transform(tree: Root): void {
    visit(tree, 'element', (node: Element) => {
      const match = HEADING.exec(node.tagName)
      if (!match) return
      const id = node.properties?.id
      const text = rawText(node).trim()
      if (typeof id !== 'string' || text === '') return
      options.into.push({ id, text, depth: Number(match[1]) })
    })
  }
}
