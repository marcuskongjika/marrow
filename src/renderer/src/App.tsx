import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  DEFAULT_SETTINGS,
  DEFAULT_ZOOM,
  ZOOM_LEVELS,
  type AppInfo,
  type MenuCommand,
  type RecentFile,
  type ResolvedTheme,
  type Settings,
  type ThemeMode
} from '@shared/types'
import { EmptyState } from './components/EmptyState'
import { FindBar } from './components/FindBar'
import { Reader } from './components/Reader'
import { ShortcutsOverlay } from './components/ShortcutsOverlay'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { Toasts } from './components/Toasts'
import { useToasts } from './hooks/useToasts'
import { buildStandaloneHtml } from './lib/exportDocument'
import { clearHighlights, findInElement, paintHighlights, revealRange } from './lib/find'
import { forgetScroll } from './lib/scrollMemory'
import { bootstrapPromise, receiveOpenedFiles } from './state/bootstrap'
import { useDocuments } from './state/documents'
import { ThemeContext } from './state/theme'
import styles from './App.module.css'

/**
 * Application shell: owns settings, theme, recent files, find state and the
 * menu-command dispatch, and hands documents to the reader.
 */

interface FindState {
  open: boolean
  query: string
  matchCase: boolean
  index: number
  matches: number
}

const INITIAL_FIND: FindState = { open: false, query: '', matchCase: false, index: 0, matches: 0 }

const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system']

function sameSettings(a: Settings, b: Settings): boolean {
  return a.theme === b.theme && a.zoom === b.zoom && a.tocVisible === b.tocVisible
}

