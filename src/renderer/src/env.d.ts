/// <reference types="vite/client" />

import type { MarrowApi } from '../../preload/index'

declare global {
  interface Window {
    /** The only bridge to the main process, installed by the preload script. */
    readonly marrow: MarrowApi
  }
}
