import { useEffect, type JSX } from 'react'
import type { AppInfo } from '@shared/types'
import { CloseIcon } from './Icons'
import styles from './ShortcutsOverlay.module.css'

export interface ShortcutsOverlayProps {
  isMac: boolean
  appInfo: AppInfo | null
  onClose: () => void
}

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Files',
    items: [
      ['Open…', 'Mod+O'],
      ['New window', 'Mod+Shift+N'],
      ['Close tab', 'Mod+W'],
      ['Reload document', 'Mod+R'],
      ['Export as HTML…', 'Mod+Shift+E'],
      ['Export as PDF…', 'Mod+Shift+P'],
      ['Print…', 'Mod+P']
    ]
  },
  {
    title: 'Navigate',
    items: [
      ['Next tab', 'Ctrl+Tab'],
      ['Previous tab', 'Ctrl+Shift+Tab'],
      ['Top of document', 'Mod+Up'],
      ['End of document', 'Mod+Down'],
      ['Find in document', 'Mod+F'],
      ['Find next / previous', 'Mod+G / Mod+Shift+G']
    ]
  },
  {
    title: 'View',
    items: [
      ['Toggle outline', 'Mod+B'],
      ['Toggle markdown source', 'Mod+U'],
      ['Zoom in / out', 'Mod++ / Mod+-'],
      ['Actual size', 'Mod+0'],
      ['Copy document text', 'Mod+Shift+C'],
      ['Keyboard shortcuts', 'Mod+/']
    ]
  }
]

function renderKeys(combo: string, isMac: boolean): JSX.Element {
  const parts = combo.split(/\s*\+\s*/).flatMap((part) => (part === '' ? ['+'] : [part]))
  return (
    <span className={styles.keys}>
      {parts.map((part, index) => {
        const label = part === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : part === 'Ctrl' ? 'Ctrl' : part
        return (
          <kbd key={`${combo}-${index}`} className={styles.key}>
            {label}
          </kbd>
        )
      })}
    </span>
  )
}

export function ShortcutsOverlay({ isMac, appInfo, onClose }: ShortcutsOverlayProps): JSX.Element {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation" data-print-hide="">
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>Keyboard shortcuts</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <CloseIcon size={13} />
          </button>
        </header>

        <div className={styles.grid}>
          {GROUPS.map((group) => (
            <section key={group.title} className={styles.group}>
              <h3 className={styles.groupTitle}>{group.title}</h3>
              <dl className={styles.list}>
                {group.items.map(([label, combo]) => (
                  <div key={label} className={styles.row}>
                    <dt className={styles.label}>{label}</dt>
                    <dd className={styles.value}>{renderKeys(combo, isMac)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <footer className={styles.foot}>
          {appInfo
            ? `Marrow ${appInfo.version} · Electron ${appInfo.electron} · Chromium ${appInfo.chrome}`
            : 'Marrow'}
        </footer>
      </div>
    </div>
  )
}
