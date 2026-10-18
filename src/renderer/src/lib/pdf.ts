import type * as PdfJsModule from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import type { TocEntry } from '@shared/markdown'
import { localFileUrl } from '@shared/token'

/**
 * pdf.js, loaded on first use so markdown-only sessions never pay for it.
 *
 * Everything pdf.js fetches at runtime - the worker, standard fonts, CMaps, ICC
 * profiles and wasm decoders - is served from the app origin (see the
 * `marrow-pdfjs-assets` plugin), and the document itself arrives as bytes over
 * `marrow-file://`, so the CSP needs no new origins.
 */

type PdfJs = typeof PdfJsModule

let loader: Promise<PdfJs> | null = null

export function loadPdfJs(): Promise<PdfJs> {
  loader ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })
  return loader
}

function assetUrl(dir: string): string {
  return new URL(`/pdfjs/${dir}/`, window.location.href).href
}

/** Fetch a PDF the main process has granted and start parsing it. */
export async function openPdf(path: string): Promise<PDFDocumentLoadingTask> {
  const [pdfjs, response] = await Promise.all([loadPdfJs(), fetch(localFileUrl(path))])
  if (!response.ok) throw new Error(`Could not read the PDF (${response.status}).`)
  const data = new Uint8Array(await response.arrayBuffer())
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: assetUrl('standard_fonts'),
    cMapUrl: assetUrl('cmaps'),
    iccUrl: assetUrl('iccs'),
    wasmUrl: assetUrl('wasm'),
    enableXfa: false
  })
}

export interface PdfOutline {
  toc: TocEntry[]
  /** Page number (1-based) for each toc entry, by id. */
  pages: Record<string, number>
}

type OutlineNode = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]

/** Flatten the PDF's bookmarks into sidebar entries that point at pages. */
export async function readOutline(pdf: PDFDocumentProxy): Promise<PdfOutline> {
  const outline: PdfOutline = { toc: [], pages: {} }
  const nodes = (await pdf.getOutline().catch(() => null)) ?? []

  const pageFor = async (node: OutlineNode): Promise<number | null> => {
    try {
      const dest = typeof node.dest === 'string' ? await pdf.getDestination(node.dest) : node.dest
      const ref: unknown = dest?.[0]
      if (ref === undefined || ref === null) return null
      if (typeof ref === 'number') return ref + 1
      return (await pdf.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])) + 1
    } catch {
      return null
    }
  }

  const walk = async (items: OutlineNode[], depth: number): Promise<void> => {
    for (const node of items) {
      const page = await pageFor(node)
      if (page !== null && node.title.trim() !== '') {
        const id = `pdf-outline-${outline.toc.length}`
        outline.toc.push({ id, text: node.title.trim(), depth })
        outline.pages[id] = page
      }
      if (node.items.length > 0) await walk(node.items as OutlineNode[], depth + 1)
    }
  }

  await walk(nodes, 1)
  return outline
}

export function pageAnchor(page: number): string {
  return `pdf-page-${page}`
}
