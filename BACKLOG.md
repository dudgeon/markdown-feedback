# Markdown Feedback — Backlog & Roadmap

## Completed

### Phase 1: Intercept Spike
- [x] TipTap 3 + React 19 + Vite 7 scaffold
- [x] `trackedDeletion` mark (red strikethrough, contenteditable=false, non-inclusive)
- [x] `trackedInsertion` mark (green, inclusive, editable)
- [x] Intercept plugin via `handleKeyDown`, `handleTextInput`, `handlePaste`
- [x] Substitution pairs linked via `pairedWith` attribute (nanoid IDs)
- [x] Cursor skips over deletion spans
- [x] Editing within insertions works normally (no tracking)
- [x] Browser-validated, no console errors

### Phase 2: CriticMarkup Serialization + Source View
- [x] Serialize editor state → CriticMarkup string (spans → `{++…++}`, `{--…--}`, `{~~…~>…~~}`)
- [x] Collapsible source view panel (bottom, read-only, syntax-highlighted)
- [x] Live update on edit (debounced ~500ms)
- [x] Copy-to-clipboard button on source view
- [x] GitHub Pages deployment (auto-deploy on push to main)
- [x] Renamed app to "Markdown Feedback"
- [x] Browser-verified: source view renders, expands/collapses, syntax colors, copy button, debounce all confirmed working

### Phase 3: Import / Export
- [x] CriticMarkup parser/deserializer (`parseCriticMarkup.ts`)
- [x] Paste import modal with automatic CriticMarkup parsing
- [x] Sample content loaded through parser (not hardcoded HTML)
- [x] Primary export: `.md` download with YAML frontmatter (`criticmark:` namespace)
- [x] Secondary exports: clean/accepted, original/rejected, copy to clipboard
- [x] Export dropdown menu component

**Phase 3 scope decisions:**
- File picker and drag-and-drop deferred — paste is the primary import modality
- Import always parses CriticMarkup (no "Start fresh" vs "Resume editing" prompt). The planned "rebaseline" feature (see Backlog > Source View Actions) is the path to clear markup when desired.
- localStorage persistence deferred to Phase 6

### Phase 4: Changes Panel
- [x] Right sidebar listing all tracked changes by document position
- [x] Change type icons + color coding (deletion/insertion/substitution)
- [x] Context snippets (~5 words before/after surrounding text)
- [x] Change count in panel header
- [x] Click-to-scroll: clicking a change scrolls editor to that location and selects it
- [x] Two-column layout (editor left, panel right, source view full-width below)

**Phase 4 scope decisions:**
- Uncommented count and filter toggle deferred to Phase 5 (requires comments)
- Scroll-to uses native text selection highlight (no pulse/glow decoration yet)

### Phase 5: Annotation System
- [x] Inline comment input in Changes Panel per change (text field below each change card, auto-save on blur)
- [x] Standalone comment: select text in editor + Cmd+Shift+H to create a highlight + comment
- [x] Standalone comments appear in Changes Panel alongside edits, in document order
- [x] Keyboard shortcut (Tab) to jump focus from editor to comment input — **only when cursor is on/adjacent to a tracked change or highlight**; otherwise Tab functions normally
- [x] From comment input: Enter to save, Tab to return focus to editor
- [x] Edit comments serialize as `{>>…<<}` immediately after their change
- [x] Standalone comments serialize as `{==highlighted text==}{>>comment<<}`
- [x] Both comment types re-import on paste import
- [x] Orphaned comment handling (pruned on editor update when change ID no longer exists)
- [x] Comment count in panel header ("N changes, M comments")
- [x] TrackedHighlight mark (yellow highlight, non-inclusive)
- [x] Comments stored in React state as `Record<string, string>` (external to ProseMirror)
- [x] Source view syntax highlighting for highlights and comments

**Phase 5 design decisions:**
- No separate Edit/Annotate mode — editor stays editable at all times
- Comments live in React state, not ProseMirror mark attributes (substitutions have two marks; external state is simpler)
- Tab only activates when cursor is on/adjacent to a tracked change; otherwise Tab functions normally
- Custom DOM events (`trackchanges:tab-to-comment`, `trackchanges:create-highlight`) bridge plugin keyboard shortcuts to React state

