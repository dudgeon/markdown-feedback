/**
 * VSCode WebView platform adapter.
 *
 * This module is only loaded when running inside a VS Code WebView
 * (detected via `acquireVsCodeApi` global in persistence/index.ts).
 *
 * Content lifecycle:
 *   1. load() is called by checkForRecovery() on mount
 *   2. load() posts 'ready' to the extension host, returns a pending Promise
 *   3. Extension host sends 'loadDocument' → Promise resolves with file content
 *   4. checkForRecovery() auto-imports (capabilities.autoLoad = true, no modal)
 *
 * Save lifecycle:
 *   - save() posts 'documentChanged' on every edit (debounced by caller)
 *   - On Cmd+S, extension host sends 'saveRequested' → Editor.tsx responds
 *     with an immediate save() call (non-debounced)
 */

import type { PlatformAdapter, SavedSession } from './types'

// VS Code API — injected by the WebView runtime. acquireVsCodeApi() may only
// be called once per session; we cache the result.
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

let _api: ReturnType<typeof acquireVsCodeApi> | null = null

function getApi() {
  if (!_api) _api = acquireVsCodeApi()
  return _api
}

export function createVSCodePersistence(): PlatformAdapter {
  return {
    async save(markup: string, comments: Record<string, string>) {
      getApi().postMessage({ type: 'documentChanged', markup, comments })
    },

    async load(): Promise<SavedSession | null> {
      return new Promise((resolve) => {
        const handler = (event: MessageEvent) => {
          const msg = event.data as { type: string; markup?: string; comments?: Record<string, string> }
          if (msg?.type === 'loadDocument') {
            window.removeEventListener('message', handler)
            // Empty file → resolve null so checkForRecovery skips auto-import
            if (!msg.markup || msg.markup.trim() === '') {
              resolve(null)
              return
            }
            resolve({
              markup: msg.markup,
              comments: msg.comments ?? {},
              savedAt: Date.now(),
            })
          }
        }
        window.addEventListener('message', handler)

        // Signal to the extension host that the WebView is ready
        getApi().postMessage({ type: 'ready' })
      })
    },

    async clear() {
      // No-op: VS Code manages document lifecycle; there is no local state to clear
    },

    // File I/O: handled by the extension host, not the WebView
    openFile: undefined,
    saveFile: undefined,
    getCurrentFilePath: undefined,

    // Platform signals: not needed from the WebView side
    setDirty: undefined,
    onExternalFileChange: undefined,

    capabilities: {
      nativeFileIO: true,
      canOpenFile: false, // VS Code opens files itself
      autoLoad: true,     // Skip RecoveryModal; auto-import the file content
    },
  }
}
