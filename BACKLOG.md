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

---

## Up Next

### Phase 3: Import / Export
- [ ] File import via file picker (`.md` → all content as original status)
- [ ] Paste import (textarea modal)
- [ ] CriticMarkup-aware re-import ("Resume editing" vs "Start fresh" prompt)
- [ ] Primary export: `.md` download with YAML frontmatter (`criticmark:` namespace)
- [ ] Secondary exports: clean/accepted, original/rejected, copy to clipboard

### Phase 4: Changes Panel
- [ ] Right sidebar listing all tracked changes by document position
- [ ] Change type icons + color coding (deletion/insertion/substitution)
- [ ] Context snippets (~10-15 words surrounding text)
- [ ] Change count + uncommented count in header
- [ ] Click-to-scroll: clicking a change scrolls editor to that location
- [ ] Filter toggle: All / Uncommented only

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

---

## Known Issues & Tech Debt

### Must verify (Phase 2 shipped without browser testing)
- [ ] Visual test: source view panel renders, expands/collapses, syntax colors look right on dark bg
- [ ] Functional test: make deletions, insertions, and substitutions → confirm CriticMarkup output is correct
- [ ] Copy button works (clipboard API requires HTTPS or localhost)
- [ ] Debounce feels right at 500ms (not laggy, not flickery)

### Serialization edge cases
- [ ] Substitution over text that already contains old deletions — old deletions emit as standalone `{--…--}` outside the `{~~…~~}`, which is semantically correct but may look odd
- [ ] Serializer only handles paragraphs and headings — lists, blockquotes, code blocks pass through without markdown prefixes
- [ ] `hardBreak` nodes within a paragraph are not emitted as `\n`
- [ ] No handling of `{>>comment<<}` yet (comments are Phase 5, but serializer will need updating)

### Naming cleanup
- [ ] `docs/prd.md` and `docs/project-context.md` still reference "CriticMark Editor" — update to "Markdown Feedback" when next editing those files

---

## Backlog (Unscheduled)

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
- [ ] Mobile optimization
- [ ] Collaborative editing

---

## Non-Goals (Prototype)

These are explicitly out of scope per the PRD and should not creep into early phases:

- Collaborative editing
- Real-time sync / cloud storage
- Full markdown spec (tables, footnotes, math)
- Mobile-first design
- Multi-file projects
- In-app LLM calls
