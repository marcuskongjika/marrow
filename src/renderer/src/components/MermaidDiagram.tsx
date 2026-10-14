import { useEffect, useState, type JSX } from 'react'
import { renderMermaid, type MermaidRender } from '../lib/mermaid'
import { useResolvedTheme } from '../state/theme'
import { AlertIcon } from './Icons'
import styles from './MermaidDiagram.module.css'

/**
 * Renders one ```mermaid fenced block. Re-runs when the theme flips so diagram
 * colours follow the app, and shows the parser's complaint inline instead of
 * swallowing it or replacing the document with an error.
 *
 * One piece of state, written only when a render resolves: on a theme change the
 * previous diagram stays on screen until its replacement is ready, instead of
 * collapsing to a placeholder.
 */

export interface MermaidDiagramProps {
  source?: string
}

export function MermaidDiagram({ source = '' }: MermaidDiagramProps): JSX.Element {
  const theme = useResolvedTheme()
  const [result, setResult] = useState<MermaidRender | null>(null)

  useEffect(() => {
    let cancelled = false

    void renderMermaid(source, theme).then((next) => {
      if (!cancelled) setResult(next)
    })

    return () => {
      cancelled = true
    }
  }, [source, theme])

  if (result?.error) {
    return (
      <div className={styles.error} role="note">
        <div className={styles.errorHead}>
          <AlertIcon size={14} />
          <span>Diagram could not be rendered</span>
        </div>
        <p className={styles.errorMessage}>{result.error}</p>
        <pre className={styles.errorSource}>{source.trim()}</pre>
      </div>
    )
  }

  if (!result?.svg) {
    return <div className={styles.loading} aria-busy="true" />
  }

  return (
    // The source rides along on the element so an export can re-render the
    // diagram for a different theme than the one on screen.
    <figure className={styles.figure} data-mermaid-source={source}>
      {/* Mermaid sanitizes its own output at securityLevel 'strict'. */}
      <div className={styles.diagram} dangerouslySetInnerHTML={{ __html: result.svg }} />
    </figure>
  )
}
