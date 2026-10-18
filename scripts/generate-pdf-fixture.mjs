// Writes fixtures/sample.pdf: a small, hand-assembled PDF used by the e2e tests.
//
// Three pages of text in the non-embedded standard Helvetica font (which
// exercises pdf.js's standard-font loading), plus a two-entry outline so the
// sidebar has bookmarks to show. Run with `node scripts/generate-pdf-fixture.mjs`.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pages = [
  ['Marrow PDF fixture', 'Page one introduces the bone reader.'],
  ['Chapter Two', 'The marrow of the matter lives on page two.'],
  ['Appendix', 'Page three closes the fixture. Marrow reads PDFs.']
]

const objects = []
const add = (body) => {
  objects.push(body)
  return objects.length
}

const catalog = add(null)
const pagesNode = add(null)
const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
const outlines = add(null)

const pageIds = pages.map(([heading, line]) => {
  const stream = [
    'BT /F1 28 Tf 72 700 Td',
    `(${heading}) Tj`,
    '/F1 14 Tf 0 -40 Td',
    `(${line}) Tj`,
    'ET'
  ].join('\n')
  const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  return add(
    `<< /Type /Page /Parent ${pagesNode} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`
  )
})

const bookmarks = [
  ['Introduction', pageIds[0]],
  ['Chapter Two', pageIds[1]]
]
const bookmarkIds = bookmarks.map(() => add(null))
bookmarks.forEach(([title, page], index) => {
  const prev = index > 0 ? ` /Prev ${bookmarkIds[index - 1]} 0 R` : ''
  const next = index < bookmarks.length - 1 ? ` /Next ${bookmarkIds[index + 1]} 0 R` : ''
  objects[bookmarkIds[index] - 1] =
    `<< /Title (${title}) /Parent ${outlines} 0 R /Dest [${page} 0 R /Fit]${prev}${next} >>`
})

objects[catalog - 1] =
  `<< /Type /Catalog /Pages ${pagesNode} 0 R /Outlines ${outlines} 0 R /PageMode /UseOutlines >>`
objects[pagesNode - 1] =
  `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
objects[outlines - 1] =
  `<< /Type /Outlines /First ${bookmarkIds[0]} 0 R /Last ${bookmarkIds.at(-1)} 0 R ` +
  `/Count ${bookmarkIds.length} >>`
const info = add('<< /Title (Marrow PDF Fixture) /Producer (marrow scripts) >>')

let pdf = '%PDF-1.7\n'
const offsets = objects.map((body, index) => {
  const offset = pdf.length
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  return offset
})
const xref = pdf.length
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\n`
pdf += `startxref\n${xref}\n%%EOF\n`

const target = resolve(import.meta.dirname, '..', 'fixtures', 'sample.pdf')
writeFileSync(target, pdf, 'latin1')
console.log(`Wrote ${target} (${pdf.length} bytes)`)
