import { BrowserWindow, dialog } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { basename } from '../shared/paths'
import type { ExportRequest, ExportResult } from '../shared/types'

/**
 * Export paths.
 *
 * The renderer assembles the complete standalone document (its own stylesheets
 * read back from `document.styleSheets`, fonts and images inlined as data URIs,
 * Mermaid SVGs already in the DOM). Main only decides where it lands - and, for
 * PDF, renders it in a throwaway window with JavaScript disabled.
 */

function defaultName(request: ExportRequest, extension: string): string {
  const base = request.sourcePath
    ? basename(request.sourcePath, true)
    : request.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document'
  return `${base}.${extension}`
}

export async function exportHtml(
  window: BrowserWindow,
  request: ExportRequest
): Promise<ExportResult> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Export as HTML',
    defaultPath: defaultName(request, 'html'),
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  try {
    await writeFile(result.filePath, request.html, 'utf8')
    return { canceled: false, path: result.filePath }
  } catch (error) {
    return { canceled: false, error: error instanceof Error ? error.message : 'Export failed.' }
  }
}

export async function exportPdf(
  window: BrowserWindow,
  request: ExportRequest
): Promise<ExportResult> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Export as PDF',
    defaultPath: defaultName(request, 'pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  let workDir: string | null = null
  let printer: BrowserWindow | null = null

  try {
    workDir = await mkdtemp(join(tmpdir(), 'marrow-export-'))
    const source = join(workDir, 'document.html')
    await writeFile(source, request.html, 'utf8')

    printer = new BrowserWindow({
      show: false,
      webPreferences: {
        // The exported document is pure markup: no scripts need to run, and
        // disabling JavaScript entirely removes the attack surface and keeps the
        // hidden window from emitting renderer warnings of its own.
        javascript: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        offscreen: false
      }
    })

    const loaded = new Promise<void>((resolve, reject) => {
      const contents = printer?.webContents
      if (!contents) {
        reject(new Error('Print window was closed.'))
        return
      }
      contents.once('did-finish-load', () => resolve())
      contents.once('did-fail-load', (_event, code, description) =>
        reject(new Error(`${description} (${code})`))
      )
    })

    await printer.loadFile(source)
    await loaded

    const pdf = await printer.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      preferCSSPageSize: false,
      generateDocumentOutline: true
    })

    await writeFile(result.filePath, pdf)
    return { canceled: false, path: result.filePath }
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : 'PDF export failed.'
    }
  } finally {
    if (printer && !printer.isDestroyed()) printer.destroy()
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
