import { describe, expect, it } from 'vitest'
import {
  basename,
  dirname,
  extname,
  hasScheme,
  isAbsolutePath,
  isExternalHref,
  isInside,
  isMarkdownPath,
  normalizePath,
  pathsEqual,
  resolveFrom,
  splitHref
} from '@shared/paths'

describe('normalizePath', () => {
  it('collapses dot segments on POSIX paths', () => {
    expect(normalizePath('/a/b/../c/./d')).toBe('/a/c/d')
    expect(normalizePath('/a//b///c')).toBe('/a/b/c')
  })

  it('collapses dot segments on Windows paths and keeps the drive root', () => {
    expect(normalizePath('C:\\notes\\sub\\..\\other\\file.md')).toBe('C:\\notes\\other\\file.md')
    expect(normalizePath('C:/notes/./file.md')).toBe('C:\\notes\\file.md')
  })

  it('keeps UNC roots intact', () => {
    expect(normalizePath('\\\\server\\share\\docs\\..\\notes.md')).toBe(
      '\\\\server\\share\\notes.md'
    )
  })

  it('never climbs above an absolute root', () => {
    expect(normalizePath('/../../etc/passwd')).toBe('/etc/passwd')
    expect(normalizePath('C:\\..\\..\\windows')).toBe('C:\\windows')
  })

  it('preserves leading dot-dots on relative paths', () => {
    expect(normalizePath('../../assets/img.png')).toBe('../../assets/img.png')
  })
})

describe('dirname and basename', () => {
  it('handles POSIX paths', () => {
    expect(dirname('/a/b/c.md')).toBe('/a/b')
    expect(dirname('/c.md')).toBe('/')
    expect(basename('/a/b/c.md')).toBe('c.md')
    expect(basename('/a/b/c.md', true)).toBe('c')
  })

  it('handles Windows paths', () => {
    expect(dirname('C:\\notes\\deep\\file.md')).toBe('C:\\notes\\deep')
    expect(dirname('C:\\file.md')).toBe('C:\\')
    expect(basename('C:\\notes\\file.markdown')).toBe('file.markdown')
    expect(basename('C:\\notes\\file.markdown', true)).toBe('file')
  })

  it('reads extensions case-insensitively', () => {
    expect(extname('NOTES.MD')).toBe('.md')
    expect(extname('archive.tar.gz')).toBe('.gz')
    expect(extname('.gitignore')).toBe('')
  })
})

describe('resolveFrom', () => {
  it('resolves against a POSIX directory', () => {
    expect(resolveFrom('/notes/project', './assets/img.png')).toBe('/notes/project/assets/img.png')
    expect(resolveFrom('/notes/project', '../shared/img.png')).toBe('/notes/shared/img.png')
  })

  it('resolves against a Windows directory and keeps backslashes', () => {
    expect(resolveFrom('C:\\notes\\project', './assets/img.png')).toBe(
      'C:\\notes\\project\\assets\\img.png'
    )
    expect(resolveFrom('C:\\notes\\project', '..\\shared\\img.png')).toBe(
      'C:\\notes\\shared\\img.png'
    )
  })

  it('passes absolute inputs straight through', () => {
    expect(resolveFrom('/notes', '/elsewhere/img.png')).toBe('/elsewhere/img.png')
    expect(resolveFrom('/notes', 'C:\\elsewhere\\img.png')).toBe('C:\\elsewhere\\img.png')
  })
})

describe('scheme detection', () => {
  it('does not mistake a drive letter for a scheme', () => {
    expect(hasScheme('C:\\notes\\file.md')).toBe(false)
    expect(hasScheme('C:/notes/file.md')).toBe(false)
  })

  it('detects real schemes', () => {
    expect(hasScheme('https://example.com')).toBe(true)
    expect(hasScheme('mailto:a@b.c')).toBe(true)
    expect(hasScheme('marrow-file://local/abc')).toBe(true)
  })

  it('treats protocol-relative URLs as external', () => {
    expect(isExternalHref('//example.com/x')).toBe(true)
    expect(isExternalHref('./local.md')).toBe(false)
  })
})

describe('path predicates', () => {
  it('recognises absolute paths on both platforms', () => {
    expect(isAbsolutePath('/notes/a.md')).toBe(true)
    expect(isAbsolutePath('C:\\notes\\a.md')).toBe(true)
    expect(isAbsolutePath('C:/notes/a.md')).toBe(true)
    expect(isAbsolutePath('\\\\server\\share\\a.md')).toBe(true)
    expect(isAbsolutePath('./a.md')).toBe(false)
    expect(isAbsolutePath('notes/a.md')).toBe(false)
  })

  it('recognises every markdown extension', () => {
    for (const name of ['a.md', 'a.markdown', 'a.mdown', 'a.mkd', 'A.MD']) {
      expect(isMarkdownPath(name)).toBe(true)
    }
    expect(isMarkdownPath('a.txt')).toBe(false)
    expect(isMarkdownPath('a.mdx')).toBe(false)
  })

  it('compares Windows paths case-insensitively and POSIX paths exactly', () => {
    expect(pathsEqual('C:\\Notes\\A.md', 'c:/notes/a.md')).toBe(true)
    expect(pathsEqual('/notes/a.md', '/notes/A.md')).toBe(false)
  })

  it('detects containment without matching sibling prefixes', () => {
    expect(isInside('/notes', '/notes/a/b.md')).toBe(true)
    expect(isInside('/notes', '/notes')).toBe(true)
    expect(isInside('/notes', '/notes-other/b.md')).toBe(false)
    expect(isInside('C:\\notes', 'c:\\notes\\deep\\b.md')).toBe(true)
    expect(isInside('C:\\notes', 'C:\\notesother\\b.md')).toBe(false)
    expect(isInside('/notes', '/notes/../secret.md')).toBe(false)
  })
})

describe('splitHref', () => {
  it('separates path, query and fragment', () => {
    expect(splitHref('./a.md#heading')).toEqual({ path: './a.md', query: '', hash: '#heading' })
    expect(splitHref('./a.md?v=1#h')).toEqual({ path: './a.md', query: '?v=1', hash: '#h' })
    expect(splitHref('#only-hash')).toEqual({ path: '', query: '', hash: '#only-hash' })
  })
})
