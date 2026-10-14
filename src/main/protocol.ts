import { app, net, protocol, session } from 'electron'
import { extname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_SCHEME, LOCAL_FILE_HOST, LOCAL_FILE_SCHEME, decodePathToken } from '../shared/token'
import { isPathGranted } from './fileAccess'

/**
 * Two custom schemes, both registered as standard + secure:
 *
 * `marrow://app/...`   serves the built renderer. Using a real scheme instead of
 *                      `file://` gives the page a proper origin, which is what
 *                      makes `'self'` in the CSP meaningful.
 * `marrow-file://local/<token>`
 *                      serves local assets (images) referenced by the open
 *                      document, after checking the decoded path against the
 *                      roots the user has actually opened.
 *
 * `webSecurity` is never disabled.
 */

export const APP_ORIGIN = `${APP_SCHEME}://app`
export const APP_INDEX_URL = `${APP_ORIGIN}/index.html`

const MIME_TYPES = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg']
])

/** Media the document protocol is allowed to serve. Markdown goes through IPC. */
const SERVABLE_ASSETS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.ico',
  '.svg',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg'
])

function mimeFor(filePath: string): string {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream'
}

/**
 * Production CSP. `style-src` needs `'unsafe-inline'` because Mermaid injects a
 * `<style>` element into every diagram it renders, and Shiki/KaTeX set inline
 * `style` attributes. Scripts stay locked to the app origin, and `eval` is never
 * allowed - Shiki runs on its JavaScript RegExp engine so no wasm is needed.
 */
const PROD_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${LOCAL_FILE_SCHEME}:`,
  `media-src 'self' ${LOCAL_FILE_SCHEME}:`,
  "font-src 'self' data:",
  `connect-src 'self' ${LOCAL_FILE_SCHEME}:`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'"
].join('; ')

/**
 * Dev CSP. Vite's React plugin injects an inline module preamble, so
 * `'unsafe-inline'` is required for scripts here - but `'unsafe-eval'` still is
 * not, which keeps Electron's own CSP security check satisfied.
 */
const DEV_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${LOCAL_FILE_SCHEME}:`,
  `media-src 'self' ${LOCAL_FILE_SCHEME}:`,
  "font-src 'self' data:",
  `connect-src 'self' ws: wss: ${LOCAL_FILE_SCHEME}:`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'"
].join('; ')

/** Must run before `app.whenReady()`. */
export function registerSchemesAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true
      }
    },
    {
      scheme: LOCAL_FILE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // The renderer lives on `marrow://app`, so every asset request is
        // cross-origin and Chromium requires CORS to be enabled on the scheme.
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

function forbidden(message: string): Response {
  return new Response(message, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  })
}

export function registerProtocolHandlers(rendererRoot: string): void {
  const root = normalize(rendererRoot)

  protocol.handle(APP_SCHEME, async (request) => {
    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname)
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    if (pathname === '' || pathname === '/') pathname = '/index.html'

    const target = normalize(join(root, pathname))
    if (target !== root && !target.startsWith(root.endsWith(sep) ? root : root + sep)) {
      return forbidden('Outside app root')
    }

    try {
      const response = await net.fetch(pathToFileURL(target).toString(), {
        bypassCustomProtocolHandlers: true
      })
      if (!response.ok) return new Response('Not found', { status: 404 })
      return new Response(response.body, {
        status: 200,
        headers: {
          'content-type': mimeFor(target),
          'content-security-policy': PROD_CSP,
          'x-content-type-options': 'nosniff'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  protocol.handle(LOCAL_FILE_SCHEME, async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    if (url.hostname !== LOCAL_FILE_HOST) return forbidden('Unknown host')

    const token = url.pathname.replace(/^\/+/, '')
    const filePath = decodePathToken(token)
    if (!filePath) return new Response('Bad token', { status: 400 })

    if (!SERVABLE_ASSETS.has(extname(filePath).toLowerCase())) {
      return forbidden('Unsupported asset type')
    }
    if (!isPathGranted(filePath)) {
      return forbidden('Path is outside the opened document folders')
    }

    try {
      const response = await net.fetch(pathToFileURL(filePath).toString(), {
        bypassCustomProtocolHandlers: true
      })
      if (!response.ok) return new Response('Not found', { status: 404 })
      return new Response(response.body, {
        status: 200,
        headers: {
          'content-type': mimeFor(filePath),
          'content-security-policy': "default-src 'none'; sandbox",
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-cache',
          // Only Marrow's own renderers can address this scheme at all, and the
          // path has already been checked against the granted roots.
          'access-control-allow-origin': '*'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/**
 * The dev server's responses come from Vite, so the CSP is attached here.
 * Also hardens the session: no permission requests are granted, ever.
 */
export function hardenSession(): void {
  const defaultSession = session.defaultSession
  const csp = app.isPackaged ? PROD_CSP : DEV_CSP

  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      callback({})
      return
    }
    const headers = { ...details.responseHeaders }
    delete headers['content-security-policy']
    delete headers['Content-Security-Policy']
    callback({
      responseHeaders: { ...headers, 'Content-Security-Policy': [csp] }
    })
  })

  defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
  defaultSession.setPermissionCheckHandler(() => false)
}
