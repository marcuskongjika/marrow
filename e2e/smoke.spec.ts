import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'

/**
 * Electron smoke tests.
 *
 * Each test launches its own app instance with a throwaway `--user-data-dir`, so
 * persisted settings, recent files and the single-instance lock never leak
 * between runs. Console output is captured and asserted on: Electron's own
 * security warnings land there, which makes "no security warnings" testable
 * rather than something to eyeball.
 */

const MAIN = resolve(__dirname, '..', 'out', 'main', 'index.js')
const FIXTURES = resolve(__dirname, '..', 'fixtures')

interface Launched {
  app: ElectronApplication
  page: Page
  messages: { type: string; text: string }[]
}

/** Console noise that says nothing about the app's health. */
const IGNORED_CONSOLE = [
  /Autofill\.(enable|setAddresses)/i,
  /Request Autofill/i,
  /DevTools/i,
  /Download the React DevTools/i,
  /GPU stall/i,
  /\[vite\]/i
]

async function launch(files: string[] = []): Promise<Launched> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'marrow-e2e-'))
  const app = await electron.launch({
    args: [MAIN, `--user-data-dir=${userDataDir}`, ...files],
    env: {
      ...process.env,
      // Force Electron's security warnings on so the assertion below is real.
      ELECTRON_ENABLE_SECURITY_WARNINGS: 'true',
      MARROW_E2E: '1'
    }
  })

  const page = await app.firstWindow()
  const messages: { type: string; text: string }[] = []
  page.on('console', (message) => {
    messages.push({ type: message.type(), text: message.text() })
  })
  page.on('pageerror', (error) => {
    messages.push({ type: 'pageerror', text: error.message })
  })

  await page.waitForLoadState('domcontentloaded')
  return { app, page, messages }
}

function problems(messages: { type: string; text: string }[]): string[] {
  return messages
    .filter(({ type }) => type === 'error' || type === 'warning' || type === 'pageerror')
    .filter(({ text }) => !IGNORED_CONSOLE.some((pattern) => pattern.test(text)))
    .map(({ type, text }) => `${type}: ${text}`)
}

test('shows the empty state when launched with no document', async () => {
  const { app, page, messages } = await launch()
  try {
    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByTestId('open-file')).toBeVisible()
    await expect(
      page.getByText('or drop a Markdown or PDF file anywhere in this window')
    ).toBeVisible()
    expect(await page.title()).toBe('Marrow')
    expect(problems(messages)).toEqual([])
  } finally {
    await app.close()
  }
})

test('renders the kitchen sink fixture, outline and all rich content', async () => {
  const { app, page, messages } = await launch([join(FIXTURES, 'kitchen-sink.md')])
  try {
    const article = page.locator('article.markdown')

    // Headings and the document title.
    await expect(article.locator('h1#kitchen-sink')).toHaveText(/Kitchen Sink/)
    await expect(page).toHaveTitle(/^Kitchen Sink — Marrow$/)

    // The outline is generated from the headings and highlights a section.
    const toc = page.getByTestId('toc')
    await expect(toc).toBeVisible()
    await expect(toc.getByRole('button', { name: /^Mathematics$/ })).toBeVisible()
    await expect(toc.getByRole('button', { name: /^Diagrams$/ })).toBeVisible()
    expect(await toc.getByRole('button').count()).toBeGreaterThan(10)

    // GFM: tables, task lists, strikethrough, footnotes.
    await expect(article.locator('div.table-scroll table').first()).toBeVisible()
    await expect(article.locator('input[type=checkbox][checked][disabled]').first()).toBeVisible()
    await expect(article.locator('del').first()).toBeVisible()
    await expect(article.locator('section.footnotes')).toBeVisible()
    await expect(article.locator('[data-footnote-ref]').first()).toBeVisible()

    // Shiki: highlighted code with both theme colours and a language label.
    const firstCode = article.locator('pre.shiki').first()
    await expect(firstCode).toBeVisible()
    expect(await firstCode.getAttribute('style')).toContain('--shiki-dark')
    await expect(article.getByText('TypeScript', { exact: true }).first()).toBeVisible()

    // KaTeX: inline and display maths.
    expect(await article.locator('.katex').count()).toBeGreaterThan(3)
    await expect(article.locator('.katex-display').first()).toBeVisible()
    expect(await article.locator('.katex-error').count()).toBe(0)

    // Mermaid: every diagram in the fixture renders to an SVG.
    const diagrams = article.locator('svg[id^="marrow-diagram-"]')
    await expect(diagrams.first()).toBeVisible({ timeout: 30_000 })
    await expect(diagrams).toHaveCount(3)

    // Images are served over the custom protocol and actually decode. They are
    // lazily loaded, so the image has to be on screen before it is checked.
    const image = article.locator('img').first()
    expect(await image.getAttribute('src')).toMatch(/^marrow-file:\/\/local\//)
    await image.scrollIntoViewIfNeeded()
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0)

    // Sanitization: the fixture's <script> and onclick never ran.
    expect(await page.evaluate(() => '__marrowSanitizeEscaped' in window)).toBe(false)
    expect(await article.locator('script').count()).toBe(0)

    // Status bar reports a word count and a reading time.
    const status = page.getByTestId('status-bar')
    await expect(status).toContainText(/words/)
    await expect(status).toContainText(/min read/)

    expect(problems(messages)).toEqual([])
  } finally {
    await app.close()
  }
})

