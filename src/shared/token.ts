/**
 * Local file references travel between renderer and main as base64url tokens
 * inside `marrow-file://` URLs. Encoding sidesteps every awkward character in
 * Windows and POSIX paths (drive colons, spaces, `#`, non-ASCII) and makes it
 * explicit that the renderer never hands main a string it interprets freely.
 */

export const LOCAL_FILE_SCHEME = 'marrow-file'
export const APP_SCHEME = 'marrow'
export const LOCAL_FILE_HOST = 'local'

export function encodePathToken(path: string): string {
  const bytes = new TextEncoder().encode(path)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodePathToken(token: string): string | null {
  if (token === '' || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return decoded === '' ? null : decoded
  } catch {
    return null
  }
}

export function localFileUrl(absolutePath: string): string {
  return LOCAL_FILE_SCHEME + '://' + LOCAL_FILE_HOST + '/' + encodePathToken(absolutePath)
}

/** Pull the absolute path back out of a `marrow-file://local/<token>` URL. */
export function pathFromLocalFileUrl(url: string): string | null {
  const prefix = LOCAL_FILE_SCHEME + '://' + LOCAL_FILE_HOST + '/'
  if (!url.startsWith(prefix)) return null
  const token = url.slice(prefix.length).split(/[?#]/)[0] ?? ''
  return decodePathToken(token)
}