---

### Phase 6: Session Persistence + Undo
- [x] localStorage auto-save (debounced 1s)
- [x] Session recovery prompt on app load ("Resume your previous session?" with relative timestamp)
- [x] Undo/redo at tracked-change level — ProseMirror's History extension handles this natively because the intercept layer applies/removes marks rather than deleting text
- [x] Mixed-span operations (select across original + inserted + deleted text) — already working via `collectTextRanges` in Phase 1

**Phase 6 design decisions:**
- Save format: serialized CriticMarkup string + comments map + timestamp (same as export format, human-readable in DevTools)
- Restore path reuses the existing import flow (`criticMarkupToHTML` → `setContent` + `setComments`)
- Auto-save debounced at 1s via `useDebouncedValue` hook
- Recovery modal: "Start Fresh" clears localStorage and keeps sample content; "Resume" restores via import path

---

## Up Next

### Phase 7: DOCX Import (Google Docs → CriticMarkup)
Import a `.docx` file exported from Google Docs (with Suggesting mode edits) and reconstruct all tracked changes and comments as CriticMarkup. All processing client-side — JSZip + browser-native DOMParser. Full spec: `docs/docx-import.md`.

- [x] **Phase A:** Basic .docx → markdown (no tracked changes) — JSZip + DOMParser, file picker UI
- [x] **Phase B:** Tracked changes → CriticMarkup (`{++…++}`, `{--…--}`, `{~~…~~}`)
- [x] **Phase C:** Comments extraction from `word/comments.xml` → `{>>…<<}`
- [x] **Phase D:** Comment-to-change attribution (comment on suggestion vs. comment on plain text)
- [ ] **Phase E:** Polish — ~~lists,~~ moves, hyperlinks, edge cases, lazy loading

**Phase 7 design decisions:**
- Output is a CriticMarkup markdown string — same format as paste import. Entire existing pipeline (`criticMarkupToHTML` → `setContent`) works unchanged.
- Google Docs puts `<w:ins>` before `<w:del>` for substitutions (reversed from Word). Walker detects both orderings.
- Comment markers (`commentRangeStart/End`, `commentReference`) can nest inside `<w:ins>`/`<w:del>` elements — walker scans inside tracked changes to find them.
- Comment on a substitution: `extractCommentsFromSegments` keys the comment by the deletion's ID (matching how `extractChanges` identifies substitution entries).
- Lists: `word/numbering.xml` parsed to map `(numId, ilvl)` → `bullet`/`decimal`, emitted as `- ` or `1. ` prefixes.
- Entries joined with `\n\n` (not `\n`) because `criticMarkupToHTML` splits blocks on double-newline.

### Phase 8: Multi-Platform Foundation + macOS App
Platform adapter hardening, then native macOS app via Tauri 2. Full spec: `docs/desktop-app.md`.

**Execution order note:** Phase 8C (adapter hardening) is a prerequisite for all native targets. Phase 9 (VSCode extension) is built before Phase 8D–G (Tauri) because: VSCode requires no native toolchain, uses Chromium (same engine as web app), and validates the platform adapter pattern before tackling WKWebView compatibility. See Phase 9 below.

- [x] **Phase A:** State management extraction — moved document state from Editor.tsx into Zustand store (`documentStore.ts`). Abstract persistence layer (`stores/persistence/`). Web app behavior unchanged.
- [x] **Phase B:** Track changes toggle — module-level `_trackingEnabled` flag, all three handlers check flag and passthrough when disabled. Toolbar toggle pill + Cmd+Shift+T shortcut. `appendTransaction` strips inclusive insertion marks from untracked text. Keyboard shortcuts section added to About panel. Ships on web.
- [x] **Phase C:** Platform adapter hardening — expand `PlatformAdapter` interface beyond persistence to cover file I/O (`openFile`, `saveFile`, `getCurrentFilePath`), platform signals (`setDirty`, `onExternalFileChange`), and a `capabilities` flag object for conditional UI. Web adapter satisfies all optional fields with no-ops. No user-visible change — prerequisite refactor for all native targets. *(Do before Phase 9 VSCode and before Phase 8D Tauri.)*
- [ ] **Phase D:** Tauri shell — `src-tauri/` boilerplate, `tauri.conf.json` pointing at Vite, verify editor works in WKWebView. No native features yet — just the web app in a native window. *(Do after Phase 9A VSCode — VSCode validates the app works in a non-browser WebView first.)*
- [ ] **Phase E:** Native file operations — Open/Save/SaveAs via `@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs`. Native menu bar (File/Edit/View). Dirty state in title bar. File associations for `.md` and `.docx`. Cmd+S saves to disk.
- [ ] **Phase F:** Mac App Store preparation — sandbox entitlements, universal binary, code signing, notarization, GitHub Actions CI for macOS build, DMG for direct distribution. *(Requires Apple Developer Program membership.)*
- [ ] **Phase G:** Polish — Recent Files menu, Edit menu integration, window state persistence, auto-update via Tauri updater plugin.

