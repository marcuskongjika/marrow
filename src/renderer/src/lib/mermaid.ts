import type { Mermaid } from 'mermaid'
import type { ResolvedTheme } from '@shared/types'

/**
 * Mermaid is loaded lazily (it is by far the largest dependency) and its
 * renders are serialized: `mermaid.initialize` is global state, so two diagrams
 * rendering concurrently with different themes would race.
 */

let modulePromise: Promise<Mermaid> | null = null
let initializedFor: ResolvedTheme | null = null
let queue: Promise<unknown> = Promise.resolve()
let counter = 0

async function loadMermaid(theme: ResolvedTheme): Promise<Mermaid> {
  if (!modulePromise) {
    modulePromise = import('mermaid').then((module) => module.default)
  }
  const mermaid = await modulePromise
  if (initializedFor !== theme) {
    const token = readTokens(theme)
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'base',
      // Labels come from markdown we did not write, so keep Mermaid's own
      // sanitizer at its strictest and stop it writing error SVGs into the body.
      securityLevel: 'strict',
      suppressErrorRendering: true,
      fontFamily: token('--font-ui'),
      flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: true },
      sequence: { useMaxWidth: true },
      // Diagrams are tinted with the app's own palette so they do not look
      // pasted in from another product.
      themeVariables: {
        background: 'transparent',
        fontFamily: token('--font-ui'),
        fontSize: '14px',
        textColor: token('--text'),
        titleColor: token('--text-strong'),
        lineColor: token('--diagram-line'),
        primaryColor: token('--diagram-node'),
        primaryBorderColor: token('--diagram-node-border'),
        primaryTextColor: token('--text'),
        secondaryColor: token('--diagram-alt'),
        secondaryBorderColor: token('--border-strong'),
        secondaryTextColor: token('--text'),
        tertiaryColor: token('--bg-sunken'),
        tertiaryBorderColor: token('--border'),
        tertiaryTextColor: token('--text-muted'),
        mainBkg: token('--diagram-node'),
        nodeBorder: token('--diagram-node-border'),
        clusterBkg: token('--diagram-alt'),
        clusterBorder: token('--border'),
        edgeLabelBackground: token('--diagram-label-bg'),
        noteBkgColor: token('--diagram-alt'),
        noteTextColor: token('--text'),
        noteBorderColor: token('--border-strong'),
        pie1: token('--accent'),
        pie2: token('--diagram-node-border'),
        pie3: token('--diagram-alt'),
        pie4: token('--border-strong')
      }
    })
    initializedFor = theme
  }
  return mermaid
}

const TOKEN_NAMES = [
  '--font-ui',
  '--text',
  '--text-strong',
  '--text-muted',
  '--border',
  '--border-strong',
  '--bg-sunken',
  '--accent',
  '--diagram-node',
  '--diagram-node-border',
  '--diagram-alt',
  '--diagram-line',
  '--diagram-label-bg'
] as const

/**
 * Read the palette for a specific theme, which is not always the theme on
 * screen: exporting a PDF from dark mode needs the light values. The tokens are
 * declared on `[data-theme=...]` rather than `:root[data-theme=...]`, so a
 * detached probe element resolves them without touching the live document.
 */
function readTokens(theme: ResolvedTheme): (name: string) => string {
  const probe = document.createElement('div')
  probe.dataset.theme = theme
  probe.style.display = 'none'
  document.body.append(probe)

  const style = getComputedStyle(probe)
  const values = new Map<string, string>()
  for (const name of TOKEN_NAMES) values.set(name, style.getPropertyValue(name).trim())
  probe.remove()

  return (name) => values.get(name) ?? ''
}

export interface MermaidRender {
  svg: string | null
  error: string | null
}

export async function renderMermaid(source: string, theme: ResolvedTheme): Promise<MermaidRender> {
  const run = async (): Promise<MermaidRender> => {
    const trimmed = source.trim()
    if (trimmed === '') return { svg: null, error: 'This diagram is empty.' }
    try {
      const mermaid = await loadMermaid(theme)
      await mermaid.parse(trimmed)
      counter += 1
      const { svg } = await mermaid.render(`marrow-diagram-${counter}`, trimmed)
      return { svg, error: null }
    } catch (error) {
      return { svg: null, error: describe(error) }
    }
  }

  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}

function describe(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'str' in error) {
    const value = (error as { str?: unknown }).str
    if (typeof value === 'string') return value
  }
  return 'Mermaid could not parse this diagram.'
}