export function App(): JSX.Element {
  const documents = useDocuments()
  const { docs, active, openFile, fileChanged, close, closeActive, activate, cycle, toggleSource } =
    documents

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [theme, setTheme] = useState<ResolvedTheme>('light')
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [activeHeading, setActiveHeading] = useState<string | null>(null)
  const [pendingHash, setPendingHash] = useState<{ path: string; hash: string } | null>(null)
  const [find, setFind] = useState<FindState>(INITIAL_FIND)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [dropping, setDropping] = useState(false)

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const ranges = useRef<Range[]>([])
  const toasts = useToasts()
  const { push } = toasts

  const isMac = appInfo?.platform === 'darwin'

  /* ---------------------------------------------------------------- startup */

  useEffect(() => {
    void bootstrapPromise.then((bootstrap) => {
      setSettings(bootstrap.settings)
      setRecentFiles(bootstrap.recentFiles)
      setTheme(bootstrap.theme.resolved)
      for (const file of bootstrap.files) openFile(file)
    })
    void window.marrow.getAppInfo().then(setAppInfo)
  }, [openFile])

  useEffect(() => receiveOpenedFiles(openFile), [openFile])
  useEffect(() => window.marrow.onFileChanged(fileChanged), [fileChanged])
  useEffect(() => window.marrow.onRecentChanged(setRecentFiles), [])

  useEffect(
    () =>
      window.marrow.onThemeChanged((state) => {
        setTheme(state.resolved)
        setSettings((current) => ({ ...current, theme: state.mode }))
      }),
    []
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const title = active ? (active.render?.title ?? active.name) : null
    document.title = title ? `${title} — Marrow` : 'Marrow'
  }, [active])

  /* --------------------------------------------------------------- settings */

  /**
   * Settings changes are expressed as reducers over the current value, never as
   * reads of `settings` from the enclosing render. Menu commands arrive as
   * separate IPC messages that can both land before React commits, so
   * "zoom in, zoom in" has to compose rather than compute twice from the same
   * starting point.
   */
  const updateSettings = useCallback((change: (current: Settings) => Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...change(current) }
      return sameSettings(next, current) ? current : next
    })
  }, [])

  // Persisting is a side effect of the value having changed, which keeps it out
  // of the updaters above (React may run those more than once).
  const persisted = useRef<Settings | null>(null)
  useEffect(() => {
    if (persisted.current === null) {
      persisted.current = settings
      return
    }
    if (sameSettings(persisted.current, settings)) return
    persisted.current = settings
    void window.marrow.setSettings(settings)
  }, [settings])

  const stepZoom = useCallback(
    (direction: number) => {
      updateSettings((current) => {
        const index = ZOOM_LEVELS.indexOf(current.zoom as (typeof ZOOM_LEVELS)[number])
        const from = index < 0 ? ZOOM_LEVELS.indexOf(DEFAULT_ZOOM) : index
        const next = Math.min(Math.max(from + direction, 0), ZOOM_LEVELS.length - 1)
        return { zoom: ZOOM_LEVELS[next] ?? DEFAULT_ZOOM }
      })
    },
    [updateSettings]
  )

  const resetZoom = useCallback(() => {
    updateSettings(() => ({ zoom: DEFAULT_ZOOM }))
  }, [updateSettings])

  const toggleToc = useCallback(() => {
    updateSettings((current) => ({ tocVisible: !current.tocVisible }))
  }, [updateSettings])

  const cycleTheme = useCallback(() => {
    updateSettings((current) => {
      const index = THEME_CYCLE.indexOf(current.theme)
      return { theme: THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? 'system' }
    })
  }, [updateSettings])

  /* ------------------------------------------------------------------ files */

  const reportFailures = useCallback(
    (failures: { path: string; error: string }[]) => {
      for (const failure of failures) {
        push({ kind: 'error', message: failure.error, detail: failure.path || undefined })
      }
    },
    [push]
  )

  const openDialog = useCallback(() => {
    void window.marrow.openDialog().then((report) => {
      reportFailures(report.failures)
    })
  }, [reportFailures])

  const openPath = useCallback(
    (path: string, hash?: string) => {
      if (hash) setPendingHash({ path, hash })
      void window.marrow.openPath(path).then((report) => {
        reportFailures(report.failures)
      })
    },
    [reportFailures]
  )

  const closeTab = useCallback(
    (path: string) => {
      forgetScroll(path)
      close(path)
    },
    [close]
  )

  const clearRecent = useCallback(() => {
    void window.marrow.clearRecentFiles().then(setRecentFiles)
  }, [])

  /* ----------------------------------------------------------- drag and drop */

  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDropping(true)
    }
    const onDragLeave = (event: DragEvent): void => {
      if (event.relatedTarget === null) setDropping(false)
    }
    const onDrop = (event: DragEvent): void => {
      event.preventDefault()
      setDropping(false)
      const files = [...(event.dataTransfer?.files ?? [])]
      if (files.length === 0) return
      for (const file of files) {
        // `File.path` is gone; the preload bridge resolves it through webUtils.
        const path = window.marrow.pathForFile(file)
        if (path) openPath(path)
      }
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragenter', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragenter', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [openPath])

  /* ------------------------------------------------------------------- find */

  const closeFind = useCallback(() => {
    setFind(INITIAL_FIND)
    ranges.current = []
    clearHighlights()
    scrollerRef.current?.focus()
  }, [])

  const stepMatch = useCallback((direction: number) => {
    setFind((current) => {
      if (current.matches === 0) return current
      const next = (current.index + direction + current.matches) % current.matches
      return { ...current, index: next }
    })
  }, [])

  // Recompute matches when the query, the options or the document changes.
  useEffect(() => {
    if (!find.open) return
    const article = articleRef.current
    if (!article) return

    const found = find.query === '' ? [] : findInElement(article, find.query, find.matchCase)
    ranges.current = found
    setFind((current) => ({
      ...current,
      matches: found.length,
      index: found.length === 0 ? 0 : Math.min(current.index, found.length - 1)
    }))
  }, [
    find.open,
    find.query,
    find.matchCase,
    active?.path,
    active?.renderedRevision,
    active?.showSource
  ])

  // Paint and reveal whenever the selection moves.
  useEffect(() => {
    if (!find.open) return
    paintHighlights(ranges.current, find.index)
    const range = ranges.current[find.index]
    const scroller = scrollerRef.current
    if (range && scroller) revealRange(range, scroller)
  }, [find.open, find.index, find.matches])

  /* ----------------------------------------------------------------- export */

  const runExport = useCallback(
    (kind: 'html' | 'pdf') => {
      const article = articleRef.current
      if (!article || !active) {
        push({ kind: 'error', message: 'Open a document before exporting.' })
        return
      }
      const title = active.render?.title ?? active.name
      // A PDF is a printed artefact: it always gets the light palette, however
      // the app happens to be themed. An HTML export keeps what is on screen.
      const exportTheme: ResolvedTheme = kind === 'pdf' ? 'light' : theme

      void buildStandaloneHtml({
        article,
        title,
        theme: exportTheme,
        currentTheme: theme,
        sourceName: active.name
      })
        .then((html) => {
          const request = { html, title, theme: exportTheme, sourcePath: active.path }
          return kind === 'html'
            ? window.marrow.exportHtml(request)
            : window.marrow.exportPdf(request)
        })
        .then((result) => {
          if (result.canceled) return
          if (result.error) {
            push({ kind: 'error', message: 'Export failed', detail: result.error })
            return
          }
          const saved = result.path
          push({
            kind: 'success',
            message: kind === 'html' ? 'Exported as HTML' : 'Exported as PDF',
            detail: saved,
            ...(saved
              ? {
                  action: {
                    label: 'Show',
                    run: () => {
                      void window.marrow.revealInFolder(saved)
                    }
                  }
                }
              : {})
          })
        })
        .catch((error: unknown) => {
          push({
            kind: 'error',
            message: 'Export failed',
            detail: error instanceof Error ? error.message : undefined
          })
        })
    },
    [active, push, theme]
  )

  const copyDocument = useCallback(() => {
    const text = articleRef.current?.innerText ?? ''
    if (text === '') return
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        push({ kind: 'success', message: 'Document text copied' })
      })
      .catch(() => {
        push({ kind: 'error', message: 'Could not copy the document text' })
      })
  }, [push])

  /* ---------------------------------------------------------- menu commands */

  const scrollTo = useCallback((position: 'top' | 'bottom') => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollTo({
      top: position === 'top' ? 0 : scroller.scrollHeight,
      behavior: 'smooth'
    })
  }, [])

  const handleCommand = useCallback(
    (command: MenuCommand) => {
      switch (command) {
        case 'file:close-tab':
          if (active) forgetScroll(active.path)
          closeActive()
          break
        case 'file:next-tab':
          cycle(1)
          break
        case 'file:prev-tab':
          cycle(-1)
          break
        case 'file:export-html':
          runExport('html')
          break
        case 'file:export-pdf':
          runExport('pdf')
          break
        case 'file:print':
          void window.marrow.print()
          break
        case 'view:toggle-toc':
          toggleToc()
          break
        case 'view:toggle-source':
          toggleSource()
          break
        case 'view:zoom-in':
          stepZoom(1)
          break
        case 'view:zoom-out':
          stepZoom(-1)
          break
        case 'view:zoom-reset':
          resetZoom()
          break
        case 'view:reload-document':
          if (active) openPath(active.path)
          break
        case 'edit:find':
          setFind((current) => ({ ...current, open: true }))
          break
        case 'edit:find-next':
          if (find.open) stepMatch(1)
          else setFind((current) => ({ ...current, open: true }))
          break
        case 'edit:find-prev':
          if (find.open) stepMatch(-1)
          else setFind((current) => ({ ...current, open: true }))
          break
        case 'edit:copy-document':
          copyDocument()
          break
        case 'nav:top':
          scrollTo('top')
          break
        case 'nav:bottom':
          scrollTo('bottom')
          break
        case 'help:shortcuts':
          setShortcutsOpen((current) => !current)
          break
      }
    },
    [
      active,
      closeActive,
      copyDocument,
      cycle,
      find.open,
      openPath,
      resetZoom,
      runExport,
      scrollTo,
      toggleToc,
      stepMatch,
      stepZoom,
      toggleSource
    ]
  )

  useEffect(() => window.marrow.onMenuCommand(handleCommand), [handleCommand])

  /* ------------------------------------------------------------------ views */

  const toc = useMemo(() => active?.render?.toc ?? [], [active])
  const showSidebar = settings.tocVisible && docs.length > 0

  return (
    <ThemeContext.Provider value={theme}>
      <div className={styles.app}>
        <TabBar
          docs={docs}
          activePath={active?.path ?? null}
          isMac={isMac}
          tocVisible={settings.tocVisible}
          sourceVisible={active?.showSource ?? false}
          themeMode={settings.theme}
          onSelect={activate}
          onClose={closeTab}
          onOpen={openDialog}
          onToggleToc={toggleToc}
          onToggleSource={() => toggleSource()}
          onCycleTheme={cycleTheme}
          onFind={() => setFind((current) => ({ ...current, open: true }))}
        />

        <div className={styles.body}>
          {showSidebar && (
            <Sidebar
              toc={toc}
              activeId={activeHeading}
              documentTitle={active?.name ?? ''}
              onSelect={(id) => {
                const article = articleRef.current
                const target = article?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
                target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            />
          )}

          <main className={styles.main}>
            {find.open && (
              <FindBar
                query={find.query}
                matchCase={find.matchCase}
                matches={find.matches}
                activeIndex={find.index}
                onQueryChange={(query) => setFind((current) => ({ ...current, query, index: 0 }))}
                onToggleMatchCase={() =>
                  setFind((current) => ({ ...current, matchCase: !current.matchCase }))
                }
                onNext={() => stepMatch(1)}
                onPrevious={() => stepMatch(-1)}
                onClose={closeFind}
              />
            )}

            {active ? (
              <>
                {active.error && (
                  <div className={styles.renderError} role="alert">
                    <strong>This document could not be rendered.</strong>
                    <span>{active.error}</span>
                  </div>
                )}
                <Reader
                  doc={active}
                  zoom={settings.zoom}
                  scrollerRef={scrollerRef}
                  articleRef={articleRef}
                  pendingHash={pendingHash?.path === active.path ? pendingHash.hash : null}
                  onHashConsumed={() => setPendingHash(null)}
                  onOpenPath={openPath}
                  onActiveHeadingChange={setActiveHeading}
                />
              </>
            ) : (
              <EmptyState
                recentFiles={recentFiles}
                isMac={isMac}
                onOpen={openDialog}
                onOpenPath={openPath}
                onClearRecent={clearRecent}
              />
            )}
          </main>
        </div>

        <StatusBar
          path={active?.path ?? null}
          stats={active?.render?.stats ?? null}
          zoom={settings.zoom}
          reloadedAt={active?.reloadedAt ?? null}
          busy={active ? active.renderedRevision !== active.revision : false}
        />

        {dropping && (
          <div className={styles.dropOverlay}>
            <div className={styles.dropCard}>Drop to open in Marrow</div>
          </div>
        )}

        <Toasts {...toasts} />

        {shortcutsOpen && (
          <ShortcutsOverlay
            isMac={isMac}
            appInfo={appInfo}
            onClose={() => setShortcutsOpen(false)}
          />
        )}
      </div>
    </ThemeContext.Provider>
  )
}
