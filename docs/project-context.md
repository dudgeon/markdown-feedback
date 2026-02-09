# CriticMark Editor — Project Context & Decision Log

**For:** Any developer or PM picking up this project
**Date:** 2026-02-08
**Source:** Conversation between Geoff (product owner) and Claude exploring the problem space from first principles

---

## 1. How We Got Here

This project didn't start as "build an editor." It started as a question: **do protocols exist for tracking changes in markdown files with inline metadata like comments?**

### The exploration path

1. **CriticMarkup discovery.** The answer is CriticMarkup — a spec created by Brett Terpstra and Gabe Weatherhead that defines inline syntax for track changes in plain text: `{++insertions++}`, `{--deletions--}`, `{~~substitutions~~}`, `{>>comments<<}`. It's the only real standard for this. It has tooling support (Marked 2, iA Writer, MultiMarkdown Composer, pandoc via Lua filters) and LLMs like Claude understand it natively.

2. **Existing macOS tools.** We surveyed existing apps: Marked 2 (renderer/previewer, not an editor), iA Writer (has CriticMarkup syntax highlighting), MultiMarkdown Composer (supports it), VS Code with extensions. None of them *generate* CriticMarkup from natural editing — they all require the user to manually type the `{++` and `{--` tokens.

3. **LLM compatibility confirmed.** Claude can both read and produce CriticMarkup reliably. This matters because the end goal is a feedback loop: human edits LLM output → CriticMarkup captures what changed and why → Claude analyzes the pattern to learn writing style preferences.

4. **Google Docs workflow explored.** We investigated using Google Docs Suggesting Mode (which *does* automatically track changes) → export as `.docx` → pandoc `--track-changes=all` → CriticMarkup. Research showed that pandoc does NOT output CriticMarkup natively — it wraps changes in HTML `<span>` tags with classes like `.insertion` and `.deletion`. A Lua filter by Noam Ross (`criticmarkup.lua`, ~25 lines, stable since 2018) converts these to CriticMarkup. We also found `pandiff` (npm package) which diffs any two pandoc-supported files and outputs CriticMarkup directly. The Google Docs pipeline works but is 4 steps and lossy on comments.

5. **First PRD: diff-based architecture.** The initial PRD proposed: freeze a base document, edit a copy, continuously diff them, render the diff as CriticMarkup. Split-pane UI with textarea on left, rendered diff preview on right, CriticMarkup source below.

6. **Geoff's pushback — the critical insight.** Geoff rejected the diff approach because it's fundamentally a *viewer*, not an *editor*. The textarea + diff preview is what every existing tool already offers. The core need is: **"I need to select, delete, edit, etc. and have the CriticMarkup added."** This means the editor must intercept edit actions in real time, not compare snapshots after the fact. This is the Google Docs Suggesting Mode model, not the git diff model.

7. **Second PRD: intercept-based architecture.** Complete rewrite. The editor captures every keystroke as a tracked change: deletions become strikethroughs (not removed), insertions appear in green, select-and-replace becomes a linked substitution. The document IS the change log. No separate base and working copy.

### Why this matters for builders

The diff approach is tempting because it's simpler to implement (textarea + `jsdiff` + render). Resist it. The whole point of this tool is that the user edits naturally and the markup happens invisibly. If the user has to think about the tool at all, it has failed. The intercept approach is harder to build but is the only architecture that delivers the core value.

---

## 2. The End Goal: Writing Style Feedback Loop

The editor is not the end product — it's the **capture mechanism** for a larger system. The workflow Geoff is building:

```
LLM generates draft
    → Human edits in CriticMark Editor (changes captured as CriticMarkup)
    → Human annotates changes with reasoning (comments)
    → CriticMarkup file exported
    → Claude analyzes patterns across multiple files
    → Writing style rules extracted ("prefers active voice", "removes hedge words", etc.)
    → Rules fed back to Claude as a style guide for future drafts
    → Next LLM draft is better
    → Fewer edits needed
    → Repeat
```

This means:

