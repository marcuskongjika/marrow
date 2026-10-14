import { afterAll, describe, expect, it } from 'vitest'
import { toHtml } from 'hast-util-to-html'
import { select, selectAll } from './helpers'
import {
  CODE_TAG,
  MERMAID_TAG,
  disposeHighlighter,
  renderMarkdown,
  renderSource
} from '@shared/markdown'

/**
 * Pipeline tests. Everything here runs in plain Node with no Electron, which is
 * the whole reason the markdown pipeline lives in `src/shared`.
 */

afterAll(() => {
  disposeHighlighter()
})

async function html(source: string, options?: Parameters<typeof renderMarkdown>[1]) {
  const result = await renderMarkdown(source, { highlight: false, ...options })
  return toHtml(result.tree)
}

describe('GitHub Flavored Markdown', () => {
  it('renders tables with alignment', async () => {
    const output = await html('| a | b |\n| :- | --: |\n| 1 | 2 |\n')
    expect(output).toContain('<table>')
    expect(output).toContain('<th align="left">a</th>')
    expect(output).toContain('<th align="right">b</th>')
    expect(output).toContain('<td align="left">1</td>')
  })

  it('wraps tables in a scroll container', async () => {
    const output = await html('| a |\n| - |\n| 1 |\n')
    expect(output).toContain('<div class="table-scroll"><table>')
  })

  it('renders task lists as disabled checkboxes', async () => {
    const output = await html('- [x] done\n- [ ] todo\n')
    expect(output).toContain('class="contains-task-list"')
    expect(output).toContain('<input type="checkbox" checked disabled>')
    expect(output).toContain('<input type="checkbox" disabled>')
  })

  it('renders strikethrough', async () => {
    expect(await html('~~gone~~')).toContain('<del>gone</del>')
  })

  it('does not treat a single tilde as strikethrough', async () => {
    const output = await html('~approx~')
    expect(output).not.toContain('<del>')
  })

  it('creates autolinks for bare URLs and emails', async () => {
    const output = await html('See https://example.com or mail a@b.com\n')
    expect(output).toContain('<a href="https://example.com"')
    expect(output).toContain('<a href="mailto:a@b.com"')
  })

  it('renders footnotes with matching ids and backreferences', async () => {
    const result = await renderMarkdown('Claim[^1]\n\n[^1]: Evidence\n', { highlight: false })
    const output = toHtml(result.tree)
    expect(output).toContain('data-footnote-ref')
    expect(output).toContain('id="user-content-fn-1"')
    expect(output).toContain('href="#user-content-fn-1"')
    expect(output).toContain('data-footnote-backref')
    // Ids must not be prefixed twice, or every footnote link breaks.
    expect(output).not.toContain('user-content-user-content')
  })
})

describe('headings, outline and anchors', () => {
  it('slugs headings and appends an anchor link', async () => {
    const result = await renderMarkdown('# Hello World\n\n## Deep Section\n', { highlight: false })
    const output = toHtml(result.tree)
    expect(output).toContain('<h1 id="hello-world">')
    expect(output).toContain('class="heading-anchor"')
    expect(output).toContain('href="#hello-world"')
    expect(output).toContain('<h2 id="deep-section">')
  })

  it('collects an outline with depths and clean text', async () => {
    const result = await renderMarkdown('# One\n\n## Two `code`\n\n### Three\n', {
      highlight: false
    })
    expect(result.toc).toEqual([
      { id: 'one', text: 'One', depth: 1 },
      { id: 'two-code', text: 'Two code', depth: 2 },
      { id: 'three', text: 'Three', depth: 3 }
    ])
  })

  it('deduplicates repeated heading slugs', async () => {
    const result = await renderMarkdown('## Notes\n\n## Notes\n', { highlight: false })
    expect(result.toc.map((entry) => entry.id)).toEqual(['notes', 'notes-1'])
  })
})

describe('frontmatter and metadata', () => {
  it('removes frontmatter from the output and reads the title', async () => {
    const result = await renderMarkdown('---\ntitle: "My Notes"\ntags: [a]\n---\n\n# Heading\n', {
      highlight: false
    })
    const output = toHtml(result.tree)
    expect(output).not.toContain('tags')
    expect(result.title).toBe('My Notes')
    expect(result.frontmatter).toContain('title:')
  })

  it('falls back to the first heading for the title', async () => {
    const result = await renderMarkdown('# Only Heading\n\ntext\n', { highlight: false })
    expect(result.title).toBe('Only Heading')
  })

  it('reports no title when the document has neither', async () => {
    const result = await renderMarkdown('just text\n', { highlight: false })
    expect(result.title).toBeNull()
  })
})

describe('mathematics', () => {
  it('renders inline math through KaTeX', async () => {
    const output = await html('Einstein said $E = mc^2$ once.')
    expect(output).toContain('class="katex"')
    expect(output).toContain('<annotation encoding="application/x-tex">E = mc^2</annotation>')
  })

  it('renders display math', async () => {
    const output = await html('$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n')
    expect(output).toContain('katex-display')
    expect(output).toContain('<math')
  })

  it('reports a bad expression inline instead of throwing', async () => {
    const output = await html('$\\frac{1}{$')
    expect(output).toContain('katex-error')
  })
})

