# Markdown Feedback — VSCode Extension

**Status:** Phase 9A+B complete (file mode A + sidecar mode). Next: pre-built `.vsix` release asset, Marketplace listing.
**Author:** Geoff + Claude
**Date:** 2026-02-17

---

## 0. Setup & Testing

> **Current state (Phase 9A):** Installation requires cloning the repo and running a few terminal commands. A zero-terminal path (VS Code Marketplace or pre-built `.vsix` release asset) is planned. These instructions will be updated as setup improves.

### Developer testing (F5 in VS Code)

Use this workflow when iterating on the extension itself.

**Prerequisites:** Node 20+, VS Code

```bash
# 1. Install root dependencies (React app + build tools)
npm install

# 2. Install extension-specific dependencies (@types/vscode, vsce)
npm run setup:vscode

# 3. Build both the WebView bundle and the extension host
npm run build:vscode
```

Then, with this repo open as your VS Code workspace:

4. Press **F5** — VS Code opens a second window (the Extension Development Host) with the extension loaded
5. In the new window, open any `.md` file
6. Right-click the file's tab → **"Open With…"** → **"Markdown Feedback Editor"**
7. The track-changes editor loads in place of the default text editor
8. Make edits, press **Cmd+S** — the file on disk updates with CriticMarkup notation

**Iterating on the extension host** (changes to `extension/src/`): press F5 again — the pre-launch task rebuilds the host in ~8ms before each launch.

**Iterating on the React UI** (changes to `src/`): run `npm run build:vscode:webview` manually (~1–2s), then press F5.

### User installation (.vsix)

Use this to install the extension in your regular VS Code (not just the dev host).

```bash
npm install
npm run setup:vscode
npm run package:vscode    # produces extension/markdown-feedback-0.1.0.vsix
```

Then in VS Code: **Cmd+Shift+P** → "Extensions: Install from VSIX…" → select the `.vsix` file.

After installation, the extension activates automatically. Open any `.md` file and choose "Open With → Markdown Feedback Editor" as described above.

### First-time "Open With" experience

VS Code's "Open With" prompt appears when you right-click the tab of an open file (or the file in the Explorer sidebar). The Markdown Feedback Editor will appear as an option because the extension registered as an `"option"` priority editor for `*.md` files — it does not hijack the default editor.

To make Markdown Feedback the default for `.md` files in a specific project, add this to your workspace `.vscode/settings.json`:
```json
{
  "workbench.editorAssociations": {
    "*.md": "markdownFeedback.editor"
  }
}
```

### Known limitations (Phase 9A)

- **Cmd+Shift+T conflict**: VS Code intercepts this shortcut (reopens a closed editor tab) before it reaches the WebView. The track-changes toggle (`Cmd+Shift+T` in the web app) does not work inside VS Code. Use the toolbar toggle pill instead. A remapped shortcut is planned.
- **"Open With" is not automatic**: VS Code does not prompt on first `.md` open — you must right-click. Making Markdown Feedback the default requires the workspace setting above.
- **Requires building from source**: No Marketplace listing yet. See planned improvements below.

### Planned improvements

| Improvement | Phase |
|---|---|
| Pre-built `.vsix` attached to GitHub releases (no terminal needed) | Next |
| VS Code Marketplace listing (one-click install from Extensions panel) | Post-9B |
| Remap `Cmd+Shift+T` to a VS Code-safe shortcut | Polish |
| Sidecar file mode (clean `.md` + `.criticmark` alongside) | ✓ Done (9B) |

---

## 1. Overview

A VS Code extension that lets users open `.md` files in the Markdown Feedback track-changes editor directly inside VS Code. The extension registers a Custom Text Editor for `.md` files that hosts the existing React/TipTap app in a WebView panel. From the user's perspective: open a markdown file, switch to the Markdown Feedback editor, make tracked edits, save back to disk.

### Goals

- Same track-changes editing experience as the web app, inside VS Code
- No separate app to open; works on files already in the user's workspace
- Changes saved back to the actual `.md` file on disk (no copy/paste workflow)
- Two file modes: CriticMarkup as file content (default), or clean markdown with a sidecar (opt-in)
- Single codebase — the extension packages the existing Vite React bundle unchanged

### Non-goals