**Phase 8 design decisions:**
- Tauri 2 chosen over Electron (3-8 MB binary vs 150-400 MB; WKWebView = no private API risk for MAS) and Swift+WKWebView (cross-platform > macOS-only).
- Platform adapter pattern with runtime detection (`window.__TAURI__` / `acquireVsCodeApi`), not build-time branching. `npm run dev` and `npm run build` never touch native targets.
- State extraction (Phase A) is the prerequisite refactor — avoids cementing Editor.tsx as a God component before adding file path, dirty state, and tracking toggle.
- Track changes toggle (Phase B) uses a module-level variable in `trackChanges.ts` (not TipTap extension storage, which resets on `useEditor` re-render). Text typed with tracking off becomes indistinguishable from "original" text (intentional, matches Word/Google Docs behavior).
- Save format is CriticMarkup with YAML frontmatter (same as current export). Round-trip safe.
- **Known defect (accepted):** iOS virtual keyboard does not reliably fire `keydown` for Backspace/Delete. Deletion tracking may not work on iOS without a hardware keyboard. Mitigation: add `handleDOMEvents.beforeinput` handler when iOS target is actively developed. Does not affect macOS or web. See spec §8.1 for full analysis.

---

### Phase 9: VSCode Extension
Custom Text Editor for `.md` files. Hosts the existing React/TipTap app in a VS Code WebView. Full spec: `docs/vscode-extension.md`.

**Why before Tauri (8D–G):** No native toolchain required (Node/TypeScript only). Uses Electron/Chromium — same engine as the web app, no WKWebView compatibility risk. VS Code Marketplace distribution is simpler than Mac App Store. Validates the platform adapter pattern (Phase 8C) as its first real consumer before Tauri is built against it.

- [ ] **Phase A:** Custom Editor (file mode A, CriticMarkup as file) — VS Code extension scaffold (`package.json` manifest, `extension.ts`), `CustomTextEditorProvider` for `.md` files, WebView hosting existing Vite React bundle, `postMessage` protocol (`ready` / `loadDocument` / `documentChanged` / `saveRequested`), Cmd+S integration via VS Code TextDocument API, VSCode platform adapter (replaces localStorage, routes file I/O through extension host). Build pipeline: extension host via esbuild + WebView via existing Vite build.
- [ ] **Phase B:** File mode toggle (Option B, sidecar) — VS Code workspace setting `markdownFeedback.fileMode: "criticmarkup" | "sidecar"`. In sidecar mode: `.md` file holds clean markdown (accept-all export), `.criticmark` JSON sidecar holds `{ markup, comments, savedAt }`. On open: read both files, reconstruct full session in WebView. On save: write clean markdown to `.md`, write sidecar JSON to `.criticmark`. Status bar indicator showing active file mode.

**Phase 9 design decisions:**
- `CustomTextEditorProvider` (not `CustomReadonlyEditorProvider`) — VS Code owns the document model, so dirty state, Cmd+S, and undo stack integration are free.
- Editor priority: `"option"` — do not replace the default markdown editor. User right-clicks → "Open With → Markdown Feedback Editor", or sets as default per-workspace via `workbench.editorAssociations`.
- WebView is stateless between sessions — content always comes from the file (not localStorage). The VSCode adapter's `load()` is a no-op; content arrives via `loadDocument` message on WebView ready.
- Sidecar filename: `{basename}.criticmark` alongside the `.md` file. Format matches the current localStorage payload for consistency.
- File mode A is the correct default — CriticMarkup degrades gracefully in any markdown viewer, is Obsidian-compatible, and round-trips perfectly. Mode B is opt-in for workflows where non-tool users view the same files.
- Single source tree — no fork. The extension packages the same Vite bundle as the web app; the platform adapter is the only new code.

