import { bundledLanguages, createHighlighter, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

/**
 * Shiki setup.
 *
 * Two deliberate choices here:
 *
 * 1. The JavaScript RegExp engine is used instead of the default Oniguruma
 *    WebAssembly engine. That keeps the Content-Security-Policy free of
 *    `wasm-unsafe-eval` and removes a wasm fetch from startup. `forgiving: true`
 *    makes Shiki skip the rare grammar rule the JS engine cannot compile rather
 *    than throwing.
 * 2. Only a small set of languages is loaded up front; anything else is loaded
 *    on demand from Shiki's bundled grammars the first time a document uses it.
 */

export const CODE_THEMES = { light: 'github-light', dark: 'github-dark' } as const

const PRELOADED_LANGUAGES = [
  'markdown',
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'shellscript',
  'python',
  'css',
  'html',
  'yaml',
  'diff'
]

let highlighterPromise: Promise<Highlighter> | null = null

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [CODE_THEMES.light, CODE_THEMES.dark],
      langs: PRELOADED_LANGUAGES,
      engine: createJavaScriptRegexEngine({ forgiving: true })
    })
  }
  return highlighterPromise
}

/**
 * Make sure `language` is usable, loading it lazily if Shiki bundles it.
 * Returns the language to highlight with, or `null` to render as plain text.
 */
export async function ensureLanguage(language: string | null): Promise<string | null> {
  if (!language) return null
  const normalized = language.toLowerCase()
  const highlighter = await getHighlighter()
  if (highlighter.getLoadedLanguages().includes(normalized)) return normalized
  if (!Object.hasOwn(bundledLanguages, normalized)) return null
  try {
    await highlighter.loadLanguage(normalized as keyof typeof bundledLanguages)
    return normalized
  } catch {
    return null
  }
}

/** Release the cached highlighter. Used by tests to keep runs isolated. */
export function disposeHighlighter(): void {
  const pending = highlighterPromise
  highlighterPromise = null
  if (pending) {
    void pending.then((highlighter) => {
      highlighter.dispose()
    })
  }
}
