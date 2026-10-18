import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { Root } from 'hast'
import { renderMarkdown, renderSource, type RenderResult, type TocEntry } from '@shared/markdown'
import type { DocumentKind, FileChangedPayload, OpenedFile } from '@shared/types'

/**
 * Tab and document state.
 *
 * Documents are keyed by absolute path, which makes "open the file that is
 * already open" collapse to "focus that tab" for free. Each document carries a
 * `revision` that is bumped whenever its content changes (first load, live
 * reload, manual reload); a render is in sync when `renderedRevision` catches
 * up. Stale async renders are therefore discarded instead of flickering.
 *
 * PDFs share the same lifecycle, but their "render" happens in the PDF view:
 * it loads the bytes for the current revision and reports back with `pdf-loaded`.
 * A PDF has no text in `content`, so its changes are detected by mtime.
 */

/** What the PDF view learned about a loaded PDF. */
export interface PdfInfo {
  pageCount: number
  title: string | null
  /** The PDF outline, flattened into sidebar entries. */
  toc: TocEntry[]
  /** The 1-based page each outline entry points at, by entry id. */
  outlinePages: Record<string, number>
}

export interface DocumentState {
  kind: DocumentKind
  path: string
  name: string
  content: string
  mtimeMs: number
  revision: number
  renderedRevision: number
  render: RenderResult | null
  pdf: PdfInfo | null
  error: string | null
  showSource: boolean
  sourceTree: Root | null
  sourceRevision: number
  reloadedAt: number | null
}

interface State {
  docs: DocumentState[]
  activePath: string | null
}

type Action =
  | { type: 'open'; file: OpenedFile }
  | { type: 'changed'; payload: FileChangedPayload }
  | { type: 'rendered'; path: string; revision: number; result: RenderResult }
  | { type: 'pdf-loaded'; path: string; revision: number; info: PdfInfo }
  | { type: 'failed'; path: string; revision: number; message: string }
  | { type: 'source-rendered'; path: string; revision: number; tree: Root }
  | { type: 'close'; path: string }
  | { type: 'close-active' }
  | { type: 'activate'; path: string }
  | { type: 'cycle'; delta: number }
  | { type: 'toggle-source'; path?: string }

const initialState: State = { docs: [], activePath: null }

function makeDocument(file: OpenedFile): DocumentState {
  return {
    kind: file.kind,
    path: file.path,
    name: file.name,
    content: file.content,
    mtimeMs: file.mtimeMs,
    revision: 1,
    renderedRevision: 0,
    render: null,
    pdf: null,
    error: null,
    showSource: false,
    sourceTree: null,
    sourceRevision: 0,
    reloadedAt: null
  }
}

/** Markdown changes when its text does; a PDF when the file on disk does. */
function hasChanged(doc: DocumentState, content: string, mtimeMs: number): boolean {
  return doc.kind === 'pdf' ? doc.mtimeMs !== mtimeMs : doc.content !== content
}

function replace(
  docs: DocumentState[],
  path: string,
  update: (doc: DocumentState) => DocumentState
): DocumentState[] {
  return docs.map((doc) => (doc.path === path ? update(doc) : doc))
}

/** Close one tab and move focus to its neighbour, the way a browser does. */
function closeDocument(state: State, path: string): State {
  const index = state.docs.findIndex((doc) => doc.path === path)
  if (index < 0) return state
  const docs = state.docs.filter((doc) => doc.path !== path)
  if (state.activePath !== path) return { ...state, docs }
  const next = docs[Math.min(index, docs.length - 1)]
  return { docs, activePath: next ? next.path : null }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'open': {
      const existing = state.docs.find((doc) => doc.path === action.file.path)
      if (!existing) {
        return {
          docs: [...state.docs, makeDocument(action.file)],
          activePath: action.file.path
        }
      }
      const contentChanged = hasChanged(existing, action.file.content, action.file.mtimeMs)
      return {
        docs: contentChanged
          ? replace(state.docs, action.file.path, (doc) => ({
              ...doc,
              content: action.file.content,
              mtimeMs: action.file.mtimeMs,
              revision: doc.revision + 1,
              error: null
            }))
          : state.docs,
        activePath: action.file.path
      }
    }

    case 'changed': {
      const existing = state.docs.find((doc) => doc.path === action.payload.path)
      if (!existing || !hasChanged(existing, action.payload.content, action.payload.mtimeMs)) {
        return state
      }
      return {
        ...state,
        docs: replace(state.docs, action.payload.path, (doc) => ({
          ...doc,
          content: action.payload.content,
          mtimeMs: action.payload.mtimeMs,
          revision: doc.revision + 1,
          error: null,
          reloadedAt: Date.now()
        }))
      }
    }

    case 'rendered':
      return {
        ...state,
        docs: replace(state.docs, action.path, (doc) =>
          doc.revision !== action.revision
            ? doc
            : { ...doc, render: action.result, renderedRevision: action.revision, error: null }
        )
      }

    case 'pdf-loaded':
      return {
        ...state,
        docs: replace(state.docs, action.path, (doc) =>
          doc.revision !== action.revision
            ? doc
            : { ...doc, pdf: action.info, renderedRevision: action.revision, error: null }
        )
      }

    case 'failed':
      return {
        ...state,
        docs: replace(state.docs, action.path, (doc) =>
          doc.revision !== action.revision
            ? doc
            : { ...doc, renderedRevision: action.revision, error: action.message }
        )
      }

    case 'source-rendered':
      return {
        ...state,
        docs: replace(state.docs, action.path, (doc) =>
          doc.revision !== action.revision
            ? doc
            : { ...doc, sourceTree: action.tree, sourceRevision: action.revision }
        )
      }

    case 'close':
      return closeDocument(state, action.path)

    case 'close-active':
      return state.activePath === null ? state : closeDocument(state, state.activePath)

    case 'activate':
      return state.docs.some((doc) => doc.path === action.path)
        ? { ...state, activePath: action.path }
        : state

    case 'cycle': {
      if (state.docs.length < 2) return state
      const index = state.docs.findIndex((doc) => doc.path === state.activePath)
      if (index < 0) return state
      const size = state.docs.length
      const nextIndex = (((index + action.delta) % size) + size) % size
      const next = state.docs[nextIndex]
      return next ? { ...state, activePath: next.path } : state
    }

    case 'toggle-source': {
      const target = action.path ?? state.activePath
      if (target === null) return state
      return {
        ...state,
        docs: replace(state.docs, target, (doc) =>
          // A PDF has no markdown source to show.
          doc.kind === 'pdf' ? doc : { ...doc, showSource: !doc.showSource }
        )
      }
    }

    default:
      return state
  }
}

