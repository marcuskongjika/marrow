import { BrowserWindow, app, dialog, ipcMain, shell, type WebContents } from 'electron'
import {
  MARKDOWN_EXTENSIONS,
  IPC,
  type AppInfo,
  type ExportRequest,
  type ExportResult,
  type RecentFile,
  type Settings
} from '../shared/types'
import { exportHtml, exportPdf } from './export'
import { isPathGranted } from './fileAccess'
import { store } from './store'
import { unwatchFile, watchFile } from './watcher'
import {
  applyThemeSource,
  broadcastRecentFiles,
  broadcastTheme,
  markRendererReady,
  openPaths,
  themeState,
  type OpenReport
} from './windows'

/**
 * Every message from the renderer lands here, and every one of them is checked
 * before it reaches the filesystem or the shell. The renderer is treated as
 * untrusted: it can ask to open a markdown file or to read an asset under a
 * folder the user already opened, and nothing else.
 */

const MAX_EXPORT_BYTES = 64 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.includes('\0')) return null
  return trimmed
}

function windowFor(contents: WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(contents)
}

function parseSettingsPatch(value: unknown): Partial<Settings> {
  if (!isRecord(value)) return {}
  const patch: Partial<Settings> = {}
  if (value.theme === 'light' || value.theme === 'dark' || value.theme === 'system') {
    patch.theme = value.theme
  }
  if (typeof value.zoom === 'number' && Number.isFinite(value.zoom)) {
    patch.zoom = value.zoom
  }
  if (typeof value.tocVisible === 'boolean') {
    patch.tocVisible = value.tocVisible
  }
  return patch
}

function parseExportRequest(value: unknown): ExportRequest | null {
  if (!isRecord(value)) return null
  const { html, title, sourcePath, theme } = value
  if (typeof html !== 'string' || html === '' || html.length > MAX_EXPORT_BYTES) return null
  if (typeof title !== 'string') return null
  if (sourcePath !== null && typeof sourcePath !== 'string') return null
  return {
    html,
    title: title.slice(0, 300),
    theme: theme === 'dark' ? 'dark' : 'light',
    sourcePath: sourcePath ?? null
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.rendererReady, (event) => {
    const queued = markRendererReady(event.sender.id)
    return {
      files: queued,
      settings: store().settings,
      recentFiles: store().recentFiles,
      theme: themeState()
    }
  })

  ipcMain.handle(IPC.openDialog, async (event): Promise<OpenReport> => {
    const window = windowFor(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Open Markdown',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Markdown',
          extensions: MARKDOWN_EXTENSIONS.map((extension) => extension.replace('.', ''))
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { opened: [], failures: [] }
    return openPaths(result.filePaths, window ?? undefined)
  })

  ipcMain.handle(IPC.openPath, async (event, rawPath: unknown): Promise<OpenReport> => {
    const path = asNonEmptyString(rawPath)
    if (!path) return { opened: [], failures: [{ path: '', error: 'Invalid path.' }] }
    return openPaths([path], windowFor(event.sender) ?? undefined)
  })

  ipcMain.handle(IPC.watch, (event, rawPath: unknown) => {
    const path = asNonEmptyString(rawPath)
    if (!path || !isPathGranted(path)) return false
    const contents = event.sender
    watchFile(contents.id, path, (payload) => {
      if (contents.isDestroyed()) return
      contents.send(IPC.onFileChanged, payload)
    })
    return true
  })

  ipcMain.handle(IPC.unwatch, (event, rawPath: unknown) => {
    const path = asNonEmptyString(rawPath)
    if (!path) return false
    unwatchFile(event.sender.id, path)
    return true
  })

  ipcMain.handle(IPC.recentGet, (): RecentFile[] => store().recentFiles)

  ipcMain.handle(IPC.recentClear, (): RecentFile[] => {
    const next = store().clearRecentFiles()
    app.clearRecentDocuments()
    broadcastRecentFiles()
    return next
  })

  ipcMain.handle(IPC.settingsGet, (): Settings => store().settings)

  ipcMain.handle(IPC.settingsSet, (_event, patch: unknown): Settings => {
    const previous = store().settings
    const next = store().updateSettings(parseSettingsPatch(patch))
    if (next.theme !== previous.theme) {
      applyThemeSource()
      broadcastTheme()
    }
    return next
  })

  ipcMain.handle(IPC.exportHtml, async (event, rawRequest: unknown): Promise<ExportResult> => {
    const request = parseExportRequest(rawRequest)
    const window = windowFor(event.sender)
    if (!request || !window) return { canceled: false, error: 'Nothing to export.' }
    return exportHtml(window, request)
  })

  ipcMain.handle(IPC.exportPdf, async (event, rawRequest: unknown): Promise<ExportResult> => {
    const request = parseExportRequest(rawRequest)
    const window = windowFor(event.sender)
    if (!request || !window) return { canceled: false, error: 'Nothing to export.' }
    return exportPdf(window, request)
  })

  ipcMain.handle(IPC.print, (event) => {
    event.sender.print({ printBackground: true })
    return true
  })

  ipcMain.handle(IPC.openExternal, async (_event, rawUrl: unknown) => {
    const url = asNonEmptyString(rawUrl)
    if (!url || !/^(https?|mailto|tel):/i.test(url)) return false
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle(IPC.openLocalFile, async (_event, rawPath: unknown) => {
    const path = asNonEmptyString(rawPath)
    if (!path || !isPathGranted(path)) return false
    const error = await shell.openPath(path)
    return error === ''
  })

  ipcMain.handle(IPC.revealInFolder, (_event, rawPath: unknown) => {
    const path = asNonEmptyString(rawPath)
    if (!path || !isPathGranted(path)) return false
    shell.showItemInFolder(path)
    return true
  })

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    isPackaged: app.isPackaged
  }))
}