- **The CriticMarkup output must be high-fidelity.** Every change matters. Lost changes = lost training signal.
- **Comments are the highest-value data.** The *what* (the change itself) is useful but the *why* (the comment) is what turns an edit into a learnable rule. The comment workflow needs to be fast enough that the user actually does it rather than skipping it.
- **Substitutions must be accurate.** If the user selected "was delivered by the team" and typed "the team delivered", that's a substitution — a deliberate rephrasing. The diff model might see this as a deletion + unrelated insertion. The intercept model captures the user's *intent*, which is exactly what the style-learning system needs.
- **The exported file must be portable.** It needs to work in Obsidian (Geoff's knowledge management system), be processable by pandoc/CLI tools, and be parseable by Claude. No proprietary formats, no HTML wrapping, no custom extensions beyond the CriticMarkup spec.

---

## 3. Key Design Decisions

### 3.1 Two discrete modalities (Edit vs. Annotate)

Geoff specified that editing and commenting are **separate cognitive tasks** that should not be interleaved. The user should be able to do a full editing pass focused purely on improving the text, then switch to a separate annotation pass focused on explaining their reasoning.

This is a deliberate UX choice, not a technical limitation. The rationale: when you're editing, you're in "writing brain" — you're thinking about word choice, rhythm, clarity. When you're annotating, you're in "meta brain" — you're thinking about *why* you made each choice. Forcing the user to context-switch between these on every edit would slow both activities.

**For implementers:** The annotation pass should feel like a rapid review workflow. Tab → type → Enter → Tab to cycle through uncommented changes. The user should be able to annotate 10-15 changes in under 2 minutes.

### 3.2 Markdown/Obsidian ecosystem compatibility

Geoff's personal knowledge management system is Obsidian-based (with a private GitHub repo, Cloudflare-hosted MCP server, and AI Search indexing — collectively called "home-brain" or "brainstem"). The exported CriticMarkup files need to be first-class citizens in this ecosystem.

Specific requirements:
- Standard `.md` file extension
- UTF-8 encoding, LF line endings
- YAML frontmatter under a `criticmark:` namespace (avoids collision with Obsidian's native frontmatter)
- No HTML, no custom syntax beyond CriticMarkup spec
- The CriticMarkup tokens are inert in standard markdown renderers (they show as literal text but don't break anything)
- The [Obsidian CriticMarkup plugin](https://github.com/Fevol/obsidian-criticmarkup) exists for visual rendering

### 3.3 No filesystem — import/export only

The app has no backend, no file system access, no cloud storage. Documents come in via import (file picker or paste) and go out via export (file download). Working state persists in localStorage between sessions.

This is a deliberate scoping decision for the prototype. It also means the app can be deployed as a static site, run as a local HTML file, or embedded in other contexts without infrastructure dependencies.

### 3.4 The editor surface must render markdown

The user should see headings as headings, bold as bold, italic as italic — not raw markdown syntax. This is a rich text editor that happens to use markdown as its serialization format, not a code editor with syntax highlighting.

The track-change styling (red strikethrough for deletions, green for insertions) is layered on top of the markdown rendering. Text can be both bold and deleted, for example.

### 3.5 Substitutions are captured by intent, not heuristic

In a diff-based system, you have to *guess* whether an adjacent deletion and insertion are a substitution. In the intercept model, you *know*: if the user selected text and typed a replacement, it's a substitution. If they deleted in one place and inserted in another, it's separate operations.

This distinction matters for the style-learning use case. "Changed passive to active voice" (substitution) is a different signal than "removed this sentence" (deletion) + "added a new sentence elsewhere" (insertion).

---

## 4. Technical Risk Areas

### 4.1 The intercept layer is the hard part

The core technical challenge is intercepting edit operations in a rich text editor and transforming them into tracked changes. Specifically:

- **Backspace/Delete on original text** must wrap the text in a deletion mark rather than removing it. This means preventing the default browser behavior and applying a custom transformation.
- **Typing in original text** must split the original span and insert a new insertion span. The cursor must end up inside the insertion span so continued typing extends it.
- **Select-and-replace across mixed spans** (e.g., selection covers original text, a deletion, and an insertion) must handle each span type correctly: original text → deletion, existing insertion → truly remove, existing deletion → leave as-is.
- **The cursor must skip over deletion spans** or at least make them non-editable. The user shouldn't be able to place their cursor inside deleted text and type.

**TipTap/ProseMirror** is the recommended framework because its `appendTransaction` plugin API lets you intercept and rewrite transactions before they're applied. ProseMirror marks can represent the change statuses, and the schema can enforce non-editability of deleted spans.

**If ProseMirror proves too complex**, a `contentEditable` div with `beforeinput` event handling is a viable fallback. The `beforeinput` event's `inputType` property (`deleteContentBackward`, `insertText`, `insertFromPaste`, etc.) maps directly to the intercept behaviors. But contentEditable is notoriously unpredictable across browsers, so expect edge cases.

**If both prove infeasible** for a rapid prototype, a textarea + diff approach can be used as a stepping stone — but this is explicitly a compromise on the core UX requirement and should be treated as a temporary scaffold, not the target architecture.

### 4.2 Markdown ↔ rich text round-tripping

The editor must convert markdown to a rich text DOM (for editing) and back to markdown (for serialization/export). This round-trip must be lossless — importing a markdown file and immediately exporting it should produce identical output (ignoring whitespace normalization).

TipTap has markdown extensions that handle common cases, but edge cases (nested lists, code blocks with markdown-like content, link titles with special characters) can cause drift. For the prototype, focus on the most common prose constructs: paragraphs, headings (h1-h3), bold, italic, unordered/ordered lists, inline code, links, and blockquotes. Tables, footnotes, math, and complex nesting can be punted to v2.

### 4.3 Undo/Redo semantics

Undo in a track-changes editor is conceptually different from undo in a normal editor:

- Normal editor: undo removes the last text change
- Track-changes editor: undo *reverts the last tracked change operation*

Example: user deletes a word → word becomes a deletion span (strikethrough). Undo should restore the word to original status (remove the strikethrough), not "un-delete" by inserting the word as new text.

ProseMirror's transaction-based undo may handle this naturally if the intercept layer is implemented as transaction transformations. But it needs testing — if the undo system sees "apply deletion mark" as the action, undoing it should be "remove deletion mark," which is correct. If it sees "prevent text removal + apply mark" as two separate steps, undo might only reverse the mark application without restoring the original transaction, which would be wrong.

### 4.4 Performance on long documents

The intercept model processes every keystroke. For short documents (under 2,000 words, which covers most LLM-generated drafts), this is fine. For longer documents, the serialization step (spans → CriticMarkup string for the source view) could become expensive. Debounce the source view update and consider lazy rendering of the Changes Panel (only render visible entries).

---

## 5. Reference Tools and Resources

### CriticMarkup ecosystem
- **Spec:** http://criticmarkup.com/spec.php
- **Marked 2** (macOS): Best CriticMarkup renderer — preview tool, not an editor. By Brett Terpstra.
- **iA Writer** (macOS): Has CriticMarkup syntax highlighting in the editor.
- **pancritic** (Python): CriticMarkup preprocessor for pandoc. https://github.com/ickc/pancritic
- **pandiff** (npm): Diffs any two pandoc-supported files, outputs CriticMarkup. https://github.com/davidar/pandiff
- **Noam Ross's Lua filter**: Converts pandoc's docx track-changes spans to CriticMarkup. ~25 lines, stable. https://gist.github.com/noamross/12e67a8d8d1fb71c4669cd1ceb9bbcf9
- **Obsidian CriticMarkup plugin**: https://github.com/Fevol/obsidian-criticmarkup

### Editor frameworks
- **TipTap 2**: https://tiptap.dev — ProseMirror-based, React-friendly, extensible
- **ProseMirror**: https://prosemirror.net — the underlying engine; lower-level but more control
- **Lexical** (Meta): https://lexical.dev — alternative to ProseMirror, may also work but has less ecosystem support for this use case

### Diffing libraries (reference only — not used in the intercept architecture, but useful for the CriticMarkup source view or future diff-fallback mode)
- **diff-match-patch** (Google): https://github.com/google/diff-match-patch
- **jsdiff**: https://github.com/kpdecker/jsdiff — word-level diffing mode

---

## 6. Geoff's Context

Geoff is a product manager building AI-augmented PM practices. He maintains a personal knowledge management system ("home-brain") as a private GitHub repo with Cloudflare-hosted infrastructure (R2 storage, AI Search indexing, MCP server called "brainstem") that makes his knowledge base accessible across Claude interfaces.

He's building a writing style feedback loop where:
1. LLMs generate drafts
2. He edits them, capturing the changes
3. The changes (and his reasoning) become training data for his personal style guide
4. The style guide improves future LLM output

This editor is the missing piece in step 2 — the capture mechanism. It needs to integrate with his Obsidian-based workflow and produce files that are useful both as human-readable documents and as machine-parseable training data.

He explicitly values tools that "disappear" — that let him focus on the work, not the tool. The editor should feel like editing, not like operating a change-tracking system.

---

## 7. What We Explicitly Decided Against

| Decision | What we rejected | Why |
|----------|-----------------|-----|
| Diff-based architecture | Freeze a base, edit a copy, diff them | Doesn't capture user intent; substitutions are guessed, not known; the editing UX feels like using a diff tool, not a writing tool |
| Google Docs + pandoc pipeline | Edit in Suggesting Mode, export .docx, convert with pandoc + Lua filter | Too many steps; comments don't map cleanly; not markdown-native; locks you into Google's ecosystem |
| Side-by-side editor layout | Original on left, edited on right, diff below | This is what every existing tool does; it's a viewer, not an editor; the user still has to edit in a plain surface with no change tracking |
| Textarea as the editing surface | Plain text editing with a rendered preview pane | Doesn't meet the core UX requirement: the user must be able to edit directly without seeing or thinking about markup |
| Manual CriticMarkup writing | Just type the `{++` and `{--` tokens yourself | Obviously — this is what we're trying to eliminate |
| Building an Obsidian plugin first | Implement directly in the user's knowledge management tool | Too tightly coupled for a prototype; web app is more portable and testable; Obsidian plugin is a v2 goal |

---

## 8. Open Questions for the Builder

1. **TipTap vs. raw contentEditable:** The PRD recommends TipTap but acknowledges it may be complex. The builder should spike the intercept plugin early (within the first day) to validate feasibility. If it's not working within a reasonable time, fall back to contentEditable + beforeinput.

2. **Cursor behavior around deletion spans:** Should the cursor skip over deleted text entirely (like Word's track changes), or should the user be able to arrow through it (read-only, can't edit, but can position cursor before/after)? The PRD says "skips over" but this may feel unnatural. Test with a real editing session.

3. **How to handle paste:** When the user pastes text over a selection of original content, this should create a substitution (delete selected + insert pasted). When pasting into empty space within original text, it's an insertion. What about pasting formatted text (from a web page, for example)? Should it strip formatting and paste as plain text, or preserve markdown-compatible formatting?

4. **Paragraph-level operations:** What happens when the user deletes an entire paragraph? The CriticMarkup spec says tags can't span paragraph boundaries. A whole-paragraph deletion should probably wrap the paragraph content in `{--...--}` without removing the paragraph structure. But what about merging paragraphs (deleting a line break between them)?

5. **The source view synchronization:** How tightly should the CriticMarkup source view track the editor? Real-time (every keystroke) is expensive. Debounced (500ms) is probably fine. Or should it be on-demand (user clicks "refresh" or expands the panel)?

6. **Session management edge cases:** What if the user imports a new file while an edited session exists? Warn and confirm? Auto-save the current session first? Allow multiple sessions in parallel (probably not for prototype)?

7. **Comment editing after the fact:** If the user adds a comment in Annotate mode, then switches back to Edit mode and changes the text they commented on (e.g., further refining a substitution), should the comment persist? Be flagged as potentially stale? The PRD says comments attach to span IDs, so they persist — but the comment might no longer make sense if the change has evolved.

---

## 9. Phase 3 Decisions: Import / Export

**Date:** 2026-02-08

### Scope narrowing

The PRD (§3.5–3.6) specifies file picker import, paste import, drag-and-drop, CriticMarkup detection with "Start fresh" vs "Resume editing" prompt, and session recovery from localStorage. Phase 3 narrowed this to:

1. **Paste-only import.** File picker and drag-and-drop deferred. Pasting markdown into a textarea modal is the primary import modality for now. This matches the actual workflow: copy from a Claude conversation or other tool, paste into the editor.

2. **Always parse CriticMarkup.** No "Start fresh" vs "Resume editing" prompt. When content is imported (via paste or on initial load), CriticMarkup tokens are always parsed and reconstructed as tracked changes. Rationale: simpler flow, and the planned "rebaseline" feature (accept all changes, clearing markup) handles the case where the user wants to start fresh from CriticMarkup content.

3. **No localStorage persistence.** Session recovery deferred to Phase 6. Phase 3 focuses on explicit import/export, not background persistence.

### Export variants

- **Primary:** CriticMarkup `.md` with YAML frontmatter (`criticmark:` namespace, `edit_date` + `changes_total`)
- **Clean (accepted):** Strip all CriticMarkup, apply all changes (keep insertions, remove deletions, resolve substitutions to new text)
- **Original (rejected):** Strip all CriticMarkup, reject all changes (remove insertions, restore deletions, resolve substitutions to old text)
- **Copy to clipboard:** Same CriticMarkup text as the source view

### Parser design

The CriticMarkup parser (`parseCriticMarkup.ts`) uses a single-pass regex approach. It tokenizes the string into typed segments (original, deletion, insertion) with nanoid IDs and `pairedWith` links for substitutions. Comments (`{>>…<<}`) are silently stripped (Phase 5 will add comment support). The segments are then converted to TipTap-compatible HTML via `criticMarkupToHTML()`, which TipTap's `parseHTML` rules reconstruct into ProseMirror marks with the correct attributes.

---

## 10. Phase 4 Decisions: Changes Panel

**Date:** 2026-02-08

### Layout change

The editor layout was refactored from a centered vertical stack (`max-w-4xl`) to a two-column layout (`max-w-7xl` with `flex`). Editor takes `flex-1` on the left, changes panel is fixed at `w-80` (~320px) on the right, source view spans full width below both.

### Change extraction

`extractChanges.ts` walks the ProseMirror doc tree using the same pattern as `serializeCriticMarkup.ts` — iterate blocks, collect segments with mark metadata, group by substitution pairing / adjacency. The key difference: it captures absolute ProseMirror positions (`from`/`to`) for scroll-to and extracts ~5 words of surrounding original text for context display.

### Scope narrowing

The PRD (§3.3) specifies uncommented change count, filter toggle (All / Uncommented only), and comment status per entry. These all depend on Phase 5 (Annotation System) and were deferred:

- **Uncommented count in header** → deferred to Phase 5
- **Filter toggle** → deferred to Phase 5
- **Comment status per entry** → deferred to Phase 5

### Scroll-to behavior

Click-to-scroll uses `editor.commands.setTextSelection({ from, to })` + `scrollIntoView()` + `focus()`. The browser's native selection highlight provides visual feedback. A pulse/glow decoration was considered but deferred — the selection highlight is sufficient for now.

---

## 11. Phase 7 Research: DOCX Import

**Date:** 2026-02-09

### The problem

Google Docs has a good "Suggesting" mode that captures proposed changes and lets authors add comments. When exported as `.docx`, these suggestions are preserved as standard OOXML tracked changes (`<w:ins>`, `<w:del>`) and comments are preserved as OOXML comment ranges. This makes `.docx` a reliable transport format for tracked edits from Google Docs into Markdown Feedback.

### Architecture decision: JSZip + DOMParser (not mammoth, not pandoc)

We evaluated several approaches:

| Approach | Verdict | Why |
|----------|---------|-----|
| **mammoth.js** (docx → HTML) | Rejected | Does not preserve tracked changes — silently accepts all and outputs "final" doc. The entire point of import is the tracked changes. |
| **pandoc via WASM** | Rejected | pandoc has excellent track-change support (`--track-changes=all` outputs CriticMarkup), but the WASM build is experimental, ~10+ MB, and unreliable in browsers. Can't work from GitHub Pages. |
| **`docx` npm package** | Rejected | Write-only library for creating .docx files. Cannot read/parse existing files. |
| **JSZip + fast-xml-parser** | Partially accepted | JSZip for ZIP extraction is correct. But fast-xml-parser (~35 KB) is unnecessary — the browser's built-in `DOMParser` handles OOXML's well-formed XML correctly with zero added bundle. |
| **JSZip + DOMParser** | **Accepted** | JSZip (~45 KB gzipped) extracts XML from the .docx ZIP. Browser-native `DOMParser` parses the XML. Custom walker converts OOXML → CriticMarkup markdown. Total new dependency: 1 package, ~45 KB. |

### Key insight: output is CriticMarkup, not a new format

The DOCX importer's output is a **CriticMarkup markdown string** — the same format as the paste import. This means the entire existing pipeline (`criticMarkupToHTML()` → TipTap `setContent()` → editor with tracked changes) works unchanged. No new editor logic, no new serialization, no new panel code. The docx importer is purely an input converter.

### Substitution detection is heuristic

OOXML has no explicit substitution element. A substitution appears as adjacent `<w:del>` + `<w:ins>` (same author, similar timestamp). The walker uses heuristics: same author + adjacent position → `{~~old~>new~~}`. Fallback (separate `{--...--}{++...++}`) is semantically correct CriticMarkup, just less compact.

### Comment-to-change attribution

OOXML comments anchor to text ranges via `<w:commentRangeStart>` / `<w:commentRangeEnd>`. When a comment range overlaps a tracked change, the comment is attributed to that change (`{++text++}{>>comment<<}`). When it anchors to plain text, it becomes a highlight (`{==text==}{>>comment<<}`). This maps directly to how Markdown Feedback already handles the two comment types.

### Phased build

Five phases (A through E) with increasing complexity. Phase A ignores tracked changes entirely and just produces clean markdown. Each subsequent phase adds one layer: tracked changes, then comments, then attribution, then polish. Full spec: `docs/docx-import.md`.