test('find in document counts matches and steps through them', async () => {
  const { app, page } = await launch([join(FIXTURES, 'kitchen-sink.md')])
  try {
    await expect(page.locator('article.markdown h1')).toBeVisible()

    // The find bar is opened from the toolbar button.
    await page.getByTitle('Find in document (Ctrl+F)').click()
    const input = page.getByTestId('find-input')
    await expect(input).toBeFocused()

    await input.fill('marrow')
    const counter = page.getByTestId('find-count')
    await expect(counter).toHaveText(/^1 of \d+$/)
    const total = Number(/of (\d+)/.exec((await counter.textContent()) ?? '')?.[1] ?? '0')
    expect(total).toBeGreaterThan(3)

    await input.press('Enter')
    await expect(counter).toHaveText(`2 of ${total}`)

    await input.press('Shift+Enter')
    await expect(counter).toHaveText(`1 of ${total}`)

    await input.fill('definitely-not-in-this-document')
    await expect(counter).toHaveText('No matches')

    await input.press('Escape')
    await expect(input).toBeHidden()
  } finally {
    await app.close()
  }
})

test('live reload keeps the scroll position', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'marrow-watch-'))
  const file = join(workDir, 'watched.md')
  const body = Array.from({ length: 120 }, (_, index) => `Paragraph number ${index}.`).join('\n\n')
  writeFileSync(file, `# Watched\n\n${body}\n`, 'utf8')

  const { app, page, messages } = await launch([file])
  try {
    const article = page.locator('article.markdown')
    await expect(article.locator('h1')).toHaveText(/Watched/)

    const scroller = page.getByTestId('reader-scroller')
    await scroller.evaluate((node) => {
      node.scrollTo({ top: 900, behavior: 'instant' })
    })
    await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(900)

    // Simulate another editor saving the file.
    writeFileSync(file, `# Watched\n\n${body}\n\nA freshly appended sentence.\n`, 'utf8')

    await expect(article).toContainText('A freshly appended sentence.', { timeout: 20_000 })
    expect(await scroller.evaluate((node) => node.scrollTop)).toBe(900)
    await expect(page.getByTestId('status-bar')).toContainText('Reloaded')

    expect(problems(messages)).toEqual([])
  } finally {
    await app.close()
  }
})

test('renders in both themes and captures screenshots', async () => {
  const { app, page } = await launch([join(FIXTURES, 'kitchen-sink.md')])
  try {
    const article = page.locator('article.markdown')
    await expect(article.locator('svg[id^="marrow-diagram-"]').first()).toBeVisible({
      timeout: 30_000
    })

    for (const theme of ['light', 'dark'] as const) {
      await app.evaluate(({ nativeTheme }, value) => {
        nativeTheme.themeSource = value
      }, theme)

      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(theme)
      // Mermaid re-renders from scratch on a theme change.
      await expect(article.locator('svg[id^="marrow-diagram-"]').first()).toBeVisible()
      await page.screenshot({ path: `test-results/kitchen-sink-${theme}.png`, fullPage: false })
    }
  } finally {
    await app.close()
  }
})

test('opens a relative markdown link in a new tab', async () => {
  const { app, page } = await launch([join(FIXTURES, 'kitchen-sink.md')])
  try {
    const article = page.locator('article.markdown')
    await expect(article.locator('h1')).toBeVisible()

    await article.getByRole('link', { name: 'Relative markdown link' }).click()

    await expect(page.locator('article.markdown h1')).toHaveText(/Linked Document/)
    await expect(page).toHaveTitle(/^Linked Document — Marrow$/)
    expect(await page.getByRole('tab').count()).toBe(2)
  } finally {
    await app.close()
  }
})

