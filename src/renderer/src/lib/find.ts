/**
 * Find in document, built on the CSS Custom Highlight API.
 *
 * Chromium's own `findInPage` would also match the table of contents and the
 * tab labels, which makes the match count wrong for a reader. Walking the
 * article's text nodes ourselves keeps the search scoped to the document, gives
 * an exact count, highlights every hit and tints the current one - with no DOM
 * mutation, so the rendered tree is never touched.
 */

const ALL_HIGHLIGHT = 'marrow-find'
const ACTIVE_HIGHLIGHT = 'marrow-find-active'

export interface FindMatches {
  ranges: Range[]
}

interface TextChunk {
  node: Text
  start: number
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT'])

function collect(root: HTMLElement): { text: string; chunks: TextChunk[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
      if (parent.closest('[aria-hidden="true"]')) return NodeFilter.FILTER_REJECT
      return node.nodeValue && node.nodeValue.length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    }
  })

  const chunks: TextChunk[] = []
  let text = ''
  let current = walker.nextNode()
  while (current) {
    const value = current.nodeValue ?? ''
    chunks.push({ node: current as Text, start: text.length })
    text += value
    current = walker.nextNode()
  }
  return { text, chunks }
}

function rangeFor(chunks: TextChunk[], start: number, length: number): Range | null {
  const range = document.createRange()
  let startSet = false

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    if (!chunk) continue
    const chunkLength = chunk.node.nodeValue?.length ?? 0
    const chunkEnd = chunk.start + chunkLength

    if (!startSet && start >= chunk.start && start < chunkEnd) {
      range.setStart(chunk.node, start - chunk.start)
      startSet = true
    }
    const end = start + length
    if (startSet && end > chunk.start && end <= chunkEnd) {
      range.setEnd(chunk.node, end - chunk.start)
      return range
    }
  }
  return null
}

export function findInElement(root: HTMLElement, query: string, matchCase: boolean): Range[] {
  if (query === '') return []
  const { text, chunks } = collect(root)
  const haystack = matchCase ? text : text.toLowerCase()
  const needle = matchCase ? query : query.toLowerCase()

  const ranges: Range[] = []
  let cursor = haystack.indexOf(needle)
  while (cursor !== -1 && ranges.length < 5000) {
    const range = rangeFor(chunks, cursor, needle.length)
    if (range) ranges.push(range)
    cursor = haystack.indexOf(needle, cursor + Math.max(needle.length, 1))
  }
  return ranges
}

function supported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
}

export function paintHighlights(ranges: Range[], activeIndex: number): void {
  if (!supported()) return
  if (ranges.length === 0) {
    clearHighlights()
    return
  }
  const active = ranges[activeIndex]
  const others = ranges.filter((_, index) => index !== activeIndex)
  CSS.highlights.set(ALL_HIGHLIGHT, new Highlight(...others))
  CSS.highlights.set(ACTIVE_HIGHLIGHT, active ? new Highlight(active) : new Highlight())
}

export function clearHighlights(): void {
  if (!supported()) return
  CSS.highlights.delete(ALL_HIGHLIGHT)
  CSS.highlights.delete(ACTIVE_HIGHLIGHT)
}

/** Scroll the active match into the middle of the viewport. */
export function revealRange(range: Range, scroller: HTMLElement): void {
  const rect = range.getBoundingClientRect()
  if (rect.height === 0 && rect.width === 0) return
  const scrollerRect = scroller.getBoundingClientRect()
  const offset = rect.top - scrollerRect.top - scroller.clientHeight / 2 + rect.height / 2
  if (Math.abs(offset) < 4) return
  scroller.scrollBy({ top: offset, behavior: 'smooth' })
}
