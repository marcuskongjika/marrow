import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, resolve, sep } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * pdf.js loads its standard fonts, CMaps, ICC profiles and wasm decoders by URL
 * at runtime. Serve them from `/pdfjs/` in development and copy them next to
 * the renderer bundle in a build, so they stay on the app origin under the CSP.
 */
const PDFJS_ROOT = resolve(__dirname, 'node_modules/pdfjs-dist')
const PDFJS_DIRS = ['standard_fonts', 'cmaps', 'iccs', 'wasm']

function pdfjsAssets(): Plugin {
  let outDir = ''
  return {
    name: 'marrow-pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (request, response, next) => {
        const pathname = decodeURIComponent((request.url ?? '').split('?')[0] ?? '')
        const target = normalize(join(PDFJS_ROOT, pathname))
        const allowed = PDFJS_DIRS.some((dir) => target.startsWith(join(PDFJS_ROOT, dir) + sep))
        if (!allowed || !existsSync(target) || !statSync(target).isFile()) {
          next()
          return
        }
        if (target.endsWith('.wasm')) response.setHeader('content-type', 'application/wasm')
        createReadStream(target).pipe(response)
      })
    },
    writeBundle() {
      for (const dir of PDFJS_DIRS) {
        cpSync(join(PDFJS_ROOT, dir), join(outDir, 'pdfjs', dir), { recursive: true })
      }
    }
  }
}

export default defineConfig({
  main: {
    // Everything lives in devDependencies and is bundled into the output, so the
    // packaged app ships no node_modules at all. chokidar 5 is ESM-only, which
    // rollup happily inlines into the CommonJS main bundle.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // The renderer is served over the custom `marrow://` scheme in production
    // (not file://), so absolute asset paths are correct and CSP `'self'` works.
    base: '/',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react(), pdfjsAssets()],
    build: {
      target: 'chrome132',
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
        output: {
          manualChunks: {
            mermaid: ['mermaid'],
            shiki: ['shiki'],
            pdfjs: ['pdfjs-dist'],
            markdown: ['unified', 'remark-parse', 'remark-gfm', 'remark-rehype', 'rehype-katex']
          }
        }
      }
    }
  }
})