test('opens a PDF with pages, outline, find and page count', async () => {
  const { app, page, messages } = await launch([join(FIXTURES, 'sample.pdf')])
  try {
    const pages = page.getByTestId('pdf-pages')
    await expect(pages.locator('[data-page-number]')).toHaveCount(3)
    await expect(page).toHaveTitle(/^Marrow PDF Fixture — Marrow$/)

    // The visible page is actually painted: its canvas holds non-white pixels.
    const firstCanvas = pages.locator('[data-page-number="1"] canvas')
    await expect
      .poll(() =>
        firstCanvas.evaluate((canvas: HTMLCanvasElement) => {
          const context = canvas.getContext('2d')
          if (!context || canvas.width === 0) return 0
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
          let dark = 0
          for (let index = 0; index < data.length; index += 4) {
            if ((data[index] ?? 255) < 128) dark += 1
          }
          return dark
        })
      )
      .toBeGreaterThan(100)

    // The text layer carries the real text, so find works across pages.
    await expect(pages.getByText('Chapter Two', { exact: true })).toBeAttached()
    await page.getByTitle('Find in document (Ctrl+F)').click()
    const input = page.getByTestId('find-input')
    await input.fill('page')
    await expect(page.getByTestId('find-count')).toHaveText('1 of 3')
    await input.press('Escape')

    // Bookmarks feed the sidebar and jump to their page.
    const toc = page.getByTestId('toc')
    await expect(toc.getByRole('button', { name: 'Introduction' })).toBeVisible()
    await toc.getByRole('button', { name: 'Chapter Two' }).click()
    const scroller = page.getByTestId('reader-scroller')
    await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(500)

    await expect(page.getByTestId('status-bar')).toContainText('3 pages')
    expect(problems(messages)).toEqual([])
  } finally {
    await app.close()
  }
})

test('degrades gracefully on a broken diagram, image and equation', async () => {
  const { app, page } = await launch([join(FIXTURES, 'failure-modes.md')])
  try {
    const article = page.locator('article.markdown')

    // A diagram that will not parse reports itself inline, with its source.
    await expect(article.getByText('Diagram could not be rendered')).toBeVisible({
      timeout: 30_000
    })
    await expect(article.getByText('not valid mermaid at all')).toBeVisible()

    // KaTeX reports a bad expression in place instead of throwing.
    await expect(article.locator('.katex-error').first()).toBeVisible()

    // An asset outside the opened folder is refused by the path check.
    const refused = article.locator('img[alt="Refused by the path check"]')
    await expect.poll(() => refused.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(0)

    // And the rest of the document renders as usual.
    await expect(article.locator('h2#after-the-failures')).toBeVisible()
    await expect(article.locator('div.table-scroll table')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('exports a standalone HTML file and a PDF', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'marrow-export-'))
  const htmlPath = join(outDir, 'kitchen-sink.html')
  const pdfPath = join(outDir, 'kitchen-sink.pdf')

  const { app, page, messages } = await launch([join(FIXTURES, 'kitchen-sink.md')])
  try {
    const article = page.locator('article.markdown')
    // Wait for the diagrams, since the export serializes the live DOM.
    await expect(article.locator('svg[id^="marrow-diagram-"]').first()).toBeVisible({
      timeout: 30_000
    })

    // Drive the real menu items, with the save dialog stubbed out.
    const clickExport = async (label: string, target: string): Promise<void> => {
      await app.evaluate(
        ({ dialog, Menu }, { itemLabel, filePath }) => {
          dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath })
          const menu = Menu.getApplicationMenu()
          const file = menu?.items.find((item) => item.label.replace(/&/g, '') === 'File')
          const entry = file?.submenu?.items.find((item) => item.label.startsWith(itemLabel))
          if (!entry) throw new Error(`menu item not found: ${itemLabel}`)
          // Electron types `MenuItem.click` as a bare `Function`.
          const invoke = entry.click as unknown as () => void
          invoke()
        },
        { itemLabel: label, filePath: target }
      )
    }

    await clickExport('Export as HTML', htmlPath)
    await expect.poll(() => existsSync(htmlPath), { timeout: 30_000 }).toBe(true)
    await expect(page.getByText('Exported as HTML')).toBeVisible()

    const html = readFileSync(htmlPath, 'utf8')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Content-Security-Policy')
    // Styles are inlined, not linked.
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).toContain('.markdown')
    // Rendered content came from the live DOM.
    expect(html).toContain('id="kitchen-sink"')
    expect(html).toContain('<svg')
    expect(html).toContain('--shiki-dark')
    expect(html).toContain('class="katex"')
    // Local images became data URIs, and the KaTeX webfont was inlined.
    expect(html).toContain('src="data:image/png;base64,')
    expect(html).toContain('url("data:font/woff2;base64,')
    // No live app URLs are left behind (the fixture mentions the scheme in its
    // prose, so only attribute values are checked).
    expect(html).not.toContain('src="marrow-file:')
    expect(html).not.toContain('url(marrow-file:')
    // The copy buttons are app chrome and should not survive the export.
    expect(html).not.toContain('Copy code')

    await clickExport('Export as PDF', pdfPath)
    await expect.poll(() => existsSync(pdfPath), { timeout: 60_000 }).toBe(true)
    await expect(page.getByText('Exported as PDF')).toBeVisible()

    const pdf = readFileSync(pdfPath)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.byteLength).toBeGreaterThan(20_000)

    expect(problems(messages)).toEqual([])
  } finally {
    await app.close()
  }
})
