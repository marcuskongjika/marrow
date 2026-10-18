import type { JSX } from 'react'
import type { DocStats } from '@shared/markdown'
import { FolderIcon, PulseIcon } from './Icons'
import styles from './StatusBar.module.css'

export interface StatusBarProps {
  path: string | null
  stats: DocStats | null
  /** Set for PDFs, which show a page count instead of word stats. */
  pageCount: number | null
  zoom: number
  /** Timestamp of the last live reload, or null if the file has not changed. */
  reloadedAt: number | null
  busy: boolean
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function readingTime(minutes: number): string {
  if (minutes <= 0) return 'under a minute'
  return `${minutes} min read`
}

export function StatusBar({
  path,
  stats,
  pageCount,
  zoom,
  reloadedAt,
  busy
}: StatusBarProps): JSX.Element {
  return (
    <footer className={styles.bar} data-testid="status-bar" data-print-hide="">
      <button
        type="button"
        className={styles.path}
        disabled={!path}
        title={path ?? ''}
        onClick={() => {
          if (path) void window.marrow.revealInFolder(path)
        }}
      >
        <FolderIcon size={13} />
        <span className={styles.pathText}>{path ?? 'No document open'}</span>
      </button>

      <div className={styles.right}>
        {reloadedAt !== null && (
          // Keyed by the reload time so a new reload restarts the animation that
          // shows and then retires the pill - no timer, no state.
          <span key={reloadedAt} className={styles.reloaded}>
            <PulseIcon size={13} />
            Reloaded
          </span>
        )}
        {busy && <span className={styles.item}>Rendering…</span>}
        {pageCount !== null && (
          <span className={styles.item}>
            {formatCount(pageCount)} {pageCount === 1 ? 'page' : 'pages'}
          </span>
        )}
        {stats && (
          <>
            <span className={styles.item}>{formatCount(stats.words)} words</span>
            <span className={styles.sep} />
            <span className={styles.item}>{readingTime(stats.readingMinutes)}</span>
          </>
        )}
        <span className={styles.sep} />
        <span className={styles.item} title="Zoom level">
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </footer>
  )
}