### Single-File Build + Release Process
- [x] `vite-plugin-singlefile` integration — `npm run build:single` produces a single self-contained HTML file (`dist-single/index.html`) with all JS, CSS, and assets inlined
- [x] Separate Vite config (`vite.config.singlefile.ts`) so normal GitHub Pages build is unaffected
- [x] `/release` slash command — discovers unreleased commits, writes changelog, builds single-file HTML, tags, pushes, creates GitHub release with HTML asset attached
- [x] `CHANGELOG.md` created with v1.0.0 entry
- [x] README updated with download link, trust model, and build instructions

### Spike: Custom Domain (`markdown-feedback.com`) (COMPLETE)
Domain purchased via Cloudflare. Connected to GitHub Pages deployment.

- [x] **Cloudflare DNS:** CNAME records `@` and `www` → `dudgeon.github.io` (Proxied, SSL Full)
- [x] **GitHub Pages custom domain:** `public/CNAME` + `gh api` configuration
- [x] **Vite base path:** Changed from `'/markdown-feedback/'` to `'/'`
- [x] **Update references:** Live URL updated in `README.md`, `CLAUDE.md`, `AboutPanel.tsx`
- [x] **Verify:** `https://markdown-feedback.com` loads correctly, SSL valid via Cloudflare
- [x] **HTTPS enforcement:** GitHub Pages `https_enforced: true`, Let's Encrypt cert provisioned (required temporarily disabling Cloudflare proxy)

### Responsive Design + About Panel

#### Tier 1: Usable on Small Screens (COMPLETE)
- [x] **Collapsible changes panel** — toggle button in toolbar, slide-over drawer from right on mobile (`< lg:`), inline on desktop
- [x] **Single-column editor** — below `lg:`, editor takes full width via `lg:flex lg:gap-4`
- [x] **Responsive toolbar** — extracted `Toolbar.tsx` with info icon, title, Import (icon-only on `< md:`), Export, panel toggle with badge
- [x] **Responsive padding** — `p-4 lg:p-6` on outer container
- [x] **Desktop panel restyle** — removed box border/shadow, replaced with subtle left border for integrated look
- [x] **About panel** — left slide-in overlay per `docs/about-panel.md`: app description, "Why I built this", GitHub link, footer

**Design decisions:**
- Desktop (> 1024px): panel visible by default, toggleable via toolbar button, inline in flex layout
- Mobile (< 1024px): panel hidden by default, opens as right-side drawer with backdrop overlay
- About panel: left slide-in overlay, closes via backdrop click or Escape
- Import/Export: text labels on `md:+`, icon-only below `md:`

#### Tier 2: Touch-Friendly
Improvements for finger-based interaction (phone, tablet without keyboard).

- [ ] **Tap target sizing** — ensure all buttons, change cards, and interactive elements meet 44×44px minimum
- [ ] **Import modal** — increase textarea height on mobile (or make it `flex-1` to fill available space); larger action buttons
- [ ] **Change card interaction** — change cards should have generous padding and clear active/pressed states for touch
- [ ] **Scroll-to behavior** — verify click-to-scroll works on touch; may need `scrollIntoView` with `behavior: 'smooth'` adjustment
- [ ] **Export dropdown repositioning** — on small screens, anchor dropdown to viewport edge or use a bottom sheet instead of absolute `right-0`

#### Tier 3: Polish
Refinements that improve the feel but aren't blockers.

- [ ] **Responsive typography** — scale heading and body text for readability on small screens
- [ ] **Landscape phone layout** — test and handle landscape orientation where viewport is wide but very short
- [ ] **PWA viewport** — add `<meta name="viewport">` if missing; test pinch-zoom behavior doesn't break the editor
- [ ] **Keyboard avoidance** — on mobile, ensure the editor isn't obscured by the software keyboard when typing

