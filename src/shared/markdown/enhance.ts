import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'

/**
 * Wraps every table in a horizontally scrollable container. Wide tables are
 * common in markdown and a `display: block` table would break cell alignment,
 * so the scroll has to live on a wrapper element.
 */
export function rehypeWrapTables() {
  return function transform(tree: Root): void {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'table' || !parent || index === undefined) return
      if (parent.type === 'element' && parent.tagName === 'div') {
        const className = parent.properties?.className
        if (Array.isArray(className) && className.includes('table-scroll')) return
      }
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'] },
        children: [node]
      }
      return 'skip'
    })
  }
}
