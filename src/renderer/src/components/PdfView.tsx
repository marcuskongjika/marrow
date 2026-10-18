import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type RefObject
} from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist'
import { loadPdfJs, openPdf, pageAnchor, readOutline } from '../lib/pdf'
import { recallScroll, rememberScroll } from '../lib/scrollMemory'
import type { DocumentState, PdfInfo } from '../state/documents'
import styles from './PdfView.module.css'

/**
 * The scrolling pane for a PDF tab.
 *
 * Every page gets a correctly sized shell up front, so the scrollbar, scroll
 * memory and outline jumps are right immediately. Canvases are only painted for
 * pages near the viewport (and released again when they scroll far away), which
 * keeps a 500-page document cheap. Each page also carries a pdf.js text layer:
 * transparent, selectable text positioned over the canvas, which is what makes
 * find, copy and selection work exactly as they do for markdown.
 *
 * The text layer is sized entirely by the `--total-scale-factor` custom
 * property, so it is built once per document and zoom only touches CSS.
 */

/** PDF points are 1/72 in; CSS pixels are 1/96 in. */
const PDF_TO_CSS = 96 / 72

interface PageSize {
  width: number
  height: number
}

interface Loaded {
  task: PDFDocumentLoadingTask
  pdf: PDFDocumentProxy
  revision: number
  sizes: PageSize[]
  info: PdfInfo
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'PasswordException') return 'This PDF is password-protected.'
    if (error.name === 'InvalidPDFException') return 'This file is not a valid PDF.'
    return error.message
  }
  return 'Failed to open this PDF.'
}

interface PdfPageProps {
  pdf: PDFDocumentProxy
  number: number
  size: PageSize
  scale: number
  scrollerRef: RefObject<HTMLDivElement | null>
  onTextReady: (page: number) => void
}

function PdfPage({
  pdf,
  number,
  size,
  scale,
  scrollerRef,
  onTextReady
}: PdfPageProps): JSX.Element {
  const pageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = pageRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((entry) => entry.isIntersecting))
      },
      // Paint a screen ahead in both directions so scrolling rarely sees white.
      { root: scrollerRef.current, rootMargin: '100% 0px' }
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [scrollerRef])

  useEffect(() => {
    const container = textRef.current
    if (!container) return
    let cancelled = false
    let layer: TextLayer | null = null

    void Promise.all([loadPdfJs(), pdf.getPage(number)])
      .then(async ([pdfjs, page]) => {
        if (cancelled) return
        layer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container,
          viewport: page.getViewport({ scale: 1 })
        })
        await layer.render()
      })
      .catch(() => {
        /* A page without extractable text is still a page. */
      })
      .finally(() => {
        if (!cancelled) onTextReady(number)
      })

    return () => {
      cancelled = true
      layer?.cancel()
      container.replaceChildren()
    }
  }, [pdf, number, onTextReady])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!visible) {
      // Give the bitmap back; a page far off-screen costs nothing but its box.
      canvas.width = 0
      canvas.height = 0
      return
    }

    let cancelled = false
    let task: RenderTask | null = null

    void pdf
      .getPage(number)
      .then((page) => {
        if (cancelled) return
        const viewport = page.getViewport({ scale })
        const ratio = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        task = page.render({
          canvas,
          viewport,
          ...(ratio !== 1 ? { transform: [ratio, 0, 0, ratio, 0, 0] } : {})
        })
        return task.promise
      })
      .catch(() => {
        /* Cancelled by a newer render, or a broken page: the blank page stays. */
      })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, number, scale, visible])

  const style = {
    width: `${size.width * scale}px`,
    height: `${size.height * scale}px`,
    '--scale-factor': scale,
    '--total-scale-factor': scale,
    '--user-unit': 1,
    '--scale-round-x': '1px',
    '--scale-round-y': '1px'
  } as CSSProperties

  return (
    <div
      className={styles.page}
      ref={pageRef}
      id={pageAnchor(number)}
      style={style}
      data-page-number={number}
      aria-label={`Page ${number}`}
    >
      <canvas className={styles.canvas} ref={canvasRef} aria-hidden="true" />
      <div className={`textLayer ${styles.textLayer}`} ref={textRef} />
    </div>
  )
}

export interface PdfViewProps {
  doc: DocumentState
  zoom: number
  scrollerRef: RefObject<HTMLDivElement | null>
  articleRef: RefObject<HTMLElement | null>
  onLoaded: (path: string, revision: number, info: PdfInfo) => void
  onFailed: (path: string, revision: number, message: string) => void
  onActiveHeadingChange: (id: string | null) => void
}

