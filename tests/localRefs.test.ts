import { describe, expect, it } from 'vitest'
import { toHtml } from 'hast-util-to-html'
import { renderMarkdown } from '@shared/markdown'
import { decodePathToken, encodePathToken, pathFromLocalFileUrl } from '@shared/token'
import { select } from './helpers'

/**
 * Relative reference resolution: the feature that lets a notes folder behave
 * like a small website while the renderer stays sandboxed.
 */

const POSIX_DOC = '/home/ada/notes/project/index.md'
const WINDOWS_DOC = 'C:\\Users\\ada\\notes\\project\\index.md'

async function imageSrc(markdown: string, basePath: string | null): Promise<string | null> {
  const result = await renderMarkdown(markdown, { basePath, highlight: false })
  const image = select(result.tree, 'img')
  const src = image?.properties.src
  return typeof src === 'string' ? src : null
}

async function anchor(markdown: string, basePath: string | null) {
  const result = await renderMarkdown(markdown, { basePath, highlight: false })
  return select(result.tree, 'a')
}

describe('path token codec', () => {
  it('round-trips Windows, POSIX and non-ASCII paths', () => {
    for (const path of [
      'C:\\Users\\ada\\notes\\Übung #1.md',
      '/home/ada/notes/日本語/file.png',
      '\\\\server\\share\\a b c.png'
    ]) {
      expect(decodePathToken(encodePathToken(path))).toBe(path)
    }
  })

  it('produces URL-safe tokens only', () => {
    const token = encodePathToken('C:\\a\\b\\c+d/e?f#g.png')
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('rejects malformed tokens', () => {
    expect(decodePathToken('')).toBeNull()
    expect(decodePathToken('not valid base64!')).toBeNull()
    expect(decodePathToken('////')).toBeNull()
  })
})

describe('image resolution', () => {
  it('resolves a relative image against the document folder on POSIX', async () => {
    const src = await imageSrc('![x](./assets/img.png)', POSIX_DOC)
    expect(src).toMatch(/^marrow-file:\/\/local\//)
    expect(pathFromLocalFileUrl(src ?? '')).toBe('/home/ada/notes/project/assets/img.png')
  })

  it('resolves a parent-relative image on Windows', async () => {
    const src = await imageSrc('![x](../shared/img.png)', WINDOWS_DOC)
    expect(pathFromLocalFileUrl(src ?? '')).toBe('C:\\Users\\ada\\notes\\shared\\img.png')
  })

  it('percent-decodes the reference before resolving', async () => {
    const src = await imageSrc('![x](./my%20folder/a%20b.png)', POSIX_DOC)
    expect(pathFromLocalFileUrl(src ?? '')).toBe('/home/ada/notes/project/my folder/a b.png')
  })

  it('resolves an absolute local path', async () => {
    const src = await imageSrc('![x](/var/img.png)', POSIX_DOC)
    expect(pathFromLocalFileUrl(src ?? '')).toBe('/var/img.png')
  })

  it('converts file:// URLs to the custom protocol', async () => {
    const src = await imageSrc('![x](file:///home/ada/img.png)', POSIX_DOC)
    expect(pathFromLocalFileUrl(src ?? '')).toBe('/home/ada/img.png')
  })

  it('leaves remote and data URLs untouched', async () => {
    expect(await imageSrc('![x](https://example.com/a.png)', POSIX_DOC)).toBe(
      'https://example.com/a.png'
    )
    expect(await imageSrc('![x](data:image/gif;base64,AAA)', POSIX_DOC)).toBe(
      'data:image/gif;base64,AAA'
    )
  })

  it('leaves relative images alone when there is no document path', async () => {
    expect(await imageSrc('![x](./a.png)', null)).toBe('./a.png')
  })

  it('marks images as lazily loaded', async () => {
    const result = await renderMarkdown('![x](./a.png)', { basePath: POSIX_DOC, highlight: false })
    expect(select(result.tree, 'img')?.properties.loading).toBe('lazy')
  })
})

describe('link resolution', () => {
  it('tags relative markdown links with their resolved path', async () => {
    const link = await anchor('[x](./other.md)', POSIX_DOC)
    expect(link?.properties.dataLocalMd).toBe('/home/ada/notes/project/other.md')
    expect(link?.properties.dataLocalFile).toBeUndefined()
  })

  it('keeps the fragment of a relative markdown link separate', async () => {
    const link = await anchor('[x](../index.md#deep-section)', WINDOWS_DOC)
    expect(link?.properties.dataLocalMd).toBe('C:\\Users\\ada\\notes\\index.md')
    expect(link?.properties.dataHash).toBe('deep-section')
  })

  it('recognises every markdown extension as openable', async () => {
    for (const name of ['a.md', 'a.markdown', 'a.mdown', 'a.mkd']) {
      const link = await anchor(`[x](./${name})`, POSIX_DOC)
      expect(link?.properties.dataLocalMd).toBe(`/home/ada/notes/project/${name}`)
    }
  })

  it('tags other local files for the OS to handle', async () => {
    const link = await anchor('[x](./report.pdf)', POSIX_DOC)
    expect(link?.properties.dataLocalFile).toBe('/home/ada/notes/project/report.pdf')
    expect(link?.properties.dataLocalMd).toBeUndefined()
  })

  it('marks external links and hardens the rel attribute', async () => {
    const link = await anchor('[x](https://example.com)', POSIX_DOC)
    expect(link?.properties.dataExternal).toBe('true')
    expect(link?.properties.rel).toEqual(['noopener', 'noreferrer'])
    expect(link?.properties.target).toBe('_blank')
  })

  it('marks in-page anchors', async () => {
    const link = await anchor('[x](#some-heading)', POSIX_DOC)
    expect(link?.properties.dataAnchor).toBe('some-heading')
    expect(link?.properties.dataLocalMd).toBeUndefined()
  })

  it('does not resolve links when there is no document path', async () => {
    const link = await anchor('[x](./other.md)', null)
    expect(link?.properties.dataLocalMd).toBeUndefined()
    expect(link?.properties.href).toBe('./other.md')
  })

  it('still sanitizes dangerous schemes before resolution', async () => {
    const result = await renderMarkdown('[x](javascript:alert(1))', {
      basePath: POSIX_DOC,
      highlight: false
    })
    expect(toHtml(result.tree)).not.toContain('javascript:')
  })
})
