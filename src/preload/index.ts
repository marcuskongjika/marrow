import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  isMenuCommand,
  type AppInfo,
  type ExportRequest,
  type ExportResult,
  type FileChangedPayload,
  type MenuCommand,
  type OpenedFile,
  type RecentFile,
  type Settings,
  type ThemeState
} from '../shared/types'

/**
 * The whole surface the renderer gets. Nothing here takes a callback into the
 * main process, nothing exposes `ipcRenderer` itself, and every subscription
 * returns its own unsubscribe function so React effects can clean up.
 */

export interface OpenReport {
  opened: string[]
  failures: { path: string; error: string }[]
}

export interface Bootstrap {
  files: OpenedFile[]
  settings: Settings
  recentFiles: RecentFile[]
  theme: ThemeState
}

type Unsubscribe = () => void

function subscribe<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => {
    handler(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  /** Announce that the renderer is listening; returns queued files and settings. */
  ready: (): Promise<Bootstrap> => ipcRenderer.invoke(IPC.rendererReady) as Promise<Bootstrap>,

  openDialog: (): Promise<OpenReport> => ipcRenderer.invoke(IPC.openDialog) as Promise<OpenReport>,
  openPath: (path: string): Promise<OpenReport> =>
    ipcRenderer.invoke(IPC.openPath, path) as Promise<OpenReport>,

  /**
   * Resolve a dropped `File` to its path. `File.path` was removed from Electron,
   * and this is the sanctioned replacement; the path still has to survive the
   * checks in the main process before anything is read.
   */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  watch: (path: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.watch, path) as Promise<boolean>,
  unwatch: (path: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.unwatch, path) as Promise<boolean>,

  getRecentFiles: (): Promise<RecentFile[]> =>
    ipcRenderer.invoke(IPC.recentGet) as Promise<RecentFile[]>,
  clearRecentFiles: (): Promise<RecentFile[]> =>
    ipcRenderer.invoke(IPC.recentClear) as Promise<RecentFile[]>,

  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet) as Promise<Settings>,
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke(IPC.settingsSet, patch) as Promise<Settings>,

  exportHtml: (request: ExportRequest): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC.exportHtml, request) as Promise<ExportResult>,
  exportPdf: (request: ExportRequest): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC.exportPdf, request) as Promise<ExportResult>,
  print: (): Promise<boolean> => ipcRenderer.invoke(IPC.print) as Promise<boolean>,

  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.openExternal, url) as Promise<boolean>,
  openLocalFile: (path: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.openLocalFile, path) as Promise<boolean>,
  revealInFolder: (path: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.revealInFolder, path) as Promise<boolean>,

  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo) as Promise<AppInfo>,

  onOpenFile: (handler: (file: OpenedFile) => void): Unsubscribe =>
    subscribe<OpenedFile>(IPC.onOpenFile, handler),
  onFileChanged: (handler: (payload: FileChangedPayload) => void): Unsubscribe =>
    subscribe<FileChangedPayload>(IPC.onFileChanged, handler),
  onThemeChanged: (handler: (state: ThemeState) => void): Unsubscribe =>
    subscribe<ThemeState>(IPC.onThemeChanged, handler),
  onRecentChanged: (handler: (files: RecentFile[]) => void): Unsubscribe =>
    subscribe<RecentFile[]>(IPC.onRecentChanged, handler),
  onMenuCommand: (handler: (command: MenuCommand) => void): Unsubscribe =>
    subscribe<unknown>(IPC.onMenuCommand, (value) => {
      // The renderer only ever sees commands from the known union.
      if (isMenuCommand(value)) handler(value)
    })
}

export type MarrowApi = typeof api

contextBridge.exposeInMainWorld('marrow', api)
