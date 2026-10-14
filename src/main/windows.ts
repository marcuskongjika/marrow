import { BrowserWindow, app, nativeTheme, screen, shell } from 'electron'
import { join } from 'node:path'
import { APP_INDEX_URL } from './protocol'
import { store, DEFAULT_BOUNDS, type WindowBounds } from './store'
import { openMarkdownFile } from './fileAccess'
import { unwatchOwner } from './watcher'
import { IPC, type OpenedFile, type ResolvedTheme, type ThemeState } from '../shared/types'

/**
 * Window lifecycle, plus the queue that makes "double-click a .md file while
 * Marrow is not running" work: the OS hands us the path long before a renderer
 * exists, so paths wait here until the renderer says it is listening.
 */

const readyRenderers = new Set<number>()
/** Set by the entry point to rebuild the Open Recent submenu without a cycle. */
let recentsListener: (() => void) | null = null
const pendingFiles = new Map<number, OpenedFile[]>()
/** Files received before any window existed. */
const bootQueue: string[] = []

export function resolvedTheme(): ResolvedTheme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function themeState(): ThemeState {
  return { mode: store().settings.theme, resolved: resolvedTheme() }
}

function backgroundColor(): string {
  return resolvedTheme() === 'dark' ? '#14161a' : '#fcfcfb'
}

/** Keep a restored window on an actually-connected display. */
function sanitizeBounds(bounds: WindowBounds): WindowBounds {
  if (bounds.x === undefined || bounds.y === undefined) return bounds
  const displays = screen.getAllDisplays()
  const visible = displays.some((display) => {
    const area = display.workArea
    return (
      bounds.x !== undefined &&
      bounds.y !== undefined &&
      bounds.x + bounds.width > area.x + 40 &&
      bounds.y + bounds.height > area.y + 40 &&
      bounds.x < area.x + area.width - 40 &&
      bounds.y < area.y + area.height - 40
    )
  })
  if (visible) return bounds
  const { width, height } = bounds
  return { width, height, maximized: bounds.maximized }
}

export function createMainWindow(): BrowserWindow {
  const saved = sanitizeBounds(store().windowBounds)

  const window = new BrowserWindow({
    width: saved.width || DEFAULT_BOUNDS.width,
    height: saved.height || DEFAULT_BOUNDS.height,
    ...(saved.x !== undefined ? { x: saved.x } : {}),
    ...(saved.y !== undefined ? { y: saved.y } : {}),
    minWidth: 520,
    minHeight: 420,
    show: false,
    backgroundColor: backgroundColor(),
    title: 'Marrow',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 16 } : undefined,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The three settings that define the security model.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
      // Zoom is applied as CSS inside the document, so the OS-level pinch and
      // Ctrl+wheel zoom stay out of the way.
      zoomFactor: 1
    }
  })

  if (saved.maximized) window.maximize()

  window.once('ready-to-show', () => {
    window.show()
  })

  const persistBounds = (): void => {
    if (window.isDestroyed()) return
    const maximized = window.isMaximized()
    if (maximized) {
      store().setWindowBounds({ ...store().windowBounds, maximized: true })
      return
    }
    const bounds = window.getNormalBounds()
    store().setWindowBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: false
    })
  }

  window.on('resize', persistBounds)
  window.on('move', persistBounds)
  window.on('maximize', persistBounds)
  window.on('unmaximize', persistBounds)
  window.on('close', () => {
    persistBounds()
    store().persistNow()
  })

  const contentsId = window.webContents.id
  window.on('closed', () => {
    readyRenderers.delete(contentsId)
    pendingFiles.delete(contentsId)
    unwatchOwner(contentsId)
  })

  // In development, surface renderer warnings and errors in the terminal that
  // is already open. Electron's own security warnings land here too, which makes
  // a regression in the CSP or the window options impossible to miss.
  if (!app.isPackaged) {
    window.webContents.on('console-message', (details) => {
      if (details.level !== 'error' && details.level !== 'warning') return
      const where = details.sourceId ? ` (${details.sourceId}:${details.lineNumber})` : ''
      console.warn(`[renderer:${details.level}] ${details.message}${where}`)
    })
  }

  // Nothing in this app should ever open a second window or navigate away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = app.isPackaged
      ? url.startsWith(APP_INDEX_URL)
      : url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'http://localhost')
    if (allowed) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadURL(APP_INDEX_URL)
  }

  return window
}

export function allWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())
}

export function primaryWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? allWindows()[0] ?? null
}

export function ensureWindow(): BrowserWindow {
  const existing = primaryWindow()
  if (existing) return existing
  return createMainWindow()
}

export function markRendererReady(contentsId: number): OpenedFile[] {
  readyRenderers.add(contentsId)
  const queued = pendingFiles.get(contentsId) ?? []
  pendingFiles.delete(contentsId)
  return queued
}

function deliver(window: BrowserWindow, file: OpenedFile): void {
  const contentsId = window.webContents.id
  if (readyRenderers.has(contentsId)) {
    window.webContents.send(IPC.onOpenFile, file)
    return
  }
  const queue = pendingFiles.get(contentsId) ?? []
  queue.push(file)
  pendingFiles.set(contentsId, queue)
}

export interface OpenReport {
  opened: string[]
  failures: { path: string; error: string }[]
}

/**
 * The single funnel for opening documents, whatever the source: the Open dialog,
 * drag-and-drop, a relative link, `open-file` on macOS or a CLI argument.
 */
export async function openPaths(paths: string[], target?: BrowserWindow): Promise<OpenReport> {
  const report: OpenReport = { opened: [], failures: [] }
  if (paths.length === 0) return report

  const window = target ?? ensureWindow()

  for (const candidate of paths) {
    const outcome = await openMarkdownFile(candidate)
    if (!outcome.ok) {
      report.failures.push({ path: outcome.path ?? String(candidate), error: outcome.error })
      continue
    }
    store().addRecentFile(outcome.file.path, outcome.file.name)
    app.addRecentDocument(outcome.file.path)
    deliver(window, outcome.file)
    report.opened.push(outcome.file.path)
  }

  if (report.opened.length > 0) {
    broadcastRecentFiles()
    if (!window.isVisible()) window.show()
    window.focus()
  }

  return report
}

/** Paths that arrived before the app was ready. */
export function queueBootFile(path: string): void {
  bootQueue.push(path)
}

export async function flushBootQueue(): Promise<void> {
  if (bootQueue.length === 0) return
  const paths = [...bootQueue]
  bootQueue.length = 0
  await openPaths(paths)
}

export function hasBootFiles(): boolean {
  return bootQueue.length > 0
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const window of allWindows()) {
    window.webContents.send(channel, payload)
  }
}

export function setRecentsListener(listener: () => void): void {
  recentsListener = listener
}

export function broadcastRecentFiles(): void {
  broadcast(IPC.onRecentChanged, store().recentFiles)
  recentsListener?.()
}

export function broadcastTheme(): void {
  const state = themeState()
  for (const window of allWindows()) {
    window.setBackgroundColor(backgroundColor())
    window.webContents.send(IPC.onThemeChanged, state)
  }
}

export function applyThemeSource(): void {
  nativeTheme.themeSource = store().settings.theme
}
