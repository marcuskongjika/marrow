import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  DEFAULT_SETTINGS,
  MAX_RECENT_FILES,
  ZOOM_LEVELS,
  type RecentFile,
  type Settings,
  type ThemeMode
} from '../shared/types'

/**
 * Tiny JSON-backed store for settings, recent files and window bounds.
 *
 * Hand-rolled rather than pulled from npm for two reasons: the shape is three
 * fields deep, and everything read off disk is validated field by field, so a
 * corrupted or hand-edited state file degrades to defaults instead of throwing
 * during startup.
 */

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export interface PersistedState {
  settings: Settings
  recentFiles: RecentFile[]
  window: WindowBounds
}

export const DEFAULT_BOUNDS: WindowBounds = { width: 1180, height: 820, maximized: false }

const FILE_NAME = 'marrow-state.json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coerceThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : DEFAULT_SETTINGS.theme
}

function coerceZoom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.zoom
  const nearest = ZOOM_LEVELS.reduce((best, level) =>
    Math.abs(level - value) < Math.abs(best - value) ? level : best
  )
  return nearest
}

function coerceSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS }
  return {
    theme: coerceThemeMode(value.theme),
    zoom: coerceZoom(value.zoom),
    tocVisible:
      typeof value.tocVisible === 'boolean' ? value.tocVisible : DEFAULT_SETTINGS.tocVisible
  }
}

function coerceRecentFiles(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) return []
  const out: RecentFile[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const { path, name, openedAt } = entry
    if (typeof path !== 'string' || path === '') continue
    out.push({
      path,
      name: typeof name === 'string' && name !== '' ? name : path,
      openedAt: typeof openedAt === 'number' && Number.isFinite(openedAt) ? openedAt : 0
    })
    if (out.length >= MAX_RECENT_FILES) break
  }
  return out
}

function coerceBounds(value: unknown): WindowBounds {
  if (!isRecord(value)) return { ...DEFAULT_BOUNDS }
  const width = typeof value.width === 'number' ? Math.round(value.width) : DEFAULT_BOUNDS.width
  const height = typeof value.height === 'number' ? Math.round(value.height) : DEFAULT_BOUNDS.height
  const bounds: WindowBounds = {
    width: Math.min(Math.max(width, 480), 10_000),
    height: Math.min(Math.max(height, 360), 10_000),
    maximized: value.maximized === true
  }
  if (typeof value.x === 'number' && Number.isFinite(value.x)) bounds.x = Math.round(value.x)
  if (typeof value.y === 'number' && Number.isFinite(value.y)) bounds.y = Math.round(value.y)
  return bounds
}

class Store {
  private state: PersistedState
  private readonly file: string
  private writeTimer: NodeJS.Timeout | null = null

  constructor() {
    this.file = join(app.getPath('userData'), FILE_NAME)
    this.state = this.read()
  }

  private read(): PersistedState {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      const record = isRecord(parsed) ? parsed : {}
      return {
        settings: coerceSettings(record.settings),
        recentFiles: coerceRecentFiles(record.recentFiles),
        window: coerceBounds(record.window)
      }
    } catch {
      return {
        settings: { ...DEFAULT_SETTINGS },
        recentFiles: [],
        window: { ...DEFAULT_BOUNDS }
      }
    }
  }

  /** Debounced so dragging a window does not hammer the disk. */
  private schedulePersist(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      this.persistNow()
    }, 400)
  }

  persistNow(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const temp = `${this.file}.tmp`
      writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8')
      renameSync(temp, this.file)
    } catch (error) {
      console.error('[marrow] failed to persist state:', error)
    }
  }

  get settings(): Settings {
    return { ...this.state.settings }
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = coerceSettings({ ...this.state.settings, ...patch })
    this.state.settings = next
    this.schedulePersist()
    return { ...next }
  }

  get recentFiles(): RecentFile[] {
    return this.state.recentFiles.map((entry) => ({ ...entry }))
  }

  addRecentFile(path: string, name: string): RecentFile[] {
    const filtered = this.state.recentFiles.filter(
      (entry) => entry.path.toLowerCase() !== path.toLowerCase()
    )
    filtered.unshift({ path, name, openedAt: Date.now() })
    this.state.recentFiles = filtered.slice(0, MAX_RECENT_FILES)
    this.schedulePersist()
    return this.recentFiles
  }

  removeRecentFile(path: string): RecentFile[] {
    this.state.recentFiles = this.state.recentFiles.filter(
      (entry) => entry.path.toLowerCase() !== path.toLowerCase()
    )
    this.schedulePersist()
    return this.recentFiles
  }

  clearRecentFiles(): RecentFile[] {
    this.state.recentFiles = []
    this.schedulePersist()
    return []
  }

  get windowBounds(): WindowBounds {
    return { ...this.state.window }
  }

  setWindowBounds(bounds: WindowBounds): void {
    this.state.window = coerceBounds(bounds)
    this.schedulePersist()
  }
}

let instance: Store | null = null

export function store(): Store {
  instance ??= new Store()
  return instance
}

export type { Store }
