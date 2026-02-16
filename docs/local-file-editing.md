# Local File Editing — Architecture Decision Record

**Date:** 2026-02-15
**Status:** Research complete, informing native app project
**Context:** Markdown Feedback is a pure client-side web app deployed to markdown-feedback.com. A separate project is building a native macOS/iOS wrapper (converging on Tauri). This document captures what the web app can and cannot do regarding local file access, so the native project knows exactly what gaps it needs to fill.

---

## 1. The Problem

Markdown Feedback currently uses an import/export flow: the user pastes or uploads content, edits it, then downloads the result. There is no concept of "open a file, edit it, save." Users working with local `.md` files must manually re-export after each session.

The question: how much of a native file-editing experience can the web app provide on its own, and what requires a native shell?

---

## 2. Web Platform Capabilities (as of Feb 2026)

### File System Access API

The only web API that allows a page to **write back to the same local file** the user opened.

| Capability | Detail |
|---|---|
| Open file | `showOpenFilePicker()` returns a `FileSystemFileHandle` |
| Save to same file | `handle.createWritable()` overwrites in place, no dialog |
| Save As | `showSaveFilePicker()` prompts a new location |
| Persist handle across sessions | Store in IndexedDB; call `handle.requestPermission()` on reload |
| Persistent permissions (no re-prompt) | Chrome 122+ offers "Allow on every visit" option |
| Drag-and-drop entry | `DataTransferItem.getAsFileSystemHandle()` gives same writable handle |

**Browser support:**

| Browser | Supported |
|---|---|
| Chrome/Edge 86+ | Yes |
| Opera 72+ | Yes |
| Firefox | **No** — Mozilla formally opposes the spec |
| Safari | **No** — WebKit formally opposes the spec |
| All mobile browsers | **No** |

This is not a "not yet implemented" situation. Mozilla and WebKit have filed negative standards positions. There is no credible path to cross-browser support.

### Other Web APIs Evaluated

| Approach | Verdict | Why |
|---|---|---|
| Origin Private File System (OPFS) | **Not applicable** | Files live in opaque browser storage, invisible on disk. Useful for internal caching, not user file editing. |
| PWA `file_handlers` | **Chromium-only add-on** | Lets users double-click `.md` → app opens with writable handle. Requires PWA install. Same browser limitation as File System Access API. |
| Native Messaging + Extension | **Too much friction** | Works cross-browser but requires installing both a browser extension and a native host app. Appropriate for power-user tools (TiddlyWiki uses this), not a lightweight editor. |

---

## 3. Decision: Progressive Enhancement in the Web App

The web app will implement the File System Access API as a **progressive enhancement** for Chrome/Edge users, with the existing import/export flow as the universal fallback.

### What Chrome/Edge users get

- **Open File** button (or drag-and-drop) that acquires a `FileSystemFileHandle`
- **Save** (Cmd+S / Ctrl+S) that silently overwrites the opened file
- **Save As** for writing to a new location
- **Recent Files** list persisted in IndexedDB using stored handles
- File name displayed in the toolbar when a local file is open
- Dirty-state indicator (unsaved changes dot/marker)

### What Firefox/Safari/mobile users get

- The current import/export flow, unchanged
- "Open File" uses `<input type="file">` (read-only; no write-back)
- "Save" triggers a download (browser's save dialog each time)
- No recent files (no persistent handles available)

### Feature detection

```ts
const hasFileSystemAccess = 'showOpenFilePicker' in window;
```

All file-system-access code paths gate on this check. The UI adapts: Chrome users see "Save" (overwrites); Firefox/Safari users see "Download" (exports).

---

## 4. What This Means for the Native App (Tauri)

The web app's File System Access API support covers ~78% of desktop browser users, but with hard limits:

### Gaps the native app fills

| Gap | Web app | Native app (Tauri) |
|---|---|---|
| Firefox/Safari file editing | Download-only export | Full read/write via Rust `fs` |
| Mobile (iOS/macOS) | No file access | Full access via system APIs |
| OS file association (double-click `.md`) | Chrome PWA only | Native file type registration |
| Watching for external changes | Not possible | `fs::watch` / FSEvents |
| iCloud/Finder integration | Not possible | Native file provider / Finder sidebar |
| Cmd+S without permission prompt | Requires initial grant | Always works |
| File path in title bar | Displayed in toolbar | Native window title bar |
| Drag from Finder to dock icon | Not possible | Standard macOS behavior |

### What the native app can reuse from the web app

The web app's architecture is already well-suited as a Tauri frontend:

1. **Single-file HTML build** (`npm run build:single`) — produces a self-contained `index.html` with all JS/CSS inlined. This can be loaded directly as a Tauri webview.
2. **Import/export functions** — `src/utils/exportDocument.ts` already has `exportCriticMarkup()`, `exportClean()`, `exportOriginal()` that return strings. The native shell just needs to write these to disk.
3. **Session persistence** — currently uses localStorage. The native app can either let localStorage work as-is (webview preserves it) or override with file-based persistence via Tauri commands.
4. **No server dependency** — everything runs client-side. No API calls, no auth, no backend to replicate.

### Recommended integration points

The native app should communicate with the web frontend via a thin bridge:

```
Tauri Rust backend                  Web frontend
─────────────────                  ────────────
open_file(path) ──────────────────→ importContent(markup, comments)
                ←──────────────────  exportCriticMarkup() → save_file(path, content)
watch_file(path) ─────────────────→ showExternalChangeDialog()
get_recent_files() ───────────────→ populateRecentFilesMenu()
```

The web app does **not** need to know whether it's running in a browser or Tauri. The native shell calls the same public functions the import modal and export menu already use.

---

## 5. Implementation Scope (Web App)

### New code needed

| Component | Description |
|---|---|
| `src/hooks/useFileHandle.ts` | Manages `FileSystemFileHandle` state, IndexedDB persistence, permission requests |
| `src/utils/fileSystemAccess.ts` | Feature detection, open/save/saveAs wrappers with fallbacks |
| Toolbar changes | "Open File" button, file name display, dirty indicator, Save/Download button that adapts to capability |
| Keyboard shortcut | Cmd+S / Ctrl+S bound to save (overwrite if handle exists, download otherwise) |
| Recent files | IndexedDB store of handles + metadata; dropdown in toolbar or import modal |

### Not in scope for the web app

- File watching (no web API for this)
- Directory-level access / project folders
- Conflict resolution for external edits
- Auto-save to local file (too risky without user intent; auto-save continues to use localStorage)
- Any server-side component

---

## 6. Open Questions

1. **Should the web app auto-detect Tauri and disable its own file handling?** If the native shell provides file commands, the web app's File System Access API code is redundant. Options: (a) Tauri injects a global flag, web app skips its own file UI; (b) web app always shows its file UI, Tauri overrides Cmd+S at the webview level.

2. **File format on save.** Currently `exportCriticMarkup()` produces YAML frontmatter + CriticMarkup body. Should "Save" write this format, or should it write the raw ProseMirror-serialized HTML? The CriticMarkup format is portable and human-readable; the HTML format preserves more internal state. Recommendation: **CriticMarkup** — it's the whole point of the app, and round-trip fidelity is already proven.

3. **Dirty state tracking.** The web app needs to know "has the document changed since last save?" to show an unsaved-changes indicator and warn on close. This requires comparing current editor state against the last-saved snapshot. Simplest approach: store a hash of the last-saved CriticMarkup string and compare on each editor update.
