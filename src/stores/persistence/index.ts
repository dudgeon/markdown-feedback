import { createWebPersistence } from './web'
import type { PersistenceAdapter } from './types'

export type { PersistenceAdapter, SavedSession } from './types'

export function createPersistence(): PersistenceAdapter {
  // Future: if (window.__TAURI__) return createTauriPersistence()
  return createWebPersistence()
}
