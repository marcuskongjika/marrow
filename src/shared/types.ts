/**
 * Types shared by the main process, the preload bridge and the renderer.
 * This module must stay free of Node and Electron imports so the renderer and
 * the unit tests can import it directly.
 */

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'] as const
export const PDF_EXTENSIONS = ['.pdf'] as const

/** Everything Marrow can open in a tab. */
export const DOCUMENT_EXTENSIONS = [...MARKDOWN_EXTENSIONS, ...PDF_EXTENSIONS] as const

export type DocumentKind = 'markdown' | 'pdf'

/** Hard ceiling on files we will read, so a stray 2 GB file cannot wedge the UI. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024

/** PDFs are streamed to pdf.js rather than held as a string, so they can be larger. */
export const MAX_PDF_BYTES = 512 * 1024 * 1024

export const ZOOM_LEVELS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5] as const
export const DEFAULT_ZOOM = 1

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  zoom: number
  tocVisible: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  zoom: DEFAULT_ZOOM,
  tocVisible: true
}

export interface RecentFile {
  path: string
  name: string
  openedAt: number
}

export const MAX_RECENT_FILES = 10

/**
 * A document opened by the main process and handed to the renderer. Markdown
 * arrives with its text in `content`; a PDF arrives with `content` empty and the
 * renderer loads its bytes through `marrow-file://`.
 */
export interface OpenedFile {
  kind: DocumentKind
  path: string
  name: string
  dir: string
  content: string
  /** Modification time, used to ignore redundant watch events. */
  mtimeMs: number
}

export interface ThemeState {
  mode: ThemeMode
  resolved: ResolvedTheme
}

export interface ExportRequest {
  /** The complete standalone HTML document, assembled by the renderer. */
  html: string
  title: string
  theme: ResolvedTheme
  /** Absolute path of the source document, used to name the export. */
  sourcePath: string | null
}

export interface ExportResult {
  canceled: boolean
  path?: string
  error?: string
}

/**
 * Commands the native menus dispatch into the focused window. Keeping them in
 * one union means the renderer can handle every menu item exhaustively.
 */
export const MENU_COMMANDS = [
  'file:close-tab',
  'file:next-tab',
  'file:prev-tab',
  'file:export-html',
  'file:export-pdf',
  'file:print',
  'view:toggle-toc',
  'view:toggle-source',
  'view:zoom-in',
  'view:zoom-out',
  'view:zoom-reset',
  'view:reload-document',
  'edit:find',
  'edit:find-next',
  'edit:find-prev',
  'edit:copy-document',
  'nav:top',
  'nav:bottom',
  'help:shortcuts'
] as const
export type MenuCommand = (typeof MENU_COMMANDS)[number]

export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === 'string' && (MENU_COMMANDS as readonly string[]).includes(value)
}

/** IPC channel names, shared so main and preload can never drift apart. */
export const IPC = {
  openDialog: 'marrow:open-dialog',
  openPath: 'marrow:open-path',
  watch: 'marrow:watch',
  unwatch: 'marrow:unwatch',
  recentGet: 'marrow:recent-get',
  recentClear: 'marrow:recent-clear',
  settingsGet: 'marrow:settings-get',
  settingsSet: 'marrow:settings-set',
  exportHtml: 'marrow:export-html',
  exportPdf: 'marrow:export-pdf',
  print: 'marrow:print',
  openExternal: 'marrow:open-external',
  openLocalFile: 'marrow:open-local-file',
  revealInFolder: 'marrow:reveal-in-folder',
  appInfo: 'marrow:app-info',
  rendererReady: 'marrow:renderer-ready',
  // main -> renderer
  onOpenFile: 'marrow:on-open-file',
  onFileChanged: 'marrow:on-file-changed',
  onMenuCommand: 'marrow:on-menu-command',
  onThemeChanged: 'marrow:on-theme-changed',
  onRecentChanged: 'marrow:on-recent-changed'
} as const

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  isPackaged: boolean
}

export type OpenOutcome =
  { ok: true; file: OpenedFile } | { ok: false; error: string; path?: string }

export interface FileChangedPayload {
  path: string
  content: string
  mtimeMs: number
}
