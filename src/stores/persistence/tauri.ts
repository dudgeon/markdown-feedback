/**
 * Tauri platform adapter (Phase 8D — minimal stub).
 *
 * Detected via `'__TAURI__' in window` in persistence/index.ts.
 *
 * Phase 8D: Uses localStorage (identical to web adapter). The adapter exists
 * so the __TAURI__ detection path works. Real Tauri plugin integrations
 * (native file I/O, dialogs) come in Phase 8E.
 */

import type { PlatformAdapter, SavedSession } from './types'
import type { CommentThread } from '../../utils/extractChanges'

const STORAGE_KEY = 'markdown-feedback-session'

export function createTauriPersistence(): PlatformAdapter {
  return {
    async save(markup: string, comments: Record<string, CommentThread[]>) {
      try {
        const session: SavedSession = {
          markup,
          comments,
          savedAt: Date.now(),
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      } catch {
        // Quota exceeded or other storage error
      }
    },

    async load(): Promise<SavedSession | null> {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (
          typeof parsed.markup === 'string' &&
          typeof parsed.savedAt === 'number' &&
          parsed.markup.trim().length > 0
        ) {
          return parsed as SavedSession
        }
        return null
      } catch {
        return null
      }
    },

    async clear() {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore
      }
    },

    // File I/O — deferred to Phase 8E
    openFile: undefined,
    saveFile: undefined,
    getCurrentFilePath: undefined,

    // Platform signals — deferred to Phase 8E
    setDirty: undefined,
    onExternalFileChange: undefined,

    capabilities: {
      nativeFileIO: false,
      canOpenFile: false,
      autoLoad: false,
    },
  }
}
