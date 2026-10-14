import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'

/** First element with the given tag name, or null. */
export function select(tree: Root, tagName: string): Element | null {
  let found: Element | null = null
  visit(tree, 'element', (node: Element) => {
    if (found === null && node.tagName === tagName) found = node
  })
  return found
}

/** Every element with the given tag name, in document order. */
export function selectAll(tree: Root, tagName: string): Element[] {
  const found: Element[] = []
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === tagName) found.push(node)
  })
  return found
}
