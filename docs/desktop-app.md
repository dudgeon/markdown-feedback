# Desktop App — Specification

**Status:** Research complete, ready for implementation
**Author:** Geoff + Claude
**Date:** 2026-02-15
**Framework:** Tauri 2
**Targets:** macOS (primary), iOS (secondary), Windows/Linux (future)

---

## 1. Motivation

Markdown Feedback is a client-side web app deployed to markdown-feedback.com. It works well for quick editing sessions, but lacks the file-centric workflow that desktop users expect: open a file, edit it, Cmd+S to save, close it, reopen it later. The web app's import/export flow (paste or upload, then download) is sufficient for one-shot editing but clumsy for iterating on local files.

A native desktop app fills these gaps:

| Capability | Web App | Desktop App |
|---|---|---|
| Open a local `.md` or `.docx` file | File picker (read-only in Safari/Firefox) | Native Open dialog, full read/write |
| Save back to the same file | Chrome/Edge only (File System Access API) | Cmd+S, always works |
| Save As | Chrome/Edge only | Cmd+Shift+S, native Save dialog |
| File associations (double-click `.md`) | Chrome PWA only | Native OS registration |
| Native menu bar (File, Edit, View) | Not possible | Standard macOS menu |
| Dock icon, window management | Browser tab | Native app |
| App Store distribution | Not possible | Mac App Store |
| Offline use without browser | Single-file HTML download | Native app, always available |
| Dirty state in title bar | Not standard | Native window title indicator |

### Why now

Two new requirements make the desktop app more valuable than a web-only approach:

1. **Local file editing** — the primary use case is editing `.md` files on disk, not pasting ephemeral content.
2. **Track changes toggle** — a "direct editing" mode where the user edits without tracking. This is a workflow feature that benefits from native keyboard shortcuts and menu integration.

Both features can be built in the web app (and should be, via progressive enhancement — see `docs/local-file-editing.md`), but they reach their full potential in a native shell with real file system access and OS integration.

---

## 2. Framework Choice: Tauri 2

### Why Tauri

| Factor | Tauri 2 | Electron | Swift + WKWebView |
|---|---|---|---|
| Binary size | ~3-8 MB | 150-400 MB | ~3-5 MB |
| macOS webview | WKWebView (Apple-native) | Bundled Chromium | WKWebView (Apple-native) |
| Code reuse | ~100% of existing React/TipTap | ~100% | ~100% (frontend only) |
| Cross-platform | macOS, Windows, Linux, iOS, Android | macOS, Windows, Linux | macOS only |
| Custom backend code needed | Zero for web wrapper; JS plugins for file I/O | ~50-100 lines JS (main process) | ~200 lines Swift |
| Mac App Store | Supported, documented, proven submissions | Supported but history of private API rejections | First-class |
| Backend language | Rust (but not needed for this use case) | JavaScript (Node.js) | Swift |
| Agent-friendliness | Good — Rust compiler gives precise error messages | Excellent — pure JS/TS | Medium — requires Xcode |

### Key reasons for Tauri over alternatives

1. **Binary size.** A ~5 MB DMG for a markdown editor is proportionate. A 200 MB Electron DMG is not.
2. **WKWebView.** Apple's own rendering engine — zero private API risk for Mac App Store submission. Electron has a history of MAS rejections for private API usage (fixed but trust was damaged).
3. **Cross-platform with one codebase.** Swift + WKWebView would be the smoothest MAS path but is macOS-only. Tauri covers macOS + iOS + Windows + Linux from the same project.
4. **Zero Rust for this use case.** The generated `main.rs` is ~5 lines of boilerplate. All file I/O, dialogs, and menus are available via Tauri's JavaScript plugin APIs. Rust is only needed for capabilities beyond the plugin ecosystem.
5. **First-class Vite integration.** Tauri points at the existing Vite dev server in development and bundles the `dist/` output in production. No build system changes.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WKWebView rendering differs from Chrome | Medium | Medium | Test TipTap editor in Safari before committing. ProseMirror has excellent cross-browser support, but verify contenteditable behavior. |
| Tauri MAS tooling not fully turnkey | Medium | Low | Manual code-signing steps are documented and scriptable. Budget time for CI/CD setup. |
| Rust toolchain adds dev environment complexity | Low | Low | One-time `rustup` install. First build takes 2-5 min (Rust compilation); subsequent builds are incremental. |
| Tauri v2 breaking changes | Low | Medium | Pin to specific minor version. Tauri v2 has been stable since Oct 2024 with frequent patch releases. |

