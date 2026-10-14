import { useEffect, useRef, type JSX, type MouseEvent } from 'react'
import type { DocumentState } from '../state/documents'
import type { ThemeMode } from '@shared/types'
import {
  AutoThemeIcon,
  CloseIcon,
  CodeIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SidebarIcon,
  SunIcon
} from './Icons'
import styles from './TabBar.module.css'

/**
 * Tab strip and window toolbar.
 *
 * On macOS this row doubles as the title bar (the window is `hiddenInset`), so
 * it carries the drag region and leaves room for the traffic lights.
 */

export interface TabBarProps {
  docs: DocumentState[]
  activePath: string | null
  isMac: boolean
  tocVisible: boolean
  sourceVisible: boolean
  themeMode: ThemeMode
  onSelect: (path: string) => void
  onClose: (path: string) => void
  onOpen: () => void
  onToggleToc: () => void
  onToggleSource: () => void
  onCycleTheme: () => void
  onFind: () => void
}

const THEME_LABEL: Record<ThemeMode, string> = {
  light: 'Theme: light',
  dark: 'Theme: dark',
  system: 'Theme: follow system'
}

function ThemeIcon({ mode }: { mode: ThemeMode }): JSX.Element {
  if (mode === 'light') return <SunIcon size={15} />
  if (mode === 'dark') return <MoonIcon size={15} />
  return <AutoThemeIcon size={15} />
}

export function TabBar({
  docs,
  activePath,
  isMac,
  tocVisible,
  sourceVisible,
  themeMode,
  onSelect,
  onClose,
  onOpen,
  onToggleToc,
  onToggleSource,
  onCycleTheme,
  onFind
}: TabBarProps): JSX.Element {
  const stripRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activePath])

  const handleAuxClick = (event: MouseEvent<HTMLDivElement>, path: string): void => {
    // Middle-click closes, like a browser.
    if (event.button === 1) {
      event.preventDefault()
      onClose(path)
    }
  }

  return (
    <div className={styles.bar} data-mac={isMac ? 'true' : undefined} data-print-hide="">
      <div className={styles.strip} ref={stripRef} role="tablist" aria-label="Open documents">
        {docs.map((doc) => {
          const isActive = doc.path === activePath
          return (
            <div
              key={doc.path}
              ref={isActive ? activeTabRef : undefined}
              className={styles.tab}
              data-active={isActive ? 'true' : undefined}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              title={doc.path}
              onMouseDown={(event) => {
                if (event.button === 0) onSelect(doc.path)
              }}
              onAuxClick={(event) => handleAuxClick(event, doc.path)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(doc.path)
              }}
            >
              <span className={styles.tabName}>{doc.render?.title ?? doc.name}</span>
              {doc.reloadedAt !== null && <span className={styles.dot} aria-hidden="true" />}
              <button
                type="button"
                className={styles.tabClose}
                aria-label={`Close ${doc.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(doc.path)
                }}
              >
                <CloseIcon size={11} />
              </button>
            </div>
          )
        })}

        <button type="button" className={styles.newTab} onClick={onOpen} title="Open file (Ctrl+O)">
          <PlusIcon size={14} />
        </button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          data-on={tocVisible ? 'true' : undefined}
          onClick={onToggleToc}
          title="Toggle outline (Ctrl+B)"
          aria-pressed={tocVisible}
        >
          <SidebarIcon size={15} />
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={onFind}
          title="Find in document (Ctrl+F)"
        >
          <SearchIcon size={15} />
        </button>
        <button
          type="button"
          className={styles.action}
          data-on={sourceVisible ? 'true' : undefined}
          onClick={onToggleSource}
          title="Toggle markdown source (Ctrl+U)"
          aria-pressed={sourceVisible}
        >
          <CodeIcon size={15} />
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={onCycleTheme}
          title={THEME_LABEL[themeMode]}
        >
          <ThemeIcon mode={themeMode} />
        </button>
      </div>
    </div>
  )
}