- Replacing the default markdown editor (the extension is opt-in per-file)
- Real-time collaboration or multi-cursor
- Markdown preview in the same panel (VS Code's native preview handles this)
- Supporting non-markdown file types

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension Host (Node.js process)                   │
│                                                             │
│  extension.ts                                               │
│  ├── MarkdownFeedbackEditorProvider                         │
│  │   ├── resolveCustomTextEditor(document, webviewPanel)    │
│  │   ├── reads/writes VS Code TextDocument                  │
│  │   └── postMessage bridge ◄──────────────────────────┐   │
│  └── registers commands, settings, status bar           │   │
│                                                         │   │
└─────────────────────────────────────────────────────────│───┘
                                                          │
                    postMessage protocol                  │
                                                          │
┌─────────────────────────────────────────────────────────│───┐
│  WebView (Electron/Chromium iframe)                     │   │
│                                                         │   │
│  ← existing Vite React bundle (unchanged) →             │   │
│  ├── TipTap editor + TrackChanges extension             │   │
│  ├── Zustand documentStore                              │   │
│  ├── ChangesPanel, Toolbar, etc.                        │   │
│  └── VSCode PlatformAdapter  ───────────────────────────┘   │
│      (replaces localStorage adapter)                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why this works without changing the core app

The existing app already has an abstract `PlatformAdapter` interface (Phase 8C hardening). The VSCode adapter implements the same interface, routing file I/O through `postMessage` to the extension host instead of directly to localStorage or disk. The React app, TipTap editor, and all extension logic are untouched.

---

## 3. Message Protocol

All communication between WebView and extension host uses VS Code's `postMessage` API. Messages are typed objects with a `type` field.

### WebView → Extension Host

| Message | Payload | Description |
|---|---|---|
| `ready` | — | WebView has loaded and is ready to receive content |
| `documentChanged` | `{ markup: string, comments: Record<string, string> }` | Editor state changed; extension host should update the VS Code TextDocument (triggers dirty state) |
| `requestSave` | — | User triggered Cmd+S inside the WebView; extension host should flush current content |

### Extension Host → WebView

| Message | Payload | Description |
|---|---|---|
| `loadDocument` | `{ markup: string, comments: Record<string, string>, filePath: string, fileMode: 'criticmarkup' \| 'sidecar' }` | Send file content to WebView on open (or after external file change) |
| `saveRequested` | — | VS Code Cmd+S was triggered; WebView should emit `documentChanged` with current state |
| `platformCapabilities` | `{ platform: 'vscode', fileMode: 'criticmarkup' \| 'sidecar' }` | Sent immediately before `loadDocument`; WebView adapts UI accordingly |

### Sequencing

```
Extension host                        WebView
     │                                   │
     │   ── WebView created ──────────►  │
     │                                   │  (React app boots)
     │   ◄── ready ──────────────────── │
     │                                   │
     │   ── platformCapabilities ──────► │
     │   ── loadDocument ──────────────► │  (import path: criticMarkupToHTML → setContent)
     │                                   │
     │   ◄── documentChanged ─────────── │  (on every edit, debounced)
     │   (update TextDocument)           │
     │                                   │
     │   ── saveRequested ─────────────► │  (on Cmd+S)
     │   ◄── documentChanged ─────────── │  (immediate, not debounced)
     │   (flush to disk)                 │
```

### Debouncing

`documentChanged` is emitted by the WebView on a 1-second debounce (same as the current auto-save). VS Code shows the file as dirty immediately on the first `documentChanged` after load, but does not write to disk until `saveRequested` is handled. This matches standard VS Code custom editor behavior.

---

## 4. File Modes

The extension supports two modes for how tracked changes relate to the `.md` file on disk.

### Mode A: CriticMarkup as file (default)

The `.md` file IS the CriticMarkup document. The file holds tracked changes inline as CriticMarkup notation — the same format the web app exports.

**On open:**
1. Extension host reads the TextDocument content
2. Sends raw content to WebView via `loadDocument` (markup = file content, comments = `{}`)
3. WebView runs content through the existing import path (`criticMarkupToHTML` → `setContent`)
4. Tracked changes are reconstructed from any existing CriticMarkup tokens in the file

**On save (Cmd+S):**
1. Extension host requests current state via `saveRequested`
2. WebView returns `documentChanged` with current CriticMarkup markup + comments map
3. Extension host writes CriticMarkup string to VS Code TextDocument (triggers file write)

**Tradeoffs:**
- Simple. One file, no sync complexity.
- File is human-readable in any markdown viewer (CriticMarkup tokens visible but don't break rendering)
- Obsidian-compatible (with CriticMarkup plugin)
- Git diff is meaningful
- Collaborators without the extension see CriticMarkup tokens as literal text

### Mode B: Clean markdown + sidecar (opt-in)

The `.md` file holds clean markdown (accept-all view). Tracked changes and comments are stored in a `.criticmark` JSON sidecar alongside the `.md` file.

**Sidecar format** (`{filename}.criticmark`):
```json
{
  "markup": "{~~was delivered~>the team delivered~~}{>>active voice<<}\n\nThe results...",
  "comments": {
    "abc123": "Active voice is more direct",
    "def456": "Repeated point from paragraph 2"
  },
  "savedAt": 1739750400000
}
```

This is identical to the current localStorage format — no new serialization logic needed.

**On open:**
1. Extension host reads the TextDocument (clean markdown)
2. Extension host looks for `{filename}.criticmark` in the same directory
3. If sidecar exists: send `loadDocument` with sidecar's `markup` + `comments`
4. If no sidecar: treat the clean markdown as the starting document (send as markup, no comments)
5. WebView reconstructs tracked changes from the markup

**On save (Cmd+S):**
1. Extension host requests current state
2. WebView returns full CriticMarkup markup + comments
3. Extension host derives clean markdown (accept-all: remove deletions, keep insertions)
4. Extension host writes clean markdown to VS Code TextDocument (`.md` file)
5. Extension host writes full session JSON to `.criticmark` sidecar file

**Tradeoffs:**
- The `.md` file stays clean — renders correctly in any markdown viewer, GitHub, Obsidian
- Two files must travel together (both must be committed to git)
- Renaming the `.md` file does not automatically rename the sidecar
- More complex implementation (two-file sync, derive clean markdown on save)

### Switching modes

Modes are a workspace setting, not a per-file setting. Changing modes mid-session:
- A → B: on next save, write clean `.md` + create `.criticmark` sidecar
- B → A: on next save, write CriticMarkup to `.md`, delete `.criticmark` sidecar (with confirmation prompt)

---

## 5. Platform Adapter (VSCode)

The VSCode adapter implements the `PlatformAdapter` interface (Phase 8C). It is detected at runtime via `typeof acquireVsCodeApi !== 'undefined'`.

```typescript
// src/stores/persistence/vscode.ts
class VSCodePlatformAdapter implements PlatformAdapter {
  private vscode = acquireVsCodeApi()
  private pendingLoad: Promise<SavedSession | null> | null = null
  private resolveLoad: ((s: SavedSession | null) => void) | null = null

  // Called by extension host with loadDocument message
  handleLoadDocument(markup: string, comments: Record<string, string>) {
    this.resolveLoad?.({ markup, comments, savedAt: Date.now() })
  }

  // PersistenceAdapter interface
  async save(markup: string, comments: Record<string, string>) {
    this.vscode.postMessage({ type: 'documentChanged', markup, comments })
  }

  async load(): Promise<SavedSession | null> {
    // Content arrives via loadDocument message; return a Promise
    // that resolves when the message is received
    this.pendingLoad = new Promise(resolve => { this.resolveLoad = resolve })
    return this.pendingLoad
  }

  async clear() {
    // No-op in VSCode context — clearing is handled by the file system
  }

  // File operations (optional fields)
  openFile = undefined       // VS Code handles file opening natively
  saveFile = undefined       // Save is triggered via saveRequested/documentChanged
  getCurrentFilePath = undefined  // Available in loadDocument payload if needed

  setDirty = undefined       // VS Code tracks dirty state via TextDocument changes

  capabilities = {
    nativeFileIO: true,
    canOpenFile: false,    // VS Code opens files, not the adapter
  }
}
```

The adapter is instantiated in `stores/persistence/index.ts`:
```typescript
export function createPersistence(): PlatformAdapter {
  if (typeof acquireVsCodeApi !== 'undefined') return new VSCodePlatformAdapter()
  if (window.__TAURI__) return createTauriPersistence()
  return createWebPersistence()
}
```

---

## 6. Build Pipeline

The extension is a single VS Code `.vsix` package containing:
- The extension host (TypeScript → CommonJS, bundled via esbuild)
- The WebView app (existing Vite React bundle, output to `dist-vscode/`)

### Directory structure

```
extension/                  ← new top-level directory
  package.json              ← VS Code extension manifest
  tsconfig.json             ← extension host TypeScript config
  src/
    extension.ts            ← extension host entry point
    editorProvider.ts       ← CustomTextEditorProvider implementation
    sidecarManager.ts       ← sidecar read/write logic (Phase 9B)
  dist/                     ← esbuild output (gitignored)
    extension.js            ← bundled extension host

src/                        ← existing app source (unchanged)
  stores/persistence/
    vscode.ts               ← new VSCode adapter (only new file in src/)
    index.ts                ← updated factory

dist-vscode/                ← Vite output for WebView (gitignored)
  index.html                ← WebView entry point
  assets/
    ...
```

### Build commands (added to root package.json)

```bash
npm run build:vscode:webview   # Vite build targeting dist-vscode/
npm run build:vscode:host      # esbuild extension/src/extension.ts → extension/dist/
npm run build:vscode           # Both of the above
npm run package:vscode         # vsce package → .vsix file
```

### Vite config for WebView

A new `vite.config.vscode.ts` that differs from the main config only in:
- `base: './'` (relative paths for WebView asset loading)
- `outDir: 'dist-vscode'`
- No `singlefile` plugin

The `acquireVsCodeApi` global is available in the WebView at runtime; no build-time changes needed to detect the VS Code environment.

### WebView Content Security Policy

VS Code WebViews enforce a strict CSP. The extension host must:
- Set `webview.options.localResourceRoots` to the `dist-vscode/` directory
- Convert local file URIs via `webview.asWebviewUri()`
- Serve no external scripts or styles (all assets must be bundled — already the case with the Vite build)

---

## 7. VS Code Manifest (`extension/package.json`)

Key fields:

```json
{
  "name": "markdown-feedback",
  "displayName": "Markdown Feedback",
  "description": "Track-changes editor for markdown. Every edit captured as CriticMarkup.",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Editors"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "customEditors": [
      {
        "viewType": "markdownFeedback.editor",
        "displayName": "Markdown Feedback Editor",
        "selector": [{ "filenamePattern": "*.md" }],
        "priority": "option"
      }
    ],
    "configuration": {
      "title": "Markdown Feedback",
      "properties": {
        "markdownFeedback.fileMode": {
          "type": "string",
          "enum": ["criticmarkup", "sidecar"],
          "enumDescriptions": [
            "Save tracked changes inline in the .md file as CriticMarkup notation (default). File opens normally in any markdown viewer; CriticMarkup tokens are visible.",
            "Save clean markdown to the .md file; store tracked changes in a .criticmark sidecar. The .md file renders cleanly everywhere; both files must travel together."
          ],
          "default": "criticmarkup",
          "description": "How tracked changes are stored relative to the .md file on disk."
        }
      }
    },
    "commands": [
      {
        "command": "markdownFeedback.openWith",
        "title": "Open with Markdown Feedback Editor"
      }
    ]
  }
}
```

**Priority `"option"`** means: don't override the default text/markdown editor. The user must explicitly choose "Open With → Markdown Feedback Editor" (or configure `workbench.editorAssociations` in workspace settings to make it the default for their project).

---

## 8. Extension Host Implementation

### `extension.ts` (entry point)

```typescript
import * as vscode from 'vscode'
import { MarkdownFeedbackEditorProvider } from './editorProvider'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'markdownFeedback.editor',
      new MarkdownFeedbackEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  )
}

export function deactivate() {}
```

`retainContextWhenHidden: true` keeps the WebView alive when the tab is hidden — avoids re-loading the entire TipTap editor state when switching tabs.

### `editorProvider.ts` (CustomTextEditorProvider)

Core responsibilities:
1. **`resolveCustomTextEditor`** — called when VS Code opens a `.md` file with this editor. Sets up the WebView, loads file content, wires up message handlers.
2. **Document change listener** — if the file is modified externally (e.g., `git checkout`), reload the WebView content.
3. **Save handling** — implements `CustomTextEditorProvider` document save via the `documentChanged` message (VS Code calls save on the provider when the user does Cmd+S).

```typescript
// Pseudocode — key logic only
async resolveCustomTextEditor(document, webviewPanel, _token) {
  webviewPanel.webview.options = {
    enableScripts: true,
    localResourceRoots: [this.context.extensionUri]
  }
  webviewPanel.webview.html = this.getWebviewHtml(webviewPanel.webview)

  const fileMode = vscode.workspace.getConfiguration('markdownFeedback').get('fileMode')

  webviewPanel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'ready') {
      const { markup, comments } = await this.loadContent(document, fileMode)
      webviewPanel.webview.postMessage({ type: 'platformCapabilities', platform: 'vscode', fileMode })
      webviewPanel.webview.postMessage({ type: 'loadDocument', markup, comments, filePath: document.uri.fsPath })
    }
    if (msg.type === 'documentChanged') {
      await this.applyEdit(document, fileMode, msg.markup, msg.comments)
    }
  })
}
```

### `loadContent` (reads file for WebView)

- **Mode A:** Read `document.getText()` directly → returns `{ markup: documentText, comments: {} }`
- **Mode B:** Read `document.getText()` as original markdown, read `.criticmark` sidecar if it exists → returns `{ markup: sidecar.markup, comments: sidecar.comments }` or `{ markup: documentText, comments: {} }` if no sidecar

### `applyEdit` (writes WebView state to disk)

- **Mode A:** Create a `WorkspaceEdit` that replaces the entire document text with the incoming markup string. Apply via `vscode.workspace.applyEdit()`. VS Code handles dirty state and file write on save.
- **Mode B:** Derive clean markdown (run `exportClean()` on the markup string), write to document via `WorkspaceEdit`, write sidecar JSON to disk via `vscode.workspace.fs.writeFile()`.

---

## 9. WebView App Changes

Changes to the existing React app are minimal — only the persistence adapter detection and the VSCode adapter implementation.

### New file: `src/stores/persistence/vscode.ts`

Implements `PlatformAdapter` using `acquireVsCodeApi()`. See §5 above.

### Modified: `src/stores/persistence/index.ts`

Add VSCode detection before Tauri detection:
```typescript
if (typeof acquireVsCodeApi !== 'undefined') return new VSCodePlatformAdapter()
```

### No other changes to the core app

- TipTap editor, TrackChanges extension, serializer, parser — untouched
- Zustand store — untouched (already adapter-agnostic after Phase 8C)
- All React components — untouched
- The `load()` call in the store's init sequence waits for the `loadDocument` message; no special handling needed beyond what the adapter provides

### UI adaptations (conditional on capabilities)

After Phase 8C hardening, the Zustand store exposes `capabilities`. The WebView reads `fileMode` from the `platformCapabilities` message and can show a status indicator if desired. The core toolbar (Import, Export, etc.) remains unchanged — these still work in VSCode context (Export downloads a file via `blob:` URL, which Electron supports).

---

## 10. Implementation Phases

### Phase 9A: Custom Editor (file mode A, CriticMarkup as file)

**Deliverables:**
- `extension/` directory with `package.json`, `tsconfig.json`, `src/extension.ts`, `src/editorProvider.ts`
- `vite.config.vscode.ts` targeting `dist-vscode/`
- `src/stores/persistence/vscode.ts` (VSCode adapter)
- Build scripts in root `package.json`
- `.vscodeignore` to exclude non-extension files from `.vsix`

**Acceptance criteria:**
1. Open a `.md` file in VS Code → right-click → "Open With → Markdown Feedback Editor" → editor loads
2. Type in the editor → tracked changes appear as in the web app
3. Cmd+S → file on disk is updated with CriticMarkup notation
4. Close and reopen the file → tracked changes are reconstructed from the file
5. Open the same file with the default VS Code text editor → CriticMarkup tokens are visible as plain text
6. No console errors in either the extension host or the WebView

**Out of scope for 9A:**
- Sidecar mode
- Status bar indicator
- VS Code Marketplace publication

### Phase 9B: File mode toggle (sidecar) ✓ COMPLETE

**Deliverables:**
- `extension/src/sidecarManager.ts` — `readSidecar`, `writeSidecar`, `deleteSidecar`, `acceptAllChanges`
- Workspace setting `markdownFeedback.fileMode` (already in manifest from 9A)
- Status bar item showing active mode (`$(edit) MF: CriticMarkup` / `$(edit) MF: Sidecar`)
- Mode-switch: A→B shows info toast, B→A shows confirmation dialog + optionally deletes sidecar
- Dynamic `fileMode` reading per-operation (responds to setting changes without restart)

**Acceptance criteria:**
1. ✓ Set `markdownFeedback.fileMode: "sidecar"` in workspace settings
2. ✓ Open `.md` file → editor loads original clean markdown with no tracked changes
3. ✓ Make edits → Cmd+S → `.md` file contains clean markdown, `.criticmark` sidecar created alongside
4. ✓ Close and reopen → tracked changes reconstructed from sidecar, `.md` unchanged
5. ✓ Switch back to `"criticmarkup"` → confirmation dialog → sidecar deleted (or kept), `.md` contains CriticMarkup on next save
6. ✓ Status bar shows active mode whenever a Markdown Feedback editor is open

---

## 11. Design Decisions

**Single source tree.** The extension lives in `extension/` within the same repo. No monorepo setup, no separate package. The Vite build for the WebView is just another build target alongside `dist/`, `dist-single/`, and `dist-vscode/`.

**`CustomTextEditorProvider` not `CustomReadonlyEditorProvider`.** VS Code's dirty state management, undo stack, and save integration (Cmd+S) are only available when the provider owns a writable TextDocument. This gives us Cmd+S for free.

**`priority: "option"`.** The extension does not hijack all `.md` files by default. Users who want it as the default for a project set `workbench.editorAssociations` in their workspace settings. This avoids breaking existing markdown workflows.

**`retainContextWhenHidden: true`.** The TipTap editor is heavyweight to re-initialize. Keeping the WebView alive when the tab is hidden avoids losing in-progress edits when switching to another file.

**No localStorage in VSCode context.** The VSCode adapter's `load()` returns a Promise that resolves when `loadDocument` arrives from the extension host. Session state lives in the file (Mode A) or the sidecar (Mode B), not in the browser's localStorage. This is intentional — VS Code manages the document lifecycle.

**Comments survive Mode A round-trips.** Comments are serialized inline in CriticMarkup (`{>>…<<}` immediately after each change). The existing parser extracts them correctly. No separate comment storage needed for Mode A.

**Sidecar format = localStorage format.** The `.criticmark` JSON uses the same `{ markup, comments, savedAt }` schema as the current localStorage payload. No new serialization logic.

**Derive clean markdown on Mode B save.** The `exportClean()` utility already exists in `src/utils/exportDocument.ts`. The extension host runs it on the CriticMarkup string received from the WebView to produce the clean `.md` content.

---

## 12. Known Constraints

**External file changes.** If the `.md` file is modified outside VS Code while the editor is open (e.g., by a git operation), VS Code fires `onDidChangeTextDocument`. The extension host should reload the WebView content. This may discard in-progress changes — acceptable for v1; a merge/conflict UI is out of scope.

**Multiple tabs.** If the user opens the same `.md` file in both the Markdown Feedback editor and the default text editor simultaneously, writes from one will overwrite the other. VS Code does not prevent this. Document for users; no fix planned.

**Binary/large files.** The extension targets prose markdown files. Files over ~1 MB may cause WebView rendering delays. No special handling needed; this is an inherent TipTap/ProseMirror limitation.

**Keyboard shortcut conflicts.** VS Code intercepts many key combinations before they reach the WebView. Known conflicts: Cmd+Shift+T (VS Code: reopen closed editor). The track-changes toggle shortcut may need to change for the VSCode target (e.g., Cmd+Shift+K or a VS Code command registered in the manifest). Audit required during 9A implementation.

**Sidecar and git.** In Mode B, both `.md` and `.criticmark` must be committed to git. Users should add `.criticmark` to tracked files explicitly. Consider adding a `.gitattributes` note to the documentation.
