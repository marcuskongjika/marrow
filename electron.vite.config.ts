import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
    plugins: [react()],
    build: {
      target: 'chrome132',
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
        output: {
          manualChunks: {
            mermaid: ['mermaid'],
            shiki: ['shiki'],
            markdown: ['unified', 'remark-parse', 'remark-gfm', 'remark-rehype', 'rehype-katex']
          }
        }
      }
    }
  }
})
