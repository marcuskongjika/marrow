import { useCallback, useRef, useState, type JSX, type ReactNode } from 'react'
import { CheckIcon, CopyIcon } from './Icons'
import styles from './CodeBlock.module.css'

/**
 * Chrome around a Shiki-highlighted code block: the language label and a copy
 * button. The highlighted markup itself arrives as `children` straight from the
 * markdown pipeline.
 */

export interface CodeBlockProps {
  language?: string
  source?: string
  highlighted?: string
  children?: ReactNode
}

const PRETTY_NAMES: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  shell: 'Shell',
  shellscript: 'Shell',
  ps1: 'PowerShell',
  powershell: 'PowerShell',
  json: 'JSON',
  jsonc: 'JSONC',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  md: 'Markdown',
  markdown: 'Markdown',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  sql: 'SQL',
  diff: 'Diff',
  text: 'Text',
  cpp: 'C++',
  csharp: 'C#',
  cs: 'C#'
}

function label(language: string | undefined): string {
  if (!language || language === '') return 'Text'
  return PRETTY_NAMES[language.toLowerCase()] ?? language
}

export function CodeBlock({ language, source, children }: CodeBlockProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)

  const copy = useCallback(() => {
    const text = source ?? bodyRef.current?.textContent ?? ''
    const finish = (): void => {
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1600)
    }

    void navigator.clipboard
      .writeText(text)
      .then(finish)
      .catch(() => {
        // Clipboard API refused (no user gesture, or a locked-down session):
        // fall back to the legacy selection-based copy.
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('aria-hidden', 'true')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.append(area)
        area.select()
        try {
          document.execCommand('copy')
          finish()
        } finally {
          area.remove()
        }
      })
  }, [source])

  return (
    <figure className={styles.block}>
      <figcaption className={styles.head}>
        <span className={styles.language}>{label(language)}</span>
        <button
          type="button"
          className={styles.copy}
          onClick={copy}
          data-export-hide=""
          data-copied={copied ? 'true' : undefined}
          aria-label={copied ? 'Copied' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          <span className={styles.copyLabel}>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </figcaption>
      <div className={styles.body} ref={bodyRef}>
        {children}
      </div>
    </figure>
  )
}
