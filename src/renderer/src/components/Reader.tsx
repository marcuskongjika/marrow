import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type JSX,
  type MouseEvent,
  type RefObject
} from 'react'
import type { Root } from 'hast'
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { CODE_TAG, MERMAID_TAG } from '@shared/markdown'
import { recallScroll, rememberScroll } from '../lib/scrollMemory'
import type { DocumentState } from '../state/documents'
import { CodeBlock } from './CodeBlock'
import { MermaidDiagram } from './MermaidDiagram'
import styles from './Reader.module.css'

/** The scrolling document pane. */

const components = {
  [CODE_TAG]: CodeBlock,
  [MERMAID_TAG]: MermaidDiagram
} as unknown as Partial<Components>

function treeToReact(tree: Root): JSX.Element {
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components,
    // The tree is already sanitized by the pipeline.
    ignoreInvalidStyle: true
  }) as JSX.Element
}

export interface ReaderProps {
  doc: DocumentState
  zoom: number
  scrollerRef: RefObject<HTMLDivElement | null>
  articleRef: RefObject<HTMLElement | null>
  pendingHash: string | null
  onHashConsumed: () => void
  onOpenPath: (path: string, hash?: string) => void
  onActiveHeadingChange: (id: string | null) => void
}

export function Reader({
  doc,
  zoom,
  scrollerRef,
  articleRef,
  pendingHash,
  onHashConsumed,
  onOpenPath,
  onActiveHeadingChange
}: ReaderProps): JSX.Element {
  const frame = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)

  const body = useMemo(() => {
    if (doc.showSource && doc.sourceTree) return treeToReact(doc.sourceTree)
    if (doc.render) return treeToReact(doc.render.tree)
    return null
  }, [doc.render, doc.showSource, doc.sourceTree])

  const flash = useCallback((element: HTMLElement) => {
    element.setAttribute('data-marrow-flash', '')
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      element.removeAttribute('data-marrow-flash')
    }, 1500)
  }, [])

  const scrollToId = useCallback(
    (id: string, smooth = true) => {
      const article = articleRef.current
      if (!article) return false
      const escaped = CSS.escape(id)
      const target =
        article.querySelector<HTMLElement>(`#${escaped}`) ??
        article.querySelector<HTMLElement>(`[name="${escaped}"]`)
      if (!target) return false
      target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
      flash(target)
      return true
    },
    [articleRef, flash]
  )

  // Restore the saved offset whenever the document or its rendered tree changes.
  // This is what keeps a live reload from jumping back to the top.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || !body) return
    const saved = recallScroll(doc.path)
    if (Math.abs(scroller.scrollTop - saved) > 1) {
      scroller.scrollTop = saved
    }
  }, [body, doc.path, doc.renderedRevision, scrollerRef])

  // A hash that arrived with a relative link is applied once the tree is in.
  useEffect(() => {
    if (!pendingHash || !body) return
    const id = window.requestAnimationFrame(() => {
      scrollToId(pendingHash, false)
      onHashConsumed()
    })
    return () => {
      window.cancelAnimationFrame(id)
    }
  }, [body, onHashConsumed, pendingHash, scrollToId])

  const updateActiveHeading = useCallback(() => {
    const scroller = scrollerRef.current
    const article = articleRef.current
    if (!scroller || !article) return

    const headings = article.querySelectorAll<HTMLElement>(
      'h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]'
    )
    if (headings.length === 0) {
      onActiveHeadingChange(null)
      return
    }

    const top = scroller.getBoundingClientRect().top + 72
    let current: string | null = headings[0]?.id ?? null
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= top) current = heading.id
      else break
    }
    // At the very bottom, pin to the last heading so the outline never lags.
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8) {
      current = headings[headings.length - 1]?.id ?? current
    }
    onActiveHeadingChange(current)
  }, [articleRef, onActiveHeadingChange, scrollerRef])

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    rememberScroll(doc.path, scroller.scrollTop)
    if (frame.current !== null) return
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null
      updateActiveHeading()
    })
  }, [doc.path, scrollerRef, updateActiveHeading])

  useEffect(() => {
    updateActiveHeading()
  }, [body, updateActiveHeading])

  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    },
    []
  )

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest('a')
      if (!anchor) return

      event.preventDefault()
      const data = anchor.dataset
      const href = anchor.getAttribute('href') ?? ''

      if (data.anchor) {
        scrollToId(data.anchor)
        return
      }
      if (data.localDoc) {
        onOpenPath(data.localDoc, data.hash)
        return
      }
      if (data.localFile) {
        void window.marrow.openLocalFile(data.localFile)
        return
      }
      if (href.startsWith('#')) {
        scrollToId(href.slice(1))
        return
      }
      if (/^(https?|mailto|tel):/i.test(href)) {
        void window.marrow.openExternal(href)
      }
    },
    [onOpenPath, scrollToId]
  )

  return (
    <div
      className={styles.scroller}
      ref={scrollerRef}
      onScroll={handleScroll}
      tabIndex={-1}
      data-testid="reader-scroller"
    >
      <article
        className={`markdown ${styles.article}`}
        ref={articleRef}
        style={{ '--zoom': zoom } as CSSProperties}
        onClick={handleClick}
        data-source-view={doc.showSource ? 'true' : undefined}
      >
        {body}
      </article>
    </div>
  )
}
