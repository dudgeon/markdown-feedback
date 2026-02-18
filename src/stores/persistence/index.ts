import { createWebPersistence } from './web'
import { createVSCodePersistence } from './vscode'
import type { PlatformAdapter } from './types'

export type { PlatformAdapter, PlatformCapabilities, SavedSession } from './types'
// Backward-compat alias — prefer PlatformAdapter in new code
export type { PersistenceAdapter } from './types'

export function createPersistence(): PlatformAdapter {
  // VS Code WebView: acquireVsCodeApi is injected by the extension host
  if (typeof (globalThis as Record<string, unknown>)['acquireVsCodeApi'] !== 'undefined') {
    return createVSCodePersistence()
  }

  // Tauri native app: window.__TAURI__ is set by the Tauri runtime
  // if (typeof window !== 'undefined' && '__TAURI__' in window) {
  //   const { createTauriPersistence } = await import('./tauri')
  //   return createTauriPersistence()
  // }

  return createWebPersistence()
}