---

## 3. Architecture

### 3.1 Platform-Agnostic Core / Platform Adapter Pattern

The codebase is structured as a platform-agnostic core (95%+ of code) with a thin platform adapter layer that swaps at runtime:

```
┌─────────────────────────────────────────────────┐
│  Platform Adapters (thin, per-target)            │
│  ┌───────────┐  ┌────────────┐  ┌────────────┐  │
│  │    Web     │  │   macOS    │  │    iOS     │  │
│  │ localStorage│ │ Tauri fs   │  │ Tauri fs   │  │
│  │ download() │ │ NSOpenPanel│  │ UIDocument │  │
│  │ modal UI   │ │ native menu│  │ share sheet│  │
│  └───────────┘  └────────────┘  └────────────┘  │
├─────────────────────────────────────────────────┤
│  Platform-Agnostic Core (shared)                 │
│  • ProseMirror marks & schema                    │
│  • TrackChanges extension (+ toggle)             │
│  • Serializer / Parser / DOCX importer           │
│  • extractChanges                                │
│  • Document store (state management)             │
│  • React components (editor, panels, toolbar)    │
│  • All UI layout and styling                     │
└─────────────────────────────────────────────────┘
```

**Runtime detection, not build-time branching:**

```typescript
const platform = {
  isTauri: typeof window !== 'undefined' && '__TAURI__' in window,
  hasFileSystemAccess: typeof window !== 'undefined' && 'showOpenFilePicker' in window,
}
```

This means:
- `npm run dev` works as a pure web app with zero Tauri dependencies loaded
- `npm run tauri dev` loads the same React app inside a native window; adapters detect Tauri at runtime
- The web deploy (`npm run build`) never touches `src-tauri/`
- No conditional imports that could break one target when modifying another

### 3.2 State Management Extraction

**This is the prerequisite refactor.** The current Editor.tsx is a God component holding all application state (12 state variables, 10 callbacks, 4 effects). Adding file path, dirty state, tracking toggle, and platform adapters to this component would cement a pattern that makes future redesign prohibitively expensive.

**Current coupling points in Editor.tsx:**

| State | Current Location | Problem |
|---|---|---|
| `comments` (Record<string, string>) | React state + commentsRef | Tightly coupled to plugin (via ref) and ChangesPanel (via props) |
| `rawMarkup` | React state | Derived from editor on every update; used by source view, auto-save, export |
| `changes` (ChangeEntry[]) | React state | Derived from editor on every update; drives ChangesPanel |
| Session persistence | `useSessionPersistence` hook | localStorage-specific implementation |
| Custom DOM events | `window.dispatchEvent` in plugin → `window.addEventListener` in Editor.tsx | Fragile — component restructuring breaks listener wiring |

**Target architecture:**

Extract a document store (Zustand or React context) that owns:

| Concern | Store Responsibility |
|---|---|
| Document lifecycle | `filePath`, `isDirty`, `lastSavedHash` |
| File operations | `open()`, `save()`, `saveAs()`, `close()` |
| Comments | `comments: Record<string, string>`, `setComment()`, `removeComment()` |
| Tracking toggle | `trackingEnabled: boolean`, `toggleTracking()` |
| Persistence | Platform-appropriate save (localStorage for web, Tauri fs for desktop) |

Editor.tsx becomes a thin layout shell that connects the store to components. The store implementation is platform-aware; the components are not.

**Persistence interface:**

```typescript
interface DocumentPersistence {
  save(content: string, comments: Record<string, string>): Promise<void>
  load(): Promise<{ content: string; comments: Record<string, string> } | null>
  clear(): Promise<void>
}
```

- **Web implementation:** localStorage (current behavior)
- **Desktop implementation:** Tauri fs plugin (write to file path)

### 3.3 Project Structure

Add Tauri to the existing project (not a monorepo). The web build pipeline is unchanged.