---

## Known Issues & Tech Debt

### Import parser (fixed)
- [x] ~~Single-newline block separation drops content~~ — fixed: replaced naive `\n\n+` split with line-aware block grouper that treats headings as always-single-line blocks
- [x] ~~YAML frontmatter not stripped on re-import~~ — fixed: `stripFrontmatter()` removes `--- ... ---` before parsing

### Editor rendering (fixed)
- [x] ~~Ordered/unordered list bullets/numbers don't render~~ — fixed: restored `list-style-type: disc`/`decimal` stripped by Tailwind preflight

### Per-character deletion cursor dead zones (fixed)
- [x] ~~Backspacing through original text created one `contenteditable=false` span per character, forming a cursor dead zone~~ — fixed: `handleSingleCharDelete` now reuses the ID of an adjacent standalone deletion mark. ProseMirror merges marks with equal attributes into a single DOM span, eliminating the wall of adjacent non-editable elements. See `docs/deletion-span-solutions.md` for the full analysis.

### Changes panel overflow (fixed)
- [x] ~~Right-side changes/comment panel viewport area is not locked to the bottom of the screen — panel extends beyond viewport instead of scrolling internally~~ — fixed: switched from page-scrollable layout with `sticky` panel to viewport-locked flex layout (`h-dvh`). Editor and panel scroll independently within their columns.

### iOS input handling (accepted defect — Phase 8)
- [ ] `handleKeyDown` in TrackChanges plugin does not reliably fire on iOS virtual keyboard for Backspace/Delete. Deletion tracking may silently fail on iOS without a hardware keyboard. Text input and paste are unaffected. macOS and web are unaffected.
- [ ] **Mitigation:** Add `handleDOMEvents.beforeinput` handler to catch `deleteContentBackward`/`deleteContentForward` input types. This is additive — does not modify existing `handleKeyDown` logic. Deferred until iOS target is actively developed.
- [ ] Full analysis: `docs/desktop-app.md` §8.1

### Serialization edge cases
- [ ] Substitution over text that already contains old deletions — old deletions emit as standalone `{--…--}` outside the `{~~…~~}`, which is semantically correct but may look odd
- [ ] Serializer only handles paragraphs and headings — lists, blockquotes, code blocks pass through without markdown prefixes
- [ ] `hardBreak` nodes within a paragraph are not emitted as `\n`
- [x] ~~No handling of `{>>comment<<}` yet~~ — implemented in Phase 5

### Naming cleanup (fixed)
- [x] ~~`docs/prd.md` and `docs/project-context.md` still reference "CriticMark Editor"~~ — updated to "Markdown Feedback"

---

## Backlog (Unscheduled)

### URL Parameter Import
- [ ] Accept a URL query parameter (e.g. `?md=...`) that pre-loads markdown content into the editor
- [ ] Content should be URL-decoded and fed through the existing CriticMarkup import path
- [ ] Enables external tools/workflows to link directly into the editor with pre-populated content

### Prominent Import Button (Default State)
- [ ] When the app loads with placeholder text (no locally saved session), style the Import button with primary coloring or heavy stroke to draw attention
- [ ] Should use an existing Tailwind/library style for visual consistency — prominent but not jarring
- [ ] Revert to normal button styling once user has imported content or started editing

### Style Change Tracking
- [ ] Track formatting/style changes (bold, italic, heading level, etc.) in the native editor — currently only insertions and deletions are intercepted
- [ ] Represent style changes in CriticMarkup output (may need convention beyond the spec, e.g. comment annotations describing the style change)
- [ ] Import style changes from `.docx` files (Google Docs track-changes includes formatting changes alongside text edits)

### Dual-Document Diff Import
- [ ] Add ability to import two copies of a document (original and changed) and infer the diffs
- [ ] Reconstruct insertions, deletions, and substitutions as tracked changes in the editor
- [ ] Allow further editing/markup on top of the inferred diffs
- [ ] UI: could be a second textarea in the Import modal, or a two-file picker

