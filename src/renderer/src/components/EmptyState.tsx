import type { JSX } from 'react'
import type { RecentFile } from '@shared/types'
import { DocumentIcon, MarrowMark } from './Icons'
import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  recentFiles: RecentFile[]
  isMac: boolean
  onOpen: () => void
  onOpenPath: (path: string) => void
  onClearRecent: () => void
}

function relativeTime(timestamp: number): string {
  if (!timestamp) return ''
  const seconds = Math.round((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function parentFolder(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (index <= 0) return ''
  const folder = path.slice(0, index)
  const cut = Math.max(folder.lastIndexOf('/'), folder.lastIndexOf('\\'))
  return cut < 0 ? folder : folder.slice(cut + 1)
}

export function EmptyState({
  recentFiles,
  isMac,
  onOpen,
  onOpenPath,
  onClearRecent
}: EmptyStateProps): JSX.Element {
  const openShortcut = isMac ? '⌘O' : 'Ctrl+O'

  return (
    <div className={styles.wrap} data-testid="empty-state">
      <div className={styles.hero}>
        <MarrowMark size={56} className={styles.logo} />
        <h1 className={styles.title}>Marrow</h1>
        <p className={styles.tagline}>Read your notes down to the bone.</p>

        <button
          type="button"
          className={styles.openButton}
          onClick={onOpen}
          data-testid="open-file"
        >
          Open file
          <kbd className={styles.kbd}>{openShortcut}</kbd>
        </button>

        <p className={styles.dropHint}>…or drop a Markdown file anywhere in this window</p>
      </div>

      {recentFiles.length > 0 && (
        <section className={styles.recent}>
          <header className={styles.recentHead}>
            <span className={styles.recentTitle}>Recent</span>
            <button type="button" className={styles.clear} onClick={onClearRecent}>
              Clear
            </button>
          </header>
          <ul className={styles.recentList}>
            {recentFiles.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className={styles.recentItem}
                  title={entry.path}
                  onClick={() => onOpenPath(entry.path)}
                >
                  <DocumentIcon size={14} />
                  <span className={styles.recentName}>{entry.name}</span>
                  <span className={styles.recentFolder}>{parentFolder(entry.path)}</span>
                  <span className={styles.recentTime}>{relativeTime(entry.openedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