export function PdfView({
  doc,
  zoom,
  scrollerRef,
  articleRef,
  onLoaded,
  onFailed,
  onActiveHeadingChange
}: PdfViewProps): JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const textReady = useRef(new Set<number>())
  const frame = useRef<number | null>(null)
  const scrollRatio = useRef<number | null>(null)
  const scale = zoom * PDF_TO_CSS
  const { path, revision } = doc

  // Load (and on live reload, re-load) the document. The previous document
  // stays on screen until its replacement is ready, so a reload never flashes.
  useEffect(() => {
    let cancelled = false
    let handedOff = false
    let task: PDFDocumentLoadingTask | null = null

    void (async () => {
      try {
        task = await openPdf(path)
        if (cancelled) return
        const pdf = await task.promise
        const sizes: PageSize[] = []
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number)
          const { width, height } = page.getViewport({ scale: 1 })
          sizes.push({ width, height })
          if (cancelled) return
        }
        const [outline, metadata] = await Promise.all([
          readOutline(pdf),
          pdf.getMetadata().catch(() => null)
        ])
        if (cancelled) return
        const rawTitle = (metadata?.info as { Title?: unknown } | undefined)?.Title
        const title =
          typeof rawTitle === 'string' && rawTitle.trim() !== '' ? rawTitle.trim() : null
        handedOff = true
        textReady.current = new Set()
        setLoaded({
          task,
          pdf,
          revision,
          sizes,
          info: { pageCount: pdf.numPages, title, toc: outline.toc, outlinePages: outline.pages }
        })
      } catch (error) {
        if (!cancelled) onFailed(path, revision, errorMessage(error))
      }
    })()

    return () => {
      cancelled = true
      if (!handedOff) void task?.destroy()
    }
  }, [path, revision, onFailed])

  // A loaded document is released when it is replaced or the tab closes.
  useEffect(() => {
    if (!loaded) return
    return () => {
      void loaded.task.destroy()
    }
  }, [loaded])

  // The document counts as rendered once every page's text is in the DOM, which
  // is the moment find can see all of it.
  const handleTextReady = useCallback(
    (page: number) => {
      if (!loaded) return
      textReady.current.add(page)
      if (textReady.current.size === loaded.sizes.length) {
        onLoaded(path, loaded.revision, loaded.info)
      }
    },
    [loaded, onLoaded, path]
  )

  useEffect(() => {
    // A PDF with no pages has nothing to wait for.
    if (loaded && loaded.sizes.length === 0) onLoaded(path, loaded.revision, loaded.info)
  }, [loaded, onLoaded, path])

  // Restore the remembered offset when a document first appears.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || !loaded) return
    scroller.scrollTop = recallScroll(path)
    // The loaded document is the trigger; scroll memory is read only then.
  }, [loaded, path, scrollerRef])

  // Keep the same spot in view across a zoom change.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const ratio = scrollRatio.current
    if (!scroller || ratio === null) return
    scroller.scrollTop = ratio * scroller.scrollHeight
  }, [scale, scrollerRef])

  const updateActiveEntry = useCallback(() => {
    const scroller = scrollerRef.current
    const article = articleRef.current
    if (!scroller || !article || !loaded) return

    const probe = scroller.scrollTop + scroller.clientHeight / 3
    const pages = article.children
    let low = 0
    let high = pages.length - 1
    let current = 1
    while (low <= high) {
      const middle = (low + high) >> 1
      const page = pages[middle] as HTMLElement | undefined
      if (!page) break
      if (page.offsetTop <= probe) {
        current = middle + 1
        low = middle + 1
      } else {
        high = middle - 1
      }
    }

    let active: string | null = null
    let best = 0
    for (const entry of loaded.info.toc) {
      const page = loaded.info.outlinePages[entry.id] ?? 0
      if (page <= current && page >= best) {
        best = page
        active = entry.id
      }
    }
    onActiveHeadingChange(active)
  }, [articleRef, loaded, onActiveHeadingChange, scrollerRef])

  useEffect(() => {
    updateActiveEntry()
  }, [updateActiveEntry])

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    rememberScroll(path, scroller.scrollTop)
    scrollRatio.current = scroller.scrollHeight > 0 ? scroller.scrollTop / scroller.scrollHeight : 0
    if (frame.current !== null) return
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null
      updateActiveEntry()
    })
  }, [path, scrollerRef, updateActiveEntry])

  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current)
    },
    []
  )

  return (
    <div
      className={styles.scroller}
      ref={scrollerRef}
      onScroll={handleScroll}
      tabIndex={-1}
      data-testid="reader-scroller"
    >
      <article className={styles.pages} ref={articleRef} data-testid="pdf-pages">
        {loaded?.sizes.map((size, index) => (
          <PdfPage
            key={index}
            pdf={loaded.pdf}
            number={index + 1}
            size={size}
            scale={scale}
            scrollerRef={scrollerRef}
            onTextReady={handleTextReady}
          />
        ))}
      </article>
    </div>
  )
}
