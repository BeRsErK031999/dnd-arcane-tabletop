/// <reference types="vite/client" />

import type { DesktopApi } from '../preload/types'

declare global {
  interface Window {
    arcaneTabletop?: DesktopApi
  }
}
