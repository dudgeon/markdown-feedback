import type { CommentThread } from '../../utils/extractChanges'

export interface SavedSession {
  markup: string
  comments: Record<string, CommentThread[]>
  savedAt: number
}

export interface PlatformCapabilities {
  /** Can open/save files natively (Tauri, VSCode). Drives File menu visibility. */
  nativeFileIO: boolean
  /** Has a native file-open dialog (Tauri only — VSCode opens files itself). */
  canOpenFile: boolean
  /**
   * When true, checkForRecovery() auto-imports the loaded document without
   * showing the RecoveryModal. Used by native targets (VSCode, Tauri) where
   * the "session" is always the open file, not a previous web session.
   */
  autoLoad: boolean
}

export interface PlatformAdapter {
  // ── Session persistence (all platforms) ────────────────────────────────────
  save(markup: string, comments: Record<string, CommentThread[]>): Promise<void>
  load(): Promise<SavedSession | null>
  clear(): Promise<void>

  // ── File I/O (optional — native targets only) ───────────────────────────────
  /** Open a file picker and return the selected file's path and content. */
  openFile?(): Promise<{ path: string; content: string } | null>
  /** Write content to a file path on disk. */
  saveFile?(path: string, content: string): Promise<void>
  /** Return the currently open file path, or null if no file is open. */
  getCurrentFilePath?(): string | null

  // ── Platform signals (optional — native targets only) ──────────────────────
  /** Notify the platform that the document has unsaved changes. */
  setDirty?(isDirty: boolean): void
  /**
   * Register a callback to be called when the open file is modified externally.
   * Returns an unsubscribe function.
   */
  onExternalFileChange?(callback: (content: string) => void): () => void

  // ── Capabilities (all platforms) ────────────────────────────────────────────
  /** Drives conditional UI — feature-flag native file controls. */
  capabilities: PlatformCapabilities
}

/** @deprecated Use PlatformAdapter */
export type PersistenceAdapter = PlatformAdapter
