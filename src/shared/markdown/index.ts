import type { Element, Root } from 'hast'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { MERMAID_TAG, rawText, rehypeCode } from './code'
import { rehypeWrapTables } from './enhance'
import { remarkFrontmatterData, type Frontmatter } from './frontmatter'
import { rehypeLocalRefs } from './localRefs'
import { marrowSanitizeSchema } from './sanitize'
import { computeStats, type DocStats } from './stats'
import { rehypeToc, type TocEntry } from './toc'

export { CODE_TAG, MERMAID_TAG } from './code'
export type { TocEntry } from './toc'
export type { DocStats } from './stats'
export { CODE_THEMES, disposeHighlighter, getHighlighter } from './highlighter'
export { marrowSanitizeSchema } from './sanitize'
export { WORDS_PER_MINUTE } from './stats'

export interface RenderOptions {
  /** Absolute path of the source document; enables relative link/image resolution. */
  basePath?: string | null
  /** Disable Shiki (used by tests that only care about structure). */
  highlight?: boolean
}

export interface RenderResult {
  /** Sanitized hast tree, ready to hand to `hast-util-to-jsx-runtime`. */
  tree: Root
  toc: TocEntry[]
  stats: DocStats
  /** Frontmatter `title`, else the first level-one heading, else null. */
  title: string | null
  frontmatter: string | null
  mermaidCount: number
}

const AUTOLINK_CONTENT: Element = {
  type: 'element',
  tagName: 'span',
  properties: { className: ['heading-anchor-glyph'], ariaHidden: 'true' },
  children: [{ type: 'text', value: '#' }]
}

/**
 * The single markdown pipeline, shared by the renderer and the unit tests.
 *
 * Plugin order is load-bearing:
 *   parse -> frontmatter -> GFM -> math
 *   -> rehype (raw HTML kept) -> rehype-raw (parse it) -> SANITIZE
 *   -> KaTeX -> slug -> TOC -> autolink -> tables -> local refs -> Shiki
 *
 * Everything untrusted is sanitized before any trusted generator runs, so the
 * sanitizer never has to be loose enough to let generated markup through.
 */
export async function renderMarkdown(
  source: string,
  options: RenderOptions = {}
): Promise<RenderResult> {
  const toc: TocEntry[] = []
  const frontmatter: Frontmatter = { raw: null, title: null }

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkFrontmatterData, { into: frontmatter })
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, marrowSanitizeSchema)
    .use(rehypeKatex, { throwOnError: false, strict: false, trust: false })
    .use(rehypeSlug)
    .use(rehypeToc, { into: toc })
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      properties: { className: ['heading-anchor'], ariaHidden: 'true', tabIndex: -1 },
      content: () => structuredClone(AUTOLINK_CONTENT)
    })
    .use(rehypeWrapTables)
    .use(rehypeLocalRefs, { basePath: options.basePath ?? null })
    .use(rehypeCode, { highlight: options.highlight !== false })

  const tree = await processor.run(processor.parse(source))

  let mermaidCount = 0
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === MERMAID_TAG) mermaidCount += 1
  })

  return {
    tree,
    toc,
    stats: computeStats(tree),
    title: frontmatter.title ?? firstHeadingText(tree),
    frontmatter: frontmatter.raw,
    mermaidCount
  }
}

function firstHeadingText(tree: Root): string | null {
  let found: string | null = null
  visit(tree, 'element', (node: Element) => {
    if (found !== null || node.tagName !== 'h1') return
    const text = rawText(node).replace(/#$/, '').trim()
    if (text !== '') found = text
  })
  return found
}

/** Render the raw markdown source as a single highlighted code block. */
export async function renderSource(source: string): Promise<Root> {
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'pre',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'code',
            properties: { className: ['language-markdown'] },
            children: [{ type: 'text', value: source }]
          }
        ]
      }
    ]
  }
  await rehypeCode({ highlight: true })(tree)
  return tree
}

export { rawText }
