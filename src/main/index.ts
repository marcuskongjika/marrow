import { app, nativeTheme } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isMarkdownFile } from './fileAccess'
import { registerIpcHandlers } from './ipc'
import { rebuildMenu, setAboutPanel } from './menu'
import { hardenSession, registerProtocolHandlers, registerSchemesAsPrivileged } from './protocol'
import { store } from './store'
import { unwatchAll } from './watcher'
import {
  applyThemeSource,
  broadcastTheme,
  createMainWindow,
  ensureWindow,
  flushBootQueue,
  hasBootFiles,
  openPaths,
  primaryWindow,
  queueBootFile,
  setRecentsListener
} from './windows'

/**
 * Application entry point.
 *
 * Order matters in two places: custom schemes must be registered as privileged
 * before `app.whenReady()`, and `open-file` has to be listening before the app
 * is ready or macOS will drop the double-clicked document on the floor.
 */

registerSchemesAsPrivileged()

if (process.platform === 'win32') {
  app.setAppUserModelId('com.marrow.viewer')
}

/** Pull markdown paths out of a process argv vector. */
export function markdownPathsFromArgv(argv: string[], cwd: string): string[] {
  const paths: string[] = []
  for (const argument of argv.slice(1)) {
    if (argument.startsWith('-') || argument === '.' || argument === '') continue
    if (!isMarkdownFile(argument)) continue
    const absolute = resolve(cwd, argument)
    try {
      if (existsSync(absolute) && statSync(absolute).isFile()) paths.push(absolute)
    } catch {
      // Unreadable path: ignore it rather than failing startup.
    }
  }
  return paths
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  // A running instance will take over the file we were asked to open.
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const paths = markdownPathsFromArgv(argv, workingDirectory || process.cwd())
    const window = ensureWindow()
    if (window.isMinimized()) window.restore()
    window.focus()
    if (paths.length > 0) void openPaths(paths, window)
  })

  // macOS delivers "Open with Marrow" here, often before the app is ready.
  app.on('open-file', (event, path) => {
    event.preventDefault()
    if (!app.isReady()) {
      queueBootFile(path)
      return
    }
    void openPaths([path])
  })

  for (const path of markdownPathsFromArgv(process.argv, process.cwd())) {
    queueBootFile(path)
  }

  void app.whenReady().then(async () => {
    store()
    applyThemeSource()
    setAboutPanel()

    registerProtocolHandlers(join(__dirname, '../renderer'))
    hardenSession()
    registerIpcHandlers()
    setRecentsListener(rebuildMenu)
    rebuildMenu()

    nativeTheme.on('updated', () => {
      broadcastTheme()
    })

    const window = createMainWindow()

    if (hasBootFiles()) {
      // The renderer queues these itself until it signals readiness.
      await flushBootQueue()
    } else {
      window.focus()
    }

    app.on('activate', () => {
      if (primaryWindow() === null) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    unwatchAll()
    store().persistNow()
  })

  // Defence in depth: refuse to attach a preload script to anything unexpected.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
  })
}
