import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { TocEntry } from '@shared/markdown'
import styles from './Sidebar.module.css'

/**
 * The outline. Depths are normalized against the shallowest heading in the
 * document so a file that starts at `##` is not indented into a corner, and the
 * active entry follows the scroll position.
 */

export interface SidebarProps {
  toc: TocEntry[]
  activeId: string | null
  documentTitle: string
  /** PDFs have bookmarks rather than headings, which changes the empty message. */
  isPdf: boolean
  onSelect: (id: string) => void
}

export function Sidebar({
  toc,
  activeId,
  documentTitle,
  isPdf,
  onSelect
}: SidebarProps): JSX.Element {
  const listRef = useRef<HTMLUListElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  const entries = useMemo(() => {
    if (toc.length === 0) return []
    const minDepth = Math.min(...toc.map((entry) => entry.depth))
    return toc.map((entry) => ({ ...entry, level: Math.min(entry.depth - minDepth, 3) }))
  }, [toc])

  // Keep the highlighted entry in view while the reader scrolls.
  useEffect(() => {
    const list = listRef.current
    const active = activeRef.current
    if (!list || !active) return
    const listBox = list.getBoundingClientRect()
    const activeBox = active.getBoundingClientRect()
    if (activeBox.top < listBox.top + 8) {
      list.scrollBy({ top: activeBox.top - listBox.top - 48 })
    } else if (activeBox.bottom > listBox.bottom - 8) {
      list.scrollBy({ top: activeBox.bottom - listBox.bottom + 48 })
    }
  }, [activeId])

  return (
    <nav
      className={styles.sidebar}
      aria-label="Table of contents"
      data-testid="toc"
      data-print-hide=""
    >
      <header className={styles.header}>
        <span className={styles.heading}>Outline</span>
        <span className={styles.count}>{entries.length > 0 ? entries.length : ''}</span>
      </header>

      {entries.length === 0 ? (
        <p className={styles.empty}>
          {documentTitle === ''
            ? 'No document open.'
            : isPdf
              ? 'This PDF has no bookmarks.'
              : 'This document has no headings.'}
        </p>
      ) : (
        <ul className={styles.list} ref={listRef}>
          {entries.map((entry) => {
            const isActive = entry.id === activeId
            return (
              <li key={`${entry.id}-${entry.depth}`}>
                <button
                  type="button"
                  ref={isActive ? activeRef : undefined}
                  className={styles.item}
                  data-level={entry.level}
                  data-active={isActive ? 'true' : undefined}
                  title={entry.text}
                  onClick={() => onSelect(entry.id)}
                >
                  <span className={styles.label}>{entry.text}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
