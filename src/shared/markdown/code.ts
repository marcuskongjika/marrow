import type { Element, Parent, Root, RootContent } from 'hast'
import { visit } from 'unist-util-visit'
import { CODE_THEMES, ensureLanguage, getHighlighter } from './highlighter'

/**
 * Turns fenced code blocks into one of two custom elements that the renderer
 * maps to React components:
 *
 *   <marrow-code language="ts">  …Shiki output…  </marrow-code>
 *   <marrow-mermaid source="graph TD; …" />
 *
 * Custom element names keep the mapping unambiguous (no CSS-selector matching
 * in the renderer) and make the tree easy to assert on in unit tests.
 */

export const CODE_TAG = 'marrow-code'
export const MERMAID_TAG = 'marrow-mermaid'

const MERMAID_LANGUAGES = new Set(['mermaid', 'mmd'])

export interface CodeOptions {
  /** When false, code is emitted unhighlighted. Keeps unit tests fast. */
  highlight?: boolean
}

/** Collect the literal text of a node, preserving newlines. */
export function rawText(node: RootContent | Root): string {
  if (node.type === 'text') return node.value
  if (node.type === 'comment' || node.type === 'doctype') return ''
  if ('children' in node) return node.children.map((child) => rawText(child)).join('')
  return ''
}

function languageFromCode(code: Element): string | null {
  const className = code.properties?.className
  const classes = Array.isArray(className)
    ? className
    : typeof className === 'string'
      ? [className]
      : []
  for (const entry of classes) {
    const value = String(entry)
    if (value.startsWith('language-')) return value.slice('language-'.length)
    if (value.startsWith('lang-')) return value.slice('lang-'.length)
  }
  return null
}

interface CodeJob {
  parent: Parent
  index: number
  language: string | null
  source: string
}

export function rehypeCode(options: CodeOptions = {}) {
  const highlight = options.highlight !== false

  return async function transform(tree: Root): Promise<void> {
    const jobs: CodeJob[] = []

    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return
      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code'
      )
      if (!code) return

      const language = languageFromCode(code)
      // Strip the single trailing newline markdown always leaves on a fence.
      const source = rawText(code).replace(/\n$/, '')

      if (language && MERMAID_LANGUAGES.has(language.toLowerCase())) {
        parent.children[index] = {
          type: 'element',
          tagName: MERMAID_TAG,
          properties: { source },
          children: []
        }
        return
      }

      jobs.push({ parent, index, language, source })
    })

    for (const job of jobs) {
      job.parent.children[job.index] = await buildCodeElement(job, highlight)
    }
  }
}

async function buildCodeElement(job: CodeJob, highlight: boolean): Promise<Element> {
  const label = job.language ?? 'text'
  const children: Element[] = []

  const resolved = highlight ? await ensureLanguage(job.language) : null

  if (resolved) {
    const highlighter = await getHighlighter()
    const hast = highlighter.codeToHast(job.source, {
      lang: resolved,
      themes: CODE_THEMES,
      // Emits `--shiki-light` / `--shiki-dark` custom properties instead of a
      // single colour, so switching theme needs no re-highlighting. The
      // background comes from our own CSS, so `--shiki-*-bg` goes unused.
      defaultColor: false
    })
    const pre = hast.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'pre'
    )
    if (pre) children.push(pre)
  }

  if (children.length === 0) {
    children.push({
      type: 'element',
      tagName: 'pre',
      properties: { className: ['shiki', 'shiki-plain'] },
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: {},
          children: [{ type: 'text', value: job.source }]
        }
      ]
    })
  }

  return {
    type: 'element',
    tagName: CODE_TAG,
    properties: { language: label, source: job.source, highlighted: resolved ? 'true' : 'false' },
    children
  }
}