```
markdown-feedback/
  src/                        # UNCHANGED — React app
    components/
    extensions/
    hooks/
    utils/
    stores/                   # NEW — document store
      documentStore.ts        # Zustand store for document lifecycle
      persistence/
        web.ts                # localStorage implementation
        tauri.ts              # Tauri fs implementation
        index.ts              # Platform detection + export
  src-tauri/                  # NEW — Tauri shell (~5 files)
    Cargo.toml                # Rust dependencies (boilerplate)
    tauri.conf.json           # Window config, capabilities, build paths
    src/
      main.rs                 # ~5 lines of boilerplate
      lib.rs                  # Empty initially; custom commands if needed later
    icons/                    # Generated from source image
    capabilities/
      default.json            # Permission declarations
    Entitlements.plist        # macOS sandbox entitlements (for MAS)
  vite.config.ts              # Minor additions (clearScreen, server config)
  vite.config.singlefile.ts   # UNCHANGED
  package.json                # Add @tauri-apps/cli, @tauri-apps/api, plugins
```

**New npm scripts:**

```json
{
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

**New dependencies:**

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-fs": "^2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2"
  }
}
```

These are only loaded at runtime when `window.__TAURI__` is present. The web build tree-shakes them out (or they can be dynamically imported).

---

## 4. Local File Editing

### 4.1 Document Lifecycle

The desktop app introduces a file-centric document model:

```
            ┌──────────┐
            │ App Open │
            └────┬─────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
  ┌───────────┐    ┌────────────┐
  │ New Doc   │    │ Open File  │
  │ (sample)  │    │ (from disk)│
  └─────┬─────┘    └─────┬──────┘
        │                │
        ▼                ▼
  ┌──────────────────────────┐
  │     Editing Session      │
  │  filePath: string | null │
  │  isDirty: boolean        │
  │  trackingEnabled: bool   │
  └────────┬─────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
  ┌───────┐  ┌──────────┐
  │ Save  │  │ Save As  │
  │(Cmd+S)│  │(Cmd+Sh+S)│
  └───────┘  └──────────┘
```

### 4.2 File Operations

| Operation | Shortcut | Behavior |
|---|---|---|
| **New** | Cmd+N | Clear editor, load sample content, set `filePath = null` |
| **Open** | Cmd+O | Native Open dialog (`.md`, `.docx` filters). Read file, import via existing pipeline. Set `filePath`. |
| **Save** | Cmd+S | If `filePath` exists: serialize → write to path. If null: trigger Save As. |
| **Save As** | Cmd+Shift+S | Native Save dialog. Serialize → write to chosen path. Update `filePath`. |
| **Close** | Cmd+W | If dirty: "Save changes?" prompt. Then close window. |

### 4.3 Save Format

Save writes the **CriticMarkup format** — the same output as `exportCriticMarkup()`:

```yaml
---
criticmark:
  generator: Markdown Feedback
  version: "1.0"
  exported: 2026-02-15T14:30:00Z
---
# Document Title

This is {--removed--}{++added++} text with {~~old~>new~~} substitutions.

{==highlighted text==}{>>This needs a citation.<<}
```