export interface DocumentsApi {
  docs: DocumentState[]
  active: DocumentState | null
  activePath: string | null
  openFile: (file: OpenedFile) => void
  fileChanged: (payload: FileChangedPayload) => void
  close: (path: string) => void
  closeActive: () => void
  activate: (path: string) => void
  cycle: (delta: number) => void
  toggleSource: (path?: string) => void
  pdfLoaded: (path: string, revision: number, info: PdfInfo) => void
  pdfFailed: (path: string, revision: number, message: string) => void
}

export function useDocuments(): DocumentsApi {
  const [state, dispatch] = useReducer(reducer, initialState)
  const inFlight = useRef(new Set<string>())
  const watched = useRef(new Set<string>())

  const active = useMemo(
    () => state.docs.find((doc) => doc.path === state.activePath) ?? null,
    [state.docs, state.activePath]
  )

  // Render any document whose content has moved ahead of its rendered tree.
  useEffect(() => {
    for (const doc of state.docs) {
      if (doc.kind !== 'markdown' || doc.renderedRevision === doc.revision) continue
      const key = `${doc.path}@${doc.revision}`
      if (inFlight.current.has(key)) continue
      inFlight.current.add(key)

      renderMarkdown(doc.content, { basePath: doc.path })
        .then((result) => {
          dispatch({ type: 'rendered', path: doc.path, revision: doc.revision, result })
        })
        .catch((error: unknown) => {
          dispatch({
            type: 'failed',
            path: doc.path,
            revision: doc.revision,
            message: error instanceof Error ? error.message : 'Failed to render this document.'
          })
        })
        .finally(() => {
          inFlight.current.delete(key)
        })
    }
  }, [state.docs])

  // Highlight the raw source lazily, only for tabs that ask to see it.
  useEffect(() => {
    for (const doc of state.docs) {
      if (!doc.showSource || doc.sourceRevision === doc.revision) continue
      const key = `source:${doc.path}@${doc.revision}`
      if (inFlight.current.has(key)) continue
      inFlight.current.add(key)

      renderSource(doc.content)
        .then((tree) => {
          dispatch({ type: 'source-rendered', path: doc.path, revision: doc.revision, tree })
        })
        .catch(() => {
          /* The highlighted source is a nicety; failing silently is fine. */
        })
        .finally(() => {
          inFlight.current.delete(key)
        })
    }
  }, [state.docs])

  // Keep the main-process file watchers in step with the open tabs.
  useEffect(() => {
    const open = new Set(state.docs.map((doc) => doc.path))
    for (const path of open) {
      if (watched.current.has(path)) continue
      watched.current.add(path)
      void window.marrow.watch(path)
    }
    for (const path of [...watched.current]) {
      if (open.has(path)) continue
      watched.current.delete(path)
      void window.marrow.unwatch(path)
    }
  }, [state.docs])

  const openFile = useCallback((file: OpenedFile) => {
    dispatch({ type: 'open', file })
  }, [])

  const fileChanged = useCallback((payload: FileChangedPayload) => {
    dispatch({ type: 'changed', payload })
  }, [])

  const close = useCallback((path: string) => {
    dispatch({ type: 'close', path })
  }, [])

  const activate = useCallback((path: string) => {
    dispatch({ type: 'activate', path })
  }, [])

  const cycle = useCallback((delta: number) => {
    dispatch({ type: 'cycle', delta })
  }, [])

  // Both of these resolve "the active document" inside the reducer rather than
  // reading it during render, so no ref is needed to keep them stable.
  const closeActive = useCallback(() => {
    dispatch({ type: 'close-active' })
  }, [])

  const toggleSource = useCallback((path?: string) => {
    dispatch(path === undefined ? { type: 'toggle-source' } : { type: 'toggle-source', path })
  }, [])

  const pdfLoaded = useCallback((path: string, revision: number, info: PdfInfo) => {
    dispatch({ type: 'pdf-loaded', path, revision, info })
  }, [])

  const pdfFailed = useCallback((path: string, revision: number, message: string) => {
    dispatch({ type: 'failed', path, revision, message })
  }, [])

  return {
    docs: state.docs,
    active,
    activePath: state.activePath,
    openFile,
    fileChanged,
    close,
    closeActive,
    activate,
    cycle,
    toggleSource,
    pdfLoaded,
    pdfFailed
  }
}