describe('mermaid blocks', () => {
  it('converts a mermaid fence into a custom element carrying its source', async () => {
    const result = await renderMarkdown('```mermaid\nflowchart TD\n  A --> B\n```\n', {
      highlight: false
    })
    const node = select(result.tree, MERMAID_TAG)
    expect(node).not.toBeNull()
    expect(node?.properties.source).toBe('flowchart TD\n  A --> B')
    expect(result.mermaidCount).toBe(1)
  })

  it('accepts the mmd alias and counts several diagrams', async () => {
    const result = await renderMarkdown(
      '```mermaid\ngraph TD\nA-->B\n```\n\n```mmd\npie title x\n"a": 1\n```\n',
      { highlight: false }
    )
    expect(result.mermaidCount).toBe(2)
  })

  it('leaves other fences as code blocks', async () => {
    const result = await renderMarkdown('```ts\nconst a = 1\n```\n', { highlight: false })
    expect(select(result.tree, MERMAID_TAG)).toBeNull()
    const code = select(result.tree, CODE_TAG)
    expect(code?.properties.language).toBe('ts')
    expect(code?.properties.source).toBe('const a = 1')
  })

  it('does not treat mermaid source as markdown or sanitize it away', async () => {
    const source = 'flowchart LR\n  A["<b>bold</b>"] --> B'
    const result = await renderMarkdown('```mermaid\n' + source + '\n```\n', { highlight: false })
    expect(select(result.tree, MERMAID_TAG)?.properties.source).toBe(source)
  })
})

describe('code blocks', () => {
  it('labels fences without a language as text', async () => {
    const result = await renderMarkdown('```\nplain\n```\n', { highlight: false })
    expect(select(result.tree, CODE_TAG)?.properties.language).toBe('text')
  })

  it('highlights with Shiki and emits both theme colours', async () => {
    const result = await renderMarkdown('```ts\nconst answer: number = 42\n```\n')
    const output = toHtml(result.tree)
    expect(output).toContain('--shiki-light')
    expect(output).toContain('--shiki-dark')
    expect(select(result.tree, CODE_TAG)?.properties.highlighted).toBe('true')
  })

  it('falls back to plain text for an unknown language but keeps the label', async () => {
    const result = await renderMarkdown('```not-a-real-language\nhello\n```\n')
    const node = select(result.tree, CODE_TAG)
    expect(node?.properties.language).toBe('not-a-real-language')
    expect(node?.properties.highlighted).toBe('false')
    expect(toHtml(result.tree)).toContain('shiki-plain')
  })

  it('renders the raw source view as one highlighted markdown block', async () => {
    const tree = await renderSource('# Title\n\n- item\n')
    const node = select(tree, CODE_TAG)
    expect(node?.properties.language).toBe('markdown')
    expect(node?.properties.source).toBe('# Title\n\n- item')
  })
})

describe('sanitization', () => {
  it('strips script elements and their contents', async () => {
    const output = await html('<script>window.x = 1</script>\n\ntext\n')
    expect(output).not.toContain('<script')
    expect(output).not.toContain('window.x')
  })

  it('removes inline event handlers', async () => {
    const output = await html('<p onclick="steal()">hi</p>\n')
    expect(output).toContain('<p>hi</p>')
    expect(output).not.toContain('onclick')
  })

  it('drops javascript: URLs', async () => {
    const output = await html('[click](javascript:alert(1))\n')
    expect(output).not.toContain('javascript:')
  })

  it('strips style elements', async () => {
    const output = await html('<style>body{display:none}</style>\n\ntext\n')
    expect(output).not.toContain('<style')
    expect(output).not.toContain('display:none')
  })

  it('removes iframes and objects', async () => {
    const output = await html('<iframe src="https://evil.example"></iframe>\n')
    expect(output).not.toContain('<iframe')
  })

  it('keeps the safe HTML authors actually use', async () => {
    const output = await html(
      '<details><summary>More</summary>\n\nHidden <kbd>Ctrl</kbd> <mark>text</mark>\n\n</details>\n'
    )
    expect(output).toContain('<details>')
    expect(output).toContain('<summary>More</summary>')
    expect(output).toContain('<kbd>Ctrl</kbd>')
    expect(output).toContain('<mark>text</mark>')
  })

  it('does not let raw HTML carry a style attribute', async () => {
    const output = await html('<p style="position:fixed;inset:0">overlay</p>\n')
    expect(output).not.toContain('position:fixed')
  })
})

describe('statistics', () => {
  it('counts prose words and estimates reading time', async () => {
    const words = Array.from({ length: 400 }, (_, index) => `word${index}`).join(' ')
    const result = await renderMarkdown(`# Title\n\n${words}\n`, { highlight: false })
    expect(result.stats.words).toBe(401)
    expect(result.stats.readingMinutes).toBe(2)
  })

  it('excludes code blocks, diagrams and hidden anchor glyphs', async () => {
    const result = await renderMarkdown(
      '# Heading\n\nthree visible words\n\n```ts\nignored ignored ignored ignored\n```\n\n```mermaid\ngraph TD\nA-->B\n```\n',
      { highlight: false }
    )
    expect(result.stats.words).toBe(4)
  })

  it('reports zero for an empty document', async () => {
    const result = await renderMarkdown('', { highlight: false })
    expect(result.stats).toEqual({ words: 0, characters: 0, readingMinutes: 0 })
  })
})

describe('resilience', () => {
  it('renders a document with every feature at once', async () => {
    const source = [
      '---',
      'title: All',
      '---',
      '# All',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '- [x] task',
      '',
      '$x^2$',
      '',
      '```mermaid',
      'graph TD',
      'A-->B',
      '```',
      '',
      '```ts',
      'const a = 1',
      '```',
      '',
      '![img](./a.png)',
      '',
      '[link](./b.md)',
      '',
      'note[^1]',
      '',
      '[^1]: footnote'
    ].join('\n')

    const result = await renderMarkdown(source, { basePath: '/notes/doc.md' })
    expect(result.title).toBe('All')
    expect(result.mermaidCount).toBe(1)
    expect(selectAll(result.tree, CODE_TAG)).toHaveLength(1)
    expect(result.toc).toHaveLength(2)
  })
})