### Editor Polish
- [ ] Paragraph-level deletions (CriticMarkup can't span paragraph boundaries)
- [ ] Paste handling: strip formatting vs. preserve markdown-compatible formatting
- [ ] Merge paragraphs (delete line break between them) — tracked change semantics
- [ ] Full markdown rendering in editor (headings, bold, italic, lists, code, links, blockquotes)
- [ ] Markdown ↔ rich text round-trip fidelity

### Source View Actions
- [ ] Paste-to-replace button: replace editor content with clipboard contents (no tracked deletions — rebaselines the document)
- [ ] Rebaseline button: accept all tracked changes in-place, clearing markup and producing a clean document

### Share (Web Share API)
- [ ] "Share" option in the Export dropdown menu, visible only when `navigator.share` is available (iOS Safari, Chrome Android)
- [ ] Shares the full CriticMarkup markdown body as text via the native OS share sheet
- [ ] Fallback: hidden on desktop browsers that don't support the Web Share API (existing clipboard/download exports cover that case)
- [ ] Must be triggered from a user gesture (click handler) per browser security requirements
- [ ] Stretch: option to share as a `.md` file attachment via `navigator.share({ files })` for platforms that support it

### Selection Comment Tooltip
- [ ] When text is selected in the editor, show a small floating tooltip/popover beneath the selection with a comment icon/button
- [ ] Clicking the button applies a highlight + focuses the comment input (same behavior as Cmd+Shift+H)
- [ ] Tooltip should be discrete — small, subtle styling, no chrome; disappears when selection is cleared
- [ ] Position using ProseMirror's `coordsAtPos` or the browser Selection API `getBoundingClientRect`
- [ ] Complements the existing Cmd+Shift+H shortcut for users who don't know the keyboard shortcut

### Keyboard Shortcuts in About Panel (COMPLETE — Phase 8B)
- [x] Add a "Keyboard Shortcuts" section to the About panel listing all user-facing shortcuts
- [x] Include: Cmd+Shift+T (toggle tracking), Cmd+Shift+H (highlight), Tab (jump to comment input when on a change), Enter/Tab in comment input (save/return to editor)
- [x] Keep in sync as new shortcuts are added

### Accept / Reject
- [ ] Accept/reject individual changes to produce a clean document
- [ ] Accept all / Reject all bulk operations

### Comment Categories (v1.5+)
- [ ] Pre-defined tags: `[tone]`, `[clarity]`, `[structure]`, `[grammar]`, `[concision]`, `[accuracy]`
- [ ] Keyboard shortcuts or buttons for quick tagging
- [ ] Serialize as prefixed comments: `{>>[tone] comment text<<}`

### LLM Integration
- [ ] LLM pre-edit: Claude proposes edits as CriticMarkup, human reviews in-editor (bidirectional workflow)
- [ ] AI comment suggestions: given the change + context, suggest annotation text
- [ ] Style rule extraction: analyze patterns across multiple CriticMarkup files to generate writing rules

### Platform Expansion
- [ ] **VSCode extension** — Phase 9 (see above; builds before Tauri)
- [ ] **macOS / Mac App Store** — Phase 8D–G (see above; after VSCode)
- [ ] **Android** — Tauri 2 supports Android; same `beforeinput` fix required as iOS; lower priority
- [ ] **iOS** — Tauri 2 supports iOS; requires resolving iOS input handling defect first (see Known Issues); currently infeasible due to virtual keyboard `keydown` unreliability
- [ ] **Windows / Linux** — Tauri cross-platform via GitHub Actions CI; non-priority
- [ ] Obsidian plugin (native integration into knowledge management ecosystem)
- [ ] Export to Google Docs (CriticMarkup → `.docx` with Word track changes)
- [ ] Diff fallback mode (alternative for users who prefer import-edit-diff workflow)
- [ ] Session library (history of editing sessions for longitudinal analysis)
- [ ] Multi-file projects
- [ ] Collaborative editing

---

## Non-Goals (Prototype)

These are explicitly out of scope per the PRD and should not creep into early phases:

- Collaborative editing
- Real-time sync / cloud storage
- Full markdown spec (tables, footnotes, math)
- Mobile-first design (responsive adaptation is in backlog — see Responsive Design — but mobile-first redesign remains out of scope)
- Multi-file projects
- In-app LLM calls
