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

---

## Up Next

### Phase 5: Annotation System
- [ ] Edit / Annotate mode toggle in toolbar
- [ ] Editor becomes read-only in Annotate mode
- [ ] Inline comment input in Changes Panel per change
- [ ] Tab → type → Enter → Tab rapid-annotation flow
- [ ] Comments serialize as `{>>…<<}` immediately after their change
- [ ] Comments re-import on "Resume editing"
- [ ] Orphaned comment handling (undo removes parent change)

### Phase 6: Session Persistence + Undo
- [ ] localStorage auto-save (debounced 1s)
- [ ] Session recovery prompt on app load
- [ ] Undo/redo at tracked-change level (undo deletion = restore to original, not re-insert)
- [ ] Mixed-span operations (select across original + inserted + deleted text)

### Phase 7: Responsive Design

Make the app usable across screen sizes without redesigning the desktop experience. The two-column layout with a fixed-width changes panel currently breaks below ~768px.

**Design principles:**
- Desktop layout (> 1024px) is the primary experience and must not regress
- Responsive behavior uses Tailwind breakpoint prefixes (`sm:`, `md:`, `lg:`), not custom media queries
- Changes panel becomes a toggle-able overlay/drawer on small screens, not a permanent column
- No new dependencies — Tailwind utilities and native CSS only

**Breakpoints:**
- `< 768px` (mobile): single-column, panel as slide-over drawer
- `768px–1024px` (tablet): single-column with wider drawer, or narrow persistent panel
- `> 1024px` (desktop): current two-column layout, no changes

#### Tier 1: Usable on Small Screens
Core layout changes that prevent the app from being broken on phones/tablets.

- [ ] **Collapsible changes panel** — hide panel by default below `lg:` (1024px); add a toggle button (e.g., badge with change count) to open as a slide-over drawer from the right
- [ ] **Single-column editor** — below `lg:`, editor takes full width; remove `flex` row layout and `w-80` constraint
- [ ] **Responsive toolbar** — stack or wrap toolbar items on narrow screens; ensure Import/Export buttons don't overlap the title
- [ ] **Export dropdown repositioning** — on small screens, anchor dropdown to viewport edge or use a bottom sheet instead of absolute `right-0`
- [ ] **Responsive padding** — reduce `p-6` outer padding to `p-3` or `p-4` on mobile
- [ ] **Source view** — already wraps text; verify horizontal scroll is usable on touch; reduce `max-h-96` if needed

#### Tier 2: Touch-Friendly
Improvements for finger-based interaction (phone, tablet without keyboard).

- [ ] **Tap target sizing** — ensure all buttons, change cards, and interactive elements meet 44×44px minimum
- [ ] **Import modal** — increase textarea height on mobile (or make it `flex-1` to fill available space); larger action buttons
- [ ] **Change card interaction** — change cards should have generous padding and clear active/pressed states for touch
- [ ] **Scroll-to behavior** — verify click-to-scroll works on touch; may need `scrollIntoView` with `behavior: 'smooth'` adjustment

#### Tier 3: Polish
Refinements that improve the feel but aren't blockers.

- [ ] **Responsive typography** — scale heading (`text-2xl` → `text-xl`) and body text for readability on small screens
- [ ] **Drawer animation** — slide-in/out transition for the changes panel drawer (CSS `translate-x` + `transition`)
- [ ] **Landscape phone layout** — test and handle landscape orientation where viewport is wide but very short
- [ ] **PWA viewport** — add `<meta name="viewport">` if missing; test pinch-zoom behavior doesn't break the editor
- [ ] **Keyboard avoidance** — on mobile, ensure the editor isn't obscured by the software keyboard when typing

**Scope notes:**
- This is not a mobile-first redesign — the goal is "doesn't break" (Tier 1), then "pleasant" (Tier 2), then "polished" (Tier 3)
- Editing on mobile with contentEditable is inherently limited (selection, cursor positioning, IME). Tier 1 makes reading and reviewing changes viable on mobile; serious editing remains a desktop activity
- The annotation workflow (Phase 5) should be designed responsive from the start, since reviewing changes is a realistic mobile use case

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

### About Panel
- [ ] Left slide-in overlay panel with app description, motivation, GitHub link, and credits
- [ ] Triggered by discrete info icon next to app title; closes via backdrop click or Escape
- [ ] Spec: `docs/about-panel.md`

### Editor Polish
- [ ] Paragraph-level deletions (CriticMarkup can't span paragraph boundaries)
- [ ] Paste handling: strip formatting vs. preserve markdown-compatible formatting
- [ ] Merge paragraphs (delete line break between them) — tracked change semantics
- [ ] Full markdown rendering in editor (headings, bold, italic, lists, code, links, blockquotes)
- [ ] Markdown ↔ rich text round-trip fidelity

### Source View Actions
- [ ] Paste-to-replace button: replace editor content with clipboard contents (no tracked deletions — rebaselines the document)
- [ ] Rebaseline button: accept all tracked changes in-place, clearing markup and producing a clean document

### Accept / Reject
- [ ] Accept/reject individual changes to produce a clean document
- [ ] Accept all / Reject all bulk operations

### Comment Categories (v1.5+)
- [ ] Pre-defined tags: `[tone]`, `[clarity]`, `[structure]`, `[grammar]`, `[concision]`, `[accuracy]`
- [ ] Keyboard shortcuts or buttons for quick tagging
- [ ] Serialize as prefixed comments: `{>>[tone] comment text<<}`

### Highlight Mode
- [ ] `{==highlighted text==}{>>comment<<}` for flagging passages without changing them

### Google Docs → CriticMarkup Extraction
- [ ] Take a Google Doc with track changes/comments and extract in CriticMarkup format
- [ ] TBD: shared componentry with the web app (e.g. import flow) or separate tool solving the same user need
- [ ] Research: Google Docs API for reading suggestions/comments vs. export-as-docx + pandoc + Lua filter pipeline
- [ ] Comments mapping: Google Docs comments → `{>>…<<}` (known to be lossy in the pandoc pipeline today)

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
