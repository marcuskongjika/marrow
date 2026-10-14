import type { ResolvedTheme } from '@shared/types'

/**
 * Builds a genuinely standalone HTML document from what is on screen.
 *
 * The live DOM is the source of truth: Mermaid diagrams are already inline SVG
 * and Shiki tokens already carry their colours, so serializing the rendered
 * article captures the document exactly as the reader sees it. Styles are read
 * back out of `document.styleSheets`, and the assets those styles and the
 * article reference (web fonts, local images) are inlined as data URIs.
 *
 * The same document is what the PDF exporter prints, which is why it carries its
 * own strict CSP: it has no scripts, so nothing needs to run when it is opened.
 */

const EXPORT_CSP =
  "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"

const dataUrlCache = new Map<string, string | null>()

async function toDataUrl(url: string): Promise<string | null> {
  const cached = dataUrlCache.get(url)
  if (cached !== undefined) return cached

  let result: string | null = null
  try {
    const response = await fetch(url)
    if (response.ok) {
      const blob = await response.blob()
      result = await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
  } catch {
    result = null
  }
  dataUrlCache.set(url, result)
  return result
}

interface SheetSource {
  css: string
  /**
   * Base for resolving relative `url()` references. Chromium returns `cssText`
   * with the author's original (often relative) URL, so these must be resolved
   * against the stylesheet that declared them, not against the page.
   */
  base: string
}

function collectSheets(): SheetSource[] {
  const sheets: SheetSource[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      // A stylesheet we are not allowed to read; there are none in practice.
      continue
    }
    const css = Array.from(rules)
      .map((rule) => rule.cssText)
      .join('\n')
    if (css !== '') sheets.push({ css, base: sheet.href ?? document.baseURI })
  }
  return sheets
}

/** Replace `url(...)` web-font references with data URIs. */
async function inlineFonts(css: string, base: string): Promise<string> {
  const pattern = /url\((?:"([^"]+)"|'([^']+)'|([^)'"]+))\)/g
  const targets = new Set<string>()

  for (const match of css.matchAll(pattern)) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (raw === '' || raw.startsWith('data:')) continue
    if (!/\.woff2(\?|$)/i.test(raw)) continue
    targets.add(raw)
  }
  if (targets.size === 0) return css

  const replacements = new Map<string, string>()
  await Promise.all(
    [...targets].map(async (target) => {
      const absolute = new URL(target, base).toString()
      const dataUrl = await toDataUrl(absolute)
      if (dataUrl) replacements.set(target, dataUrl)
    })
  )

  return css.replace(pattern, (whole, a: string, b: string, c: string) => {
    const raw = (a ?? b ?? c ?? '').trim()
    const replacement = replacements.get(raw)
    return replacement ? `url("${replacement}")` : whole
  })
}

async function inlineImages(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll('img')]
  await Promise.all(
    images.map(async (image) => {
      const source = image.getAttribute('src')
      if (!source || source.startsWith('data:')) return
      if (/^https?:/i.test(source)) return
      const dataUrl = await toDataUrl(source)
      if (dataUrl) image.setAttribute('src', dataUrl)
      else image.removeAttribute('src')
      image.removeAttribute('loading')
    })
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Diagram SVGs are baked with the colours of the theme they were rendered in,
 * so exporting to a different theme (a light PDF from a dark window) has to
 * render them again.
 */
async function retintDiagrams(root: HTMLElement, theme: ResolvedTheme): Promise<void> {
  const figures = [...root.querySelectorAll<HTMLElement>('[data-mermaid-source]')]
  if (figures.length === 0) return

  const { renderMermaid } = await import('./mermaid')
  for (const figure of figures) {
    const source = figure.dataset.mermaidSource ?? ''
    const target = figure.querySelector('div')
    if (source === '' || !target) continue
    const { svg } = await renderMermaid(source, theme)
    if (svg) target.innerHTML = svg
  }
}

export interface StandaloneOptions {
  article: HTMLElement
  title: string
  /** Theme the exported document should use. */
  theme: ResolvedTheme
  /** Theme currently on screen, used to decide whether diagrams need redrawing. */
  currentTheme: ResolvedTheme
  sourceName: string | null
}

export async function buildStandaloneHtml(options: StandaloneOptions): Promise<string> {
  const clone = options.article.cloneNode(true) as HTMLElement

  for (const node of [...clone.querySelectorAll('[data-export-hide]')]) node.remove()
  for (const node of [...clone.querySelectorAll('[tabindex]')]) node.removeAttribute('tabindex')

  if (options.theme !== options.currentTheme) await retintDiagrams(clone, options.theme)
  await inlineImages(clone)

  // Web fonts are only worth the bytes when the document actually uses them;
  // KaTeX alone is around half a megabyte of woff2.
  const hasMath = clone.querySelector('.katex') !== null
  const sheets = collectSheets()
  const css = hasMath
    ? (await Promise.all(sheets.map((sheet) => inlineFonts(sheet.css, sheet.base)))).join('\n')
    : sheets.map((sheet) => sheet.css).join('\n')

  const generated = new Date().toISOString()
  const footerSource = options.sourceName
    ? `<p class="marrow-export-note">Exported from <strong>${escapeHtml(options.sourceName)}</strong> with Marrow.</p>`
    : '<p class="marrow-export-note">Exported with Marrow.</p>'

  return `<!doctype html>
<html lang="en" data-theme="${options.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">
<meta name="generator" content="Marrow">
<meta name="date" content="${generated}">
<title>${escapeHtml(options.title)}</title>
<style>
${css}
</style>
<style>
html, body { height: auto; overflow: visible; background: var(--bg); }
body { user-select: text; cursor: auto; display: block; padding: 3rem 1.5rem 4rem; }
.markdown { --zoom: 1; padding-bottom: 2rem; margin: 0 auto; }
.marrow-export-note {
  max-width: var(--measure);
  margin: 3rem auto 0;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-family: var(--font-ui);
  font-size: 0.78rem;
  color: var(--text-faint);
}
.marrow-export-note strong { font-weight: 600; color: var(--text-muted); }
</style>
</head>
<body>
${clone.outerHTML}
${footerSource}
</body>
</html>
`
}
