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

- [ ] **Phase A:** Basic .docx → markdown (no tracked changes) — JSZip + DOMParser, file picker UI
- [ ] **Phase B:** Tracked changes → CriticMarkup (`{++…++}`, `{--…--}`, `{~~…~~}`)
- [ ] **Phase C:** Comments extraction from `word/comments.xml` → `{>>…<<}`
- [ ] **Phase D:** Comment-to-change attribution (comment on suggestion vs. comment on plain text)
- [ ] **Phase E:** Polish — lists, moves, hyperlinks, edge cases, lazy loading

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

### Serialization edge cases
- [ ] Substitution over text that already contains old deletions — old deletions emit as standalone `{--…--}` outside the `{~~…~~}`, which is semantically correct but may look odd
- [ ] Serializer only handles paragraphs and headings — lists, blockquotes, code blocks pass through without markdown prefixes
- [ ] `hardBreak` nodes within a paragraph are not emitted as `\n`
- [ ] No handling of `{>>comment<<}` yet (comments are Phase 5, but serializer will need updating)

### Naming cleanup
- [ ] `docs/prd.md` and `docs/project-context.md` still reference "CriticMark Editor" — update to "Markdown Feedback" when next editing those files

---

## Backlog (Unscheduled)

### Prominent Import Button (Default State)
- [ ] When the app loads with placeholder text (no locally saved session), style the Import button with primary coloring or heavy stroke to draw attention
- [ ] Should use an existing Tailwind/library style for visual consistency — prominent but not jarring
- [ ] Revert to normal button styling once user has imported content or started editing

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

### Keyboard Shortcuts in About Panel
- [ ] Add a "Keyboard Shortcuts" section to the About panel listing all user-facing shortcuts
- [ ] Include: Cmd+Shift+H (highlight), Tab (jump to comment input when on a change), Enter/Tab in comment input (save/return to editor)
- [ ] Keep in sync as new shortcuts are added

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