This format is:
- Human-readable in any text editor
- Round-trip safe (re-opening restores all tracked changes and comments)
- Compatible with other CriticMarkup tools (Obsidian plugin, pandoc)
- Valid markdown (CriticMarkup tokens are visible but don't break rendering)

### 4.4 Dirty State

Track whether the document has unsaved changes:

```typescript
// In document store
const lastSavedHash = ref<string | null>(null)

function markClean(markup: string) {
  lastSavedHash.current = simpleHash(markup)
}

function isDirty(currentMarkup: string): boolean {
  if (!lastSavedHash.current) return true  // Never saved
  return simpleHash(currentMarkup) !== lastSavedHash.current
}
```

**Indicators:**
- macOS title bar: native "edited" dot (Tauri supports `window.setDocumentEdited(true)`)
- File name in toolbar: append " — Edited" or similar
- Close/quit: intercept with "Save changes?" dialog

### 4.5 Native Menu Bar (macOS)

```
Markdown Feedback
  ├── About Markdown Feedback
  ├── Preferences...          (future)
  ├── ─────────────
  ├── Hide / Quit

File
  ├── New                     Cmd+N
  ├── Open...                 Cmd+O
  ├── Open Recent            ▶ (submenu)
  ├── ─────────────
  ├── Save                    Cmd+S
  ├── Save As...              Cmd+Shift+S
  ├── ─────────────
  ├── Export                 ▶
  │   ├── CriticMarkup (.md)
  │   ├── Clean / Accepted
  │   └── Original / Rejected
  ├── ─────────────
  ├── Close Window            Cmd+W

Edit
  ├── Undo                    Cmd+Z
  ├── Redo                    Cmd+Shift+Z
  ├── ─────────────
  ├── Cut / Copy / Paste      (standard)
  ├── Select All              Cmd+A
  ├── ─────────────
  ├── Track Changes          ▶
  │   ├── ✓ Enable Tracking   Cmd+Shift+T
  │   └── Accept All / Reject All (future)
  ├── Add Comment             Cmd+Shift+H

View
  ├── Show Changes Panel      Cmd+Shift+P
  ├── Show Source View
  ├── ─────────────
  ├── About Markdown Feedback
```

The native menu bar replaces the web toolbar's Import/Export buttons. The toolbar itself remains for non-menu actions (changes panel toggle badge, file name display, tracking status indicator).

### 4.6 File Associations

Register the app to handle:

| Extension | UTI | Description |
|---|---|---|
| `.md` | `net.daringfireball.markdown` | Markdown files |
| `.markdown` | `net.daringfireball.markdown` | Markdown files (alt extension) |
| `.docx` | `org.openxmlformats.wordprocessingml.document` | Word documents (import) |

Configured in `tauri.conf.json` under `bundle.fileAssociations`. Double-clicking a `.md` file in Finder opens it in Markdown Feedback.

---

## 5. Track Changes Toggle

### 5.1 Behavior

A toggle that suspends the intercept layer, allowing direct (untracked) editing:

| State | Typing | Deleting | Substituting |
|---|---|---|---|
| **Tracking ON** (default) | Wrapped in `trackedInsertion` mark (green) | Marked as `trackedDeletion` (red strikethrough, text stays) | Deletion mark on old + insertion mark on new |
| **Tracking OFF** | Normal text insertion, no mark | Text is truly removed from the document | Text is replaced in-place, no marks |

### 5.2 Implementation

The toggle lives in **TipTap extension storage**, not React state. This keeps the intercept logic self-contained and avoids another ref bridge:

```typescript
// In TrackChanges extension
addStorage() {
  return {
    enabled: true,
  }
},

addProseMirrorPlugins() {
  const storage = this.storage

  return [
    new Plugin({
      props: {
        handleTextInput(view, from, to, text) {
          if (!storage.enabled) return false  // Fall through to default
          // ... existing intercept logic
        },

        handleKeyDown(view, event) {
          if (!storage.enabled) return false  // Fall through to default
          // ... existing intercept logic
        },

        handlePaste(view, event, slice) {
          if (!storage.enabled) return false  // Fall through to default
          // ... existing intercept logic
        },
      },
    }),
  ]
}
```

**Toggle from React:**

```typescript
editor.storage.trackChanges.enabled = false  // Suspend tracking
editor.storage.trackChanges.enabled = true   // Resume tracking
```

**Toggle from native menu:** Tauri menu item sends an event to the webview, which calls the same editor storage setter.

### 5.3 UI Indicators

- **Toolbar:** Visual indicator showing tracking status (e.g., a colored dot or icon that changes between "Tracking" and "Direct Editing")
- **Native menu:** Checkmark next to "Enable Tracking" in Edit > Track Changes
- **Keyboard shortcut:** Cmd+Shift+T (both web and desktop)

### 5.4 Semantic Implications

Text typed while tracking is off becomes indistinguishable from "original" text — no marks are applied. This is intentional and correct:

- The user is saying "I want to edit this text without recording the change"
- If they later turn tracking back on, new edits will be tracked against the current document state (including untracked changes)
- There is no way to retroactively mark what changed while tracking was off — this is an accepted limitation, consistent with how track changes works in Word and Google Docs

### 5.5 Interaction with Existing Marks

When tracking is off, the user can still interact with existing tracked changes:

| Action | Result |
|---|---|
| Type in normal text | Normal insertion (no mark) |
| Type inside an existing insertion span | Normal insertion (insertion mark may or may not extend depending on ProseMirror's default mark behavior — acceptable either way) |
| Delete normal text | Text is truly removed |
| Delete text with a deletion mark | Text (and its mark) are truly removed |
| Delete text with an insertion mark | Text (and its mark) are truly removed |

This means tracking-off mode can be used to accept/reject individual changes manually by deleting the marked text or removing marks. A dedicated Accept/Reject feature is planned separately (see BACKLOG.md) but tracking-off provides a manual workaround.

---

## 6. Cross-Platform Strategy

### 6.1 Target Matrix

| Target | Status | Build | Distribution |
|---|---|---|---|
| **Web (markdown-feedback.com)** | Live | `npm run build` → GitHub Pages | URL |
| **Web (single-file HTML)** | Live | `npm run build:single` → GitHub Release asset | Download |
| **macOS** | Planned (this spec) | `npm run tauri build` | DMG + Mac App Store |
| **iOS** | Future | `npm run tauri ios build` | App Store |
| **Windows** | Future | CI (GitHub Actions Windows runner) | MSI/NSIS installer |
| **Linux** | Future | CI (GitHub Actions Linux runner) | AppImage / .deb |

### 6.2 Unified Development Workflow

All targets share the same `src/` directory. Platform-specific code is isolated:

```
src/stores/persistence/
  index.ts          →  export { save, load, clear } (auto-detects platform)
  web.ts            →  localStorage implementation
  tauri.ts          →  Tauri fs plugin implementation
  types.ts          →  DocumentPersistence interface

src/utils/fileOps/
  index.ts          →  export { openFile, saveFile, saveFileAs } (auto-detects)
  web.ts            →  File System Access API (Chrome) / download fallback
  tauri.ts          →  Tauri dialog + fs plugins
  types.ts          →  FileOps interface
```

**Development commands:**

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server, web-only, no Tauri needed |
| `npm run tauri dev` | Vite dev server inside Tauri native window, HMR works |
| `npm run build` | Production web build for GitHub Pages |
| `npm run build:single` | Single-file HTML for offline distribution |
| `npm run tauri build` | Production macOS .app bundle + DMG |

**Non-regression guarantee:** `npm run dev` and `npm run build` never invoke Tauri, never require the Rust toolchain, and never touch `src-tauri/`. A developer without Rust installed can work on the web app. The platform adapters use runtime detection, not build-time flags, so there is no conditional compilation that could break one target when modifying another.

### 6.3 Testing Strategy

| Target | Testing Approach |
|---|---|
| Web (Chrome) | Chrome browser tools (`mcp__claude-in-chrome__*`), verify at localhost:5173 |
| Web (Safari) | Manual check — critical for WKWebView parity. Open markdown-feedback.com in Safari, verify editor behavior. |
| macOS (Tauri) | `npm run tauri dev`, verify native menus, file open/save, keyboard shortcuts |
| iOS | Deferred until iOS target is actively developed |

**Safari testing is a prerequisite for Tauri macOS.** Since Tauri uses WKWebView (Safari's engine), any rendering or behavior difference in Safari will also appear in the Tauri app. Test in Safari before building the Tauri shell.

---

## 7. Mac App Store Distribution

### 7.1 Requirements

| Requirement | How Tauri Satisfies It |
|---|---|
| App Sandbox (mandatory) | Entitlements.plist with `com.apple.security.app-sandbox` |
| User-selected file R/W | `com.apple.security.files.user-selected.read-write` entitlement |
| Network client | `com.apple.security.network.client` (required by WKWebView even for local content) |
| Security-scoped bookmarks | `com.apple.security.files.bookmarks.app-scope` (for Recent Files persistence) |
| Universal binary (arm64 + x86_64) | `tauri build --target universal-apple-darwin` |
| Code signing | Apple Developer ID certificate, configured via env vars |
| Notarization | App Store Connect API key, automated in `tauri build` |
| Guideline 4.2 (minimum functionality) | App works offline, has native file dialogs, native menus, substantive editor — not a website wrapper |

### 7.2 Entitlements

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.bookmarks.app-scope</key>
    <true/>
</dict>
</plist>
```

### 7.3 Distribution Checklist

- [ ] Apple Developer Program enrollment ($99/year)
- [ ] Developer ID certificate generated in Keychain Access
- [ ] App Store Connect API key for notarization
- [ ] App icon (1024x1024 source, Tauri generates all sizes)
- [ ] App category: Productivity
- [ ] Privacy policy URL (required for MAS)
- [ ] Screenshots for MAS listing
- [ ] `tauri build --bundles app --target universal-apple-darwin`
- [ ] Code sign with `codesign --force --options runtime --entitlements Entitlements.plist`
- [ ] Create signed `.pkg` for MAS upload
- [ ] Upload via `xcrun altool` or Transporter

---

## 8. Known Limitations & Accepted Defects

### 8.1 iOS Input Handling (RESOLVED)

**Status:** Implemented. The `beforeinput` handler is live in `trackChanges.ts`.

**Original problem:** iOS virtual keyboards fire `keydown` with `key: "Unidentified"` for Backspace/Delete, causing the `handleKeyDown` intercept to miss deletions.

**Solution:** Added `handleDOMEvents.beforeinput` to the TrackChanges plugin. Handles all deletion `inputType`s: `deleteContentBackward`, `deleteContentForward`, `deleteWordBackward/Forward`, `deleteSoftLineBackward/Forward`, `deleteHardLineBackward/Forward`, `deleteByCut`, `deleteByDrag`. Uses `getTargetRanges()` for word/line deletions to leverage browser-native word boundary detection.

**Coexistence with `handleKeyDown`:** On desktop, `handleKeyDown` returns `true` → ProseMirror calls `preventDefault()` → `beforeinput` never fires. On iOS (where `handleKeyDown` returns `false` because `key === "Unidentified"`), `beforeinput` takes over. A 50ms timestamp guard (`_lastDeleteHandledAt`) prevents double-processing in edge cases.

**Desktop regression verified:** Backspace, Delete, select+delete, select+type (substitution), Option+Backspace (word), and Cmd+Backspace (line) all work identically to pre-change behavior.

### 8.2 WKWebView Rendering Differences (MONITOR)

**Status:** Needs verification before first Tauri build.

WKWebView (Safari's engine) may render some CSS or DOM behaviors differently from Chrome. Known areas to verify:

| Area | Risk | Verification |
|---|---|---|
| `contenteditable` cursor positioning | Medium | Test deletion span cursor-skipping in Safari |
| Selection API (`getSelection`, `getRangeAt`) | Low | ProseMirror abstracts this, but verify |
| CSS `contenteditable=false` styling | Low | Verify red strikethrough deletion spans render correctly |
| `scrollIntoView` behavior | Low | Test click-to-scroll in changes panel |
| Dynamic `import()` for JSZip | Low | Verify .docx import works in Safari |

**Mitigation:** Open markdown-feedback.com in Safari and perform a full editing session (type, delete, substitute, comment, import .docx, export) before writing any Tauri code. File any Safari-specific bugs as blockers for the Tauri build.

### 8.3 Tailwind CSS v4 and AI Agents (CAUTION)

**Status:** Known pattern from real-world vibe-coding reports.

Multiple developers report that AI agents working with Tailwind CSS v4 sometimes revert to v3 patterns (e.g., `@apply` usage, `tailwind.config.js` instead of CSS-based config). This project uses Tailwind CSS 4 via the `@tailwindcss/vite` plugin.

**Mitigation:** When reviewing agent-generated code, verify Tailwind usage matches v4 conventions. The existing `src/index.css` and component files are the source of truth for the project's Tailwind patterns.

---

## 9. Implementation Phases

Build iteratively. Each phase is independently shippable on the web target. No phase leaves the web app in a broken state.

### Phase 1: State Management Extraction

**Goal:** Extract document state from Editor.tsx into a dedicated store. This is the prerequisite for everything else — it decouples the component hierarchy from the data model.

**Deliverables:**
- `src/stores/documentStore.ts` — Zustand store (or React context) owning:
  - `comments: Record<string, string>`
  - `changes: ChangeEntry[]`
  - `rawMarkup: string`
  - `trackingEnabled: boolean`
  - `filePath: string | null`
  - `isDirty: boolean`
  - All comment CRUD operations
  - `handleEditorChange()` (moved from Editor.tsx)
- `src/stores/persistence/` — persistence interface with web (localStorage) implementation
- Editor.tsx reduced to a layout shell consuming the store
- Custom DOM events (`trackchanges:tab-to-comment`, `trackchanges:create-highlight`) replaced with store actions or kept as-is if they remain simpler

**Verification:** Web app behavior is identical before and after. No user-visible changes. Run `npm run build` to catch type errors.

### Phase 2: Track Changes Toggle

**Goal:** Add ability to suspend/resume the intercept layer.

**Deliverables:**
- `addStorage()` in TrackChanges extension with `enabled: true` default
- All three handlers (`handleKeyDown`, `handleTextInput`, `handlePaste`) check `storage.enabled` and return `false` (passthrough) when disabled
- Toggle control in toolbar (both web and desktop)
- Keyboard shortcut: Cmd+Shift+T
- Store integration: `trackingEnabled` in document store, synced bidirectionally with extension storage
- About panel updated with new keyboard shortcut

**Verification:** Toggle off → type/delete → text changes normally (no marks). Toggle on → edits are tracked as before. Existing tracked changes remain visible in both modes.

### Phase 3: Tauri Shell

**Goal:** Wrap the web app in a native macOS window.

**Deliverables:**
- `src-tauri/` directory with Tauri 2 boilerplate
- `tauri.conf.json` pointing at Vite dev server and `dist/` output
- Vite config additions (`clearScreen: false`, `server.strictPort`, ignore `src-tauri/` in watcher)
- `npm run tauri:dev` and `npm run tauri:build` scripts
- App opens in a native window with the existing web UI
- Verify: editor works identically in the Tauri window (type, delete, substitute, comment, import, export)

**This phase produces a working app but with no native features yet — just the web app in a window.** The purpose is to validate the Tauri setup and WKWebView compatibility before adding native integration.

### Phase 4: Native File Operations

**Goal:** Replace the web import/export flow with native file dialogs.

**Deliverables:**
- `src/stores/persistence/tauri.ts` — Tauri fs implementation of persistence interface
- `src/utils/fileOps/tauri.ts` — Open/Save/SaveAs using `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`
- Platform detection auto-selects Tauri implementations when running in Tauri
- Native menu bar with File menu (New, Open, Save, Save As, Export submenu, Close)
- Cmd+S / Cmd+Shift+S keyboard shortcuts wired to native save
- File name displayed in window title bar
- Dirty state indicator in title bar (`window.setDocumentEdited()`)
- "Save changes?" prompt on close when dirty
- File associations for `.md` and `.docx`

**Verification:** Open a `.md` file from Finder → edit → Cmd+S → reopen → changes preserved. Open a `.docx` → tracked changes imported correctly. Web app continues to work unchanged.

### Phase 5: Mac App Store Preparation

**Goal:** Prepare for MAS submission.

**Deliverables:**
- Entitlements.plist with sandbox permissions
- App icon (all required sizes)
- Universal binary build (`--target universal-apple-darwin`)
- Code signing configuration (env vars for CI)
- Notarization configuration
- GitHub Actions workflow for macOS build (separate from web deploy)
- DMG for direct distribution (pre-MAS)
- Privacy policy page
- MAS listing metadata (screenshots, description, category)

**Verification:** Notarized DMG installs and runs on a clean Mac. App passes `codesign --verify`. File operations work under sandbox.

### Phase 6: Polish & Future

**Goal:** Desktop-specific refinements.

**Potential deliverables (unordered):**
- Recent Files menu (security-scoped bookmarks for persistent access)
- Edit menu integration (Undo/Redo/Cut/Copy/Paste wired to editor)
- Window state persistence (size, position)
- Auto-update via Tauri's updater plugin (check GitHub Releases)
- iOS target (requires Phase 8.1 defect resolution first)

---

## 10. References

- [Tauri 2 Documentation](https://v2.tauri.app/)
- [Tauri + Vite Frontend Integration](https://v2.tauri.app/start/frontend/vite/)
- [Tauri App Store Distribution](https://v2.tauri.app/distribute/app-store/)
- [Tauri macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri DMG Distribution](https://v2.tauri.app/distribute/dmg/)
- [Tauri Dialog Plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri File System Plugin](https://v2.tauri.app/plugin/file-system/)
- [Local File Editing ADR](./local-file-editing.md) — web-side File System Access API analysis
- [DOCX Import Spec](./docx-import.md) — .docx parsing architecture
- [CriticMarkup Specification](http://criticmarkup.com/spec.php)
- [Apple App Sandbox Documentation](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Successful Tauri MAS Submission (it-waves.com)](https://it-waves.com/blogs/how-to-publish-tauri-apps-to-app-store)
- [Vibe Coding with Tauri (Chris Hartwig)](https://chris-hartwig.com/blog/vibe-coding-a-desktop-app-with-tauri/)
