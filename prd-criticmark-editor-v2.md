# CriticMark Editor — Product Requirements Document

**Version:** 0.2 (Intercept Architecture)
**Author:** Geoff + Claude
**Date:** 2026-02-08
**Build target:** Web app (React), portable to Claude Code or other implementations
**Revision note:** v0.2 is a fundamental rearchitecture from v0.1. The diff-based model (freeze a base, edit a copy, compare them) has been replaced with an intercept-based model where the editor captures every edit action as CriticMarkup in real time. This is the difference between a diff tool and a track-changes editor.

---

## 1. Problem Statement

When an LLM generates a draft document, the human editor needs to refine it — correcting tone, restructuring sentences, removing filler, sharpening arguments. Today this editing happens invisibly: the human rewrites in-place and the LLM's original is lost, along with all signal about *what* was changed and *why*.

This signal is the most valuable artifact in the editing process. A structured record of human corrections to LLM output, annotated with reasoning, is the raw material for building personal writing-style rules, prompt engineering feedback loops, and training datasets. No existing tool captures this signal in a portable, markdown-native format.

### Why existing tools fail

| Tool | Gap |
|------|-----|
| Google Docs Suggesting Mode | Captures changes perfectly but locks content in `.docx`; not markdown-native; export to CriticMarkup requires pandoc + Lua filter pipeline |
| Git diff / pandiff | Batch/after-the-fact; operates on lines not prose; no inline annotation; no real-time editing experience |
| CriticMarkup in a text editor | Manual — requires the human to *write* `{++` and `{--` syntax rather than just editing naturally |
| Word/LibreOffice Track Changes | Heavy tools for a lightweight need; not markdown-native; export is lossy |
| Side-by-side diff editors | Show changes after the fact; the user still edits in a separate surface and the diff is computed, not captured |

### What's needed

A track-changes editor — not a diff tool — where the human edits naturally and every action (delete, insert, replace) is captured as CriticMarkup *at the moment it happens*. Deleted text doesn't vanish; it becomes a visible strikethrough. New text appears visually distinct. The user never sees or writes CriticMarkup syntax — they just edit, and the markup writes itself. A separate annotation workflow lets the human explain *why* each change was made. The output is a single portable markdown file with inline CriticMarkup.

---

## 2. Core Concepts

### 2.1 The Intercept Model

This is the fundamental architectural concept. Rather than comparing two versions of a document after the fact, the editor **intercepts every edit action at the moment it occurs** and records it as CriticMarkup:

| User action | What happens in the document | What the user sees |
|-------------|-----------------------------|--------------------|
| Selects text and presses Delete/Backspace | Text is wrapped in `{--...--}` | Text appears as red strikethrough; it is not removed |
| Types new text | Text is wrapped in `{++...++}` | Text appears in green (or other insertion style) |
| Selects text and types replacement | Selected text becomes `{~~selected~>typed~~}` | Strikethrough of old + green of new, inline |
| Types within existing unchanged text | Insertion marker wraps the new characters | Green text appears at the cursor position |

The document is always a single artifact containing both the original content and all tracked changes. There is no separate "frozen base" and "working copy" — the document *is* the change log.

This is exactly how Google Docs Suggesting Mode works, transposed to markdown and CriticMarkup.

### 2.2 The Document Model

The editor maintains a rich document model where every span of text has a **status**:

- **Original:** unchanged text from the imported document. Editable (editing it creates new tracked changes). Rendered normally.
- **Deleted:** text the user removed. Not editable (it's a historical record). Rendered as red strikethrough. Serializes as `{--text--}`.
- **Inserted:** text the user added. Editable (the user can continue refining their insertion). Rendered in green/distinct style. Serializes as `{++text++}`.
- **Substitution:** a paired deletion + insertion at the same location. The deletion is not editable; the insertion is. Serializes as `{~~old~>new~~}`.

This status is tracked per-span in the editor's internal model (e.g., as ProseMirror marks or custom DOM attributes) and is invisible to the user except through visual styling.

### 2.3 Two Discrete Modalities

Editing and commenting remain separate activities:

**Mode 1 — Edit:** The user focuses purely on improving the text. They select, delete, type, rephrase, restructure. Every action is captured as a tracked change with appropriate visual styling. The user's experience is "I'm editing a document" — the track-changes behavior is ambient, not modal. The changes panel is visible but passive (showing a live tally and list of changes, but not demanding interaction).

**Mode 2 — Annotate:** The user reviews the accumulated changes and adds comments explaining their reasoning. The editor surface becomes read-only (or de-emphasized). The changes panel becomes the primary interaction surface, highlighting uncommented changes and providing input fields for annotations. Clicking a change scrolls to it in the editor and focuses the comment input.

The key constraint: **commenting never interrupts editing.** These are separate cognitive tasks performed in separate passes.

### 2.4 The CriticMarkup Document

The document is the source of truth. At all times, the editor's internal state can be serialized to a valid CriticMarkup markdown file. This file is:

- The export format (what the user downloads)
- The persistence format (what's saved to localStorage)
- The import format (a previously exported file can be re-opened with all changes and comments intact)
- Valid markdown (CriticMarkup degrades gracefully — tokens are visible but don't break rendering)
- Compatible with Obsidian, Marked 2, iA Writer, pandoc, and any CriticMarkup-aware tool
- Parseable by LLMs (Claude understands CriticMarkup natively)
- Diffable in git (it's just text)

---

## 3. User Interface

### 3.1 Layout Overview

```
┌─────────────────────────────────────────────────────────────┐
│  [Import]  [Export ▾]  [Undo] [Redo]   Edit ◉ | Annotate ○ │
├────────────────────────────────────┬────────────────────────┤
│                                    │  Changes Panel         │
│  Editor Surface                    │                        │
│                                    │  12 changes            │
│  The quick brown fox jumped        │  4 uncommented  [▾All] │
│  over the {--lazy--}{++sleeping++} │                        │
│  dog. {++It was a warm day.++}     │  ┌──────────────────┐  │
│                                    │  │ ✎ "lazy" → "sle… │  │
│  (user sees styled text,          │  │   🔴 No comment   │  │
│   not the markup syntax)          │  ├──────────────────┤  │
│                                    │  │ + "It was a war…  │  │
│                                    │  │   🔴 No comment   │  │
│                                    │  └──────────────────┘  │
│                                    │                        │
├────────────────────────────────────┴────────────────────────┤
│  ▸ CriticMarkup Source (collapsed)                [Copy 📋] │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Editor Surface (Left/Main Pane)

A single, directly-editable surface. This is where the user does their work.

**Visual rendering of tracked changes:**

- **Original (unchanged) text:** rendered as normal prose. Standard markdown rendering applies (headings, bold, italic, lists, etc.).
- **Deleted text:** red text with strikethrough. Not selectable for editing (cursor skips over it, like tracked deletions in Word). Still visible so the user sees what was changed.
- **Inserted text:** green text with a subtle background tint or underline. Fully editable — the user can continue refining their additions.
- **Substitutions:** displayed as adjacent deletion (red strikethrough) + insertion (green), with a subtle visual connector (e.g., thin arrow or bridge) to show they're paired.

**Edit behaviors (the intercept layer):**

| Action | Behavior |
|--------|----------|
| Type in original text | Splits the original span; new characters become an insertion span between the two halves |
| Delete/backspace in original text | Wraps the removed character(s) in a deletion span (text becomes strikethrough, not removed) |
| Select original text + delete | Entire selection becomes a deletion span |
| Select original text + type | Selection becomes a substitution: `{~~selected~>typed~~}` |
| Type in an existing insertion | Characters are added to the insertion span (extending it) |
| Delete within an insertion | Characters are truly removed (no tracking — it's your own addition) |
| Delete a deletion span | "Undo" the deletion — restore the text to original status |
| Select across mixed spans + delete | Each span type handled appropriately: original text → marked as deleted; inserted text → truly removed; existing deletions → left as-is |

**Keyboard shortcuts:**
- Standard editing: all normal text editing keys work as expected (with intercept behavior above)
- Undo/Redo: operates on the tracked-change level (undo a deletion = restore the text to original, not re-insert it as new)
- Cmd+Z / Ctrl+Z: undo last action
- No CriticMarkup-specific shortcuts needed — the point is that editing is completely natural

**In Annotate Mode:**
- The editor surface is **read-only**
- Clicking anywhere in the editor that corresponds to a tracked change highlights it and selects the corresponding entry in the Changes Panel
- A subtle comment icon appears in the margin next to changes that have comments

### 3.3 Changes Panel (Right Pane)

A scrollable list of all tracked changes, ordered by position in the document.

**Each change entry shows:**

- **Change type icon and color:**
  - 🔴 Deletion (red): shows the deleted text
  - 🟢 Insertion (green): shows the inserted text
  - 🔵 Substitution (blue/purple): shows old → new
- **Context snippet:** ~10-15 words of surrounding unchanged text with the change highlighted inline, so the user can identify which change this is without switching to the editor
- **Comment status and interaction:**
  - **Uncommented:** visually prominent (e.g., warm background, pulsing dot, or bold border). In Annotate Mode, clicking opens an inline text input.
  - **Commented:** muted style. Comment text shown below the change snippet (expandable if long). Clicking allows editing the comment.

**Panel header:**
- Change count: "12 changes"
- Uncommented count: "4 uncommented" (visually distinct, acts as a progress indicator)
- Filter toggle: All / Uncommented only
- Optional: "Annotate all" button that enters Annotate Mode and focuses the first uncommented change

**Interaction:**
- Clicking a change in the panel scrolls the editor to that change and highlights it with a temporary pulse/glow
- In Annotate Mode, the panel is the primary interaction surface — Tab/Enter navigation between uncommented changes for rapid annotation
- In Edit Mode, the panel is passive/informational (no comment inputs shown)

### 3.4 CriticMarkup Source View (Bottom Pane, Collapsible)

- Shows the complete document as raw markdown with CriticMarkup syntax, serialized from the editor's internal state
- Read-only
- Syntax-highlighted: CriticMarkup tokens in distinct colors matching the editor styling
- Updates live as the user edits
- Copy-to-clipboard button
- Collapsed by default to save space; expandable via toggle

### 3.5 Import

**File import:**
- Accepts a `.md` file via file picker or drag-and-drop
- All content is loaded as **original** status (fully editable, no tracked changes yet)
- If the file contains existing CriticMarkup syntax: prompt the user with two options:
  - **"Start fresh"** — treat CriticMarkup tokens as literal text (the base document happens to contain CriticMarkup syntax). All text is original status.
  - **"Resume editing"** — parse CriticMarkup tokens into their respective span types (deletions, insertions, substitutions, comments). This restores a previous editing session from an exported file.

**Paste import:**
- A "Paste markdown" button or modal with a textarea for quick loading without a file
- Content is loaded as original status (no CriticMarkup parsing)

**Session recovery:**
- On app load, if a previous session exists in localStorage, prompt: "Resume your previous session or start fresh?"
- Resume restores the full editor state (all spans with their statuses, all comments)

### 3.6 Export

**Primary export: `.md` file download**
- The CriticMarkup document as shown in the source view
- YAML frontmatter with session metadata (namespaced to avoid conflicts):

```yaml
---
criticmark:
  edit_date: 2026-02-08T14:30:00Z
  changes_total: 12
  changes_commented: 8
  changes_uncommented: 4
---
```

- Filename: `{original-filename}-edited.md` or user-specified

**Secondary exports (via Export dropdown):**
- **"Clean (accepted)" export:** Strips all CriticMarkup, applying changes — insertions are kept, deletions are removed, substitutions resolve to the new text. Produces a clean `.md` file representing the edited version.
- **"Original (rejected)" export:** Strips all CriticMarkup, rejecting changes — insertions are removed, deletions are restored, substitutions resolve to the old text. Produces the original document.
- **Copy CriticMarkup to clipboard:** For pasting into another tool or into a Claude conversation.

---

## 4. Editor Architecture: The Intercept Layer

### 4.1 Core Concept

The intercept layer sits between the user's input (keyboard/mouse events) and the editor's document model. It transforms standard editing operations into tracked-change operations.

This is not a diff. It is an event-driven transformation that operates on individual edit actions as they occur.

### 4.2 Document Model

The document is modeled as an ordered sequence of **spans**, where each span has:

```typescript
interface Span {
  id: string;           // Unique identifier for this span
  text: string;         // The text content
  status: SpanStatus;   // 'original' | 'deleted' | 'inserted'
  
  // For substitutions: a deleted span and an inserted span are
  // linked as a pair. This is a display/export concern, not a
  // separate status — internally it's still a deletion + insertion.
  pairedWith?: string;  // ID of the paired span (deletion ↔ insertion)
  
  // Annotation
  commentId?: string;   // Reference to a comment, if one exists
}

type SpanStatus = 'original' | 'deleted' | 'inserted';
```

**Substitutions** are not a distinct span status. They are an adjacent `deleted` span and `inserted` span that are linked via `pairedWith`. At export time, linked pairs are serialized as `{~~old~>new~~}` rather than `{--old--}{++new++}`. This keeps the internal model simple while producing clean CriticMarkup output.

**The document at any point is a flat array of spans.** Markdown structure (headings, lists, formatting) exists within span text content. The span model tracks *change status*, not document structure.

### 4.3 Intercept Behaviors (Detailed)

**Deletion of original text (Backspace/Delete key or selection + delete):**

```
Before: [original: "The lazy dog"]
User selects "lazy " and presses Delete
After:  [original: "The "] [deleted: "lazy "] [original: "dog"]
```

The deleted span is rendered as strikethrough. The text is not removed from the document. Cursor is placed after the deleted span.

**Insertion of new text (typing):**

```
Before: [original: "The dog"]  (cursor between "The " and "dog")
User types "big "
After:  [original: "The "] [inserted: "big "] [original: "dog"]
```

If the cursor is already inside an existing inserted span, new characters extend that span (no new span created).

**Substitution (select original + type):**

```
Before: [original: "The lazy dog"]
User selects "lazy" and types "sleeping"
After:  [original: "The "] [deleted: "lazy", pairedWith: "s1"] 
        [inserted: "sleeping", pairedWith: "d1", id: "s1"] [original: " dog"]
```

Rendered as: "The ~~lazy~~ sleeping dog" (strikethrough + green).

**Editing within an insertion:**

```
Before: [original: "The "] [inserted: "bigg"] [original: " dog"]
User presses Backspace (cursor at end of "bigg")
After:  [original: "The "] [inserted: "big"] [original: " dog"]
```

Changes to inserted text are **not tracked** — the user is editing their own addition. Characters are truly added/removed. If the user deletes an entire insertion, the span is removed entirely.

**Undoing a deletion (deleting a deleted span):**

If the user places the cursor adjacent to a deleted span and takes an action that would "remove" the deletion marker (to be determined — perhaps a specific gesture or toolbar button, or perhaps selecting the strikethrough text and pressing Delete), the deleted span reverts to original status.

For the prototype, this can be handled by Undo (Cmd+Z) rather than a direct gesture.

### 4.4 Span Merging and Splitting

To keep the span array manageable:

- **Adjacent spans of the same status are merged:** If an insertion is immediately followed by another insertion (e.g., from continuous typing), they merge into one span.
- **Original spans split on edit:** When the user inserts text in the middle of an original span, the original span splits into two, with the insertion between them.
- **Empty spans are removed:** If editing reduces a span's text to empty string, the span is deleted from the array.

### 4.5 Undo/Redo

Undo operates on tracked-change operations, not raw text edits:

- Undo a deletion → the deleted span reverts to original status (merged back with adjacent original spans)
- Undo an insertion → the inserted span is removed entirely
- Undo a substitution → the deleted span reverts to original; the inserted span is removed

This requires maintaining an undo stack of operations (not just text snapshots). Each operation records the span changes it caused, and undo reverses them.

For the prototype, the editor framework's built-in undo (ProseMirror/TipTap transaction-based undo) may handle this natively if the intercept layer is implemented as editor transactions.

### 4.6 Implementation Approach

**Recommended: TipTap (ProseMirror-based)**

TipTap/ProseMirror provides the right primitives:

- **Marks** can represent span statuses (a "deleted" mark, an "inserted" mark)
- **Input rules and plugins** can intercept edit operations before they mutate the document
- **Decorations** handle the visual rendering (strikethrough, colors)
- **Transaction-based undo** can be extended to operate on tracked-change semantics
- **Schema** can enforce the rules (e.g., deleted marks are not editable)

The intercept layer would be implemented as a ProseMirror plugin that:
1. Listens to transactions (every document mutation)
2. Examines what the transaction would do (delete range, insert text, replace)
3. Transforms the transaction into tracked-change operations (wrap deleted text in a mark rather than removing it, wrap inserted text in a mark, etc.)
4. Applies the transformed transaction

**Fallback: contentEditable with custom input handling**

If TipTap proves too complex for the prototype, a `contentEditable` div with:
- `beforeinput` event listeners to intercept edit operations
- Custom DOM manipulation to wrap text in styled spans
- A serialization layer to convert DOM → CriticMarkup string

This is more fragile but faster to prototype. The `beforeinput` event provides `inputType` (insertText, deleteContentBackward, deleteContentForward, insertFromPaste, etc.) which maps directly to the intercept behaviors described above.

---

## 5. Comments System

### 5.1 Architecture

Comments are **annotations on tracked changes**, not freestanding entities. Every comment is attached to exactly one change (one deletion, insertion, or substitution pair). Comments do not exist without a parent change.

```typescript
interface Comment {
  id: string;
  changeSpanId: string;   // The span (or substitution pair) this comment is about
  text: string;           // The user's annotation
  createdAt: string;      // ISO datetime
  updatedAt: string;      // ISO datetime
}
```

### 5.2 Comment Stability

Because the intercept model creates persistent spans with stable IDs (unlike the diff model where changes are recomputed), comments are inherently stable. A comment references a specific span that exists in the document model. As long as the span exists, the comment persists.

**When do spans disappear?**
- The user undoes the change → the span reverts to original → the comment is orphaned
- The user deletes all text in an insertion → the span is removed → the comment is orphaned

**Handling orphaned comments:** Orphaned comments should be preserved in a "detached comments" list and surfaced to the user with a notice: "This comment was attached to a change that no longer exists." The user can dismiss or reassign it.

For the prototype, orphaned comments can simply be discarded on undo — acceptable given that undo is a deliberate reversal.

### 5.3 Comment Workflow (Annotate Mode)

1. User switches to Annotate Mode (toolbar toggle)
2. The editor surface becomes read-only
3. The Changes Panel highlights the first uncommented change
4. User clicks on a change (in the panel or in the editor)
5. An inline text input appears in the Changes Panel below the change snippet
6. User types their reasoning: "Passive voice weakened the point; active is more direct"
7. Presses Enter (or clicks Save) → comment is saved
8. Focus automatically advances to the next uncommented change (Tab also advances)
9. User can press Escape or click away to skip a change without commenting
10. The panel header updates: "12 changes, 3 uncommented"

**Quick-annotation flow:** The Tab → type → Enter → Tab cycle should be fast enough that annotating 10-15 changes takes under 2 minutes. This is the annotation equivalent of touch-typing — the UI should not be in the way.

### 5.4 Comment Categories (Optional, v1.5+)

For future versions, comments could support category tags selectable via keyboard shortcuts or buttons:

- `[tone]` — the change addresses voice, formality, or emotional register
- `[clarity]` — the change improves comprehension or reduces ambiguity
- `[structure]` — the change reorganizes information flow
- `[grammar]` — the change corrects a grammatical error
- `[concision]` — the change removes unnecessary words
- `[accuracy]` — the change corrects factual content

Categories would serialize as prefixed comments: `{>>[tone] Passive voice weakened the point<<}`

For the prototype, freeform text comments are sufficient.

### 5.5 Serialization

At export time, comments are serialized as `{>>comment text<<}` immediately following the change they annotate:

```markdown
The team {~~delivered the results~>presented their findings~~}{>>active voice is more direct<<} to the board.
```

On re-import ("Resume editing"), the parser extracts `{>>...<<}` tokens and reattaches them to the preceding change span.

---

## 6. Data Model

### 6.1 Internal State

```typescript
interface EditorState {
  // The document: an ordered array of spans
  spans: Span[];
  
  // Comments, keyed by the span ID they annotate
  comments: Map<string, Comment>;
  
  // UI state
  mode: 'edit' | 'annotate';
  selectedChangeId: string | null;
  sourceViewExpanded: boolean;
  changeFilter: 'all' | 'uncommented';
  
  // Session metadata
  originalFilename: string | null;
  sessionStartedAt: string;
  
  // Undo stack
  undoStack: Operation[];
  redoStack: Operation[];
}

interface Span {
  id: string;
  text: string;
  status: 'original' | 'deleted' | 'inserted';
  pairedWith?: string;   // For substitution linking
  commentId?: string;    // Shortcut reference
}

interface Comment {
  id: string;
  spanId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

interface Operation {
  type: 'delete' | 'insert' | 'substitute' | 'edit-insertion' | 'revert';
  spansBefore: Span[];   // Affected spans before the operation
  spansAfter: Span[];    // Affected spans after the operation
}
```

### 6.2 Serialization to CriticMarkup

The spans array serializes to a CriticMarkup string by walking the array in order:

```
for each span:
  if status == 'original':  emit span.text
  if status == 'deleted':
    if span.pairedWith exists (substitution):
      emit "{~~" + span.text + "~>" + pairedSpan.text + "~~}"
      skip the paired inserted span when we reach it
    else:
      emit "{--" + span.text + "--}"
  if status == 'inserted' and not part of a substitution:
    emit "{++" + span.text + "++}"
  
  if span has a comment:
    emit "{>>" + comment.text + "<<}"
```

### 6.3 Deserialization from CriticMarkup

Parsing a CriticMarkup string back into spans:

```
Regex scan for CriticMarkup tokens:
  {--text--}         → Span(status: deleted, text: "text")
  {++text++}         → Span(status: inserted, text: "text")
  {~~old~>new~~}     → Span(status: deleted, text: "old", pairedWith: insertId) 
                       + Span(status: inserted, text: "new", pairedWith: deleteId)
  {>>comment<<}      → Comment attached to preceding change span
  {==text==}         → (v2: highlight span)
  Everything else    → Span(status: original, text: "...")
```

### 6.4 Persistence

- **Storage:** localStorage, keyed by session ID
- **Format:** JSON containing the serialized CriticMarkup string + comments map + metadata. Using the CriticMarkup string (rather than the spans array) ensures the stored format is the same as the export format, simplifying debugging and recovery.
- **Auto-save:** on every change, debounced 1 second
- **Recovery:** on load, check for existing session in localStorage; prompt to resume or start fresh

### 6.5 Deriving the "Original" and "Edited" Documents

From the spans array, two clean documents can be derived at any time:

**Original (reject all changes):**
- Include: original spans, deleted spans (restored)
- Exclude: inserted spans
- For substitutions: include the old text, exclude the new

**Edited (accept all changes):**
- Include: original spans, inserted spans
- Exclude: deleted spans
- For substitutions: include the new text, exclude the old

These are used for the secondary export options.

---

## 7. CriticMarkup Specification Compliance

### 7.1 Syntax Reference

Per the [CriticMarkup spec](http://criticmarkup.com/spec.php):

| Operation | Syntax | Example |
|-----------|--------|---------|
| Addition | `{++text++}` | `This is {++very ++}good.` |
| Deletion | `{--text--}` | `This is {--not --}good.` |
| Substitution | `{~~old~>new~~}` | `This is {~~good~>great~~}.` |
| Comment | `{>>text<<}` | `This is great.{>>Is it though?<<}` |
| Highlight | `{==text==}{>>comment<<}` | `This is {==great==}{>>needs citation<<}.` |

### 7.2 Rules

- CriticMarkup tags **cannot span paragraph boundaries** (per spec). The editor must enforce this: if a deletion selection spans paragraphs, it must be split into per-paragraph deletion spans.
- CriticMarkup tags **can nest markdown formatting** (`{++**bold addition**++}` is valid).
- Comments (`{>><<}`) immediately follow the change they annotate, no whitespace between.
- Substitutions are used when an adjacent deletion and insertion are semantically linked (user selected text and typed a replacement). Separate deletion and insertion at different positions remain as separate `{--...--}` and `{++...++}` tokens.

### 7.3 Obsidian Compatibility

- Obsidian does not natively render CriticMarkup, but the syntax is inert — it won't break rendering, just shows as literal text with the `{++`, `{--` tokens visible
- The [Obsidian CriticMarkup plugin](https://github.com/Fevol/obsidian-criticmarkup) provides visual rendering
- Frontmatter under a `criticmark:` namespace avoids collisions with Obsidian's native frontmatter
- Exported files use standard markdown line endings (LF) and UTF-8 encoding

---

## 8. Technical Architecture

### 8.1 Recommended Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | React | Component-driven, good state management |
| Editor | TipTap 2 (ProseMirror) | Best primitives for intercept model: marks, plugins, transaction rewriting, schema constraints |
| Markdown parsing | `markdown-it` or `remark` | For initial import (markdown → editor state) and the source view |
| CriticMarkup parsing | Custom (regex-based) | CriticMarkup is simple enough that a custom parser is preferable to a dependency |
| Styling | Tailwind CSS | Rapid prototyping |
| Storage | localStorage | No backend needed |
| Build | Vite | Fast iteration |

### 8.2 TipTap/ProseMirror Implementation Notes

**Custom marks for change tracking:**
```
- `tracked-deletion`: Applied to deleted text. Non-editable (using ProseMirror's `inclusive: false` and a node decoration that prevents cursor entry). Red strikethrough styling.
- `tracked-insertion`: Applied to inserted text. Editable. Green text styling.
```

**The intercept plugin:**
A ProseMirror plugin that uses `appendTransaction` to transform edit transactions:
1. Detect what the incoming transaction does (delete range, insert text, replace)
2. If the affected range contains original (unmarked) text:
   - For deletions: instead of removing, apply `tracked-deletion` mark
   - For insertions: apply `tracked-insertion` mark to new text
   - For replacements: apply `tracked-deletion` to old text + `tracked-insertion` to new text (linked as substitution)
3. If the affected range is within a `tracked-insertion` span: allow the edit to proceed normally (user is editing their own insertion)
4. Return the transformed transaction

**Schema constraints:**
- `tracked-deletion` marks exclude other marks (deleted text can't be reformatted)
- `tracked-deletion` content is non-editable (input at a position immediately before/after a deletion span creates an insertion, not a modification of the deletion)

### 8.3 Prototype Simplifications

If the TipTap intercept plugin proves too complex for a rapid prototype:

**Alternative: contentEditable + beforeinput**
1. Render the document as a `contentEditable` div with spans for each change status
2. Listen to `beforeinput` events
3. For `deleteContentBackward`, `deleteContentForward`, `deleteByDrag`: prevent default, apply deletion wrapping via DOM manipulation
4. For `insertText`, `insertFromPaste`: check cursor position, wrap in insertion span if in original text
5. Serialize DOM → CriticMarkup string on each change

This is more fragile (contentEditable is famously unpredictable) but gets a working prototype faster.

**Alternative: Textarea + diff (simplified v0.1 approach)**
As a last resort, a textarea for editing + diff algorithm could serve as a stepping stone, but this is explicitly not the desired UX. Use only if the intercept approaches prove infeasible within the prototype timeline.

### 8.4 Markdown Rendering

The editor surface needs to render markdown, not just plain text. The user should see headings as headings, bold as bold, etc.

**For TipTap:** TipTap natively supports rich text. The initial import converts markdown → ProseMirror document (using a markdown parser extension). The tracked-change marks are orthogonal to formatting marks — text can be both bold and deleted.

**Markdown export:** The serializer walks the ProseMirror document tree and emits markdown with CriticMarkup tokens at the appropriate positions.

---

## 9. Workflow Walkthrough

### 9.1 Starting a Session

1. User opens the app
2. If a previous session exists: prompt to resume or start fresh
3. User clicks **Import** → selects a `.md` file
4. The document loads in the editor with all text as original (normal rendering, no tracked changes)
5. Changes Panel shows: "0 changes"
6. User begins editing

### 9.2 Editing

1. User reads through the LLM-generated text
2. User selects "was delivered by the team" and types "the team delivered"
3. The editor shows: ~~was delivered by the team~~ **the team delivered** (strikethrough + green, inline)
4. Changes Panel updates: "1 change, 1 uncommented"
5. User continues editing — deleting a redundant sentence, adding a clarifying phrase, rewording a weak transition
6. Each edit is captured instantly as a tracked change
7. The CriticMarkup source view (if expanded) shows the markup accumulating in real time
8. Auto-save fires in the background

### 9.3 Annotating

1. User finishes an editing pass and switches to **Annotate Mode**
2. The editor becomes read-only
3. Changes Panel shows: "8 changes, 8 uncommented"
4. The first uncommented change is highlighted in the panel and the editor scrolls to it
5. User reads the change in context: ~~was delivered by the team~~ **the team delivered**
6. User clicks into the comment input and types: "Active voice is more direct and attributes action clearly"
7. Presses Enter → comment saved
8. Focus advances to the next uncommented change: a deleted sentence
9. User types: "This repeated the point made in paragraph 2; removed for concision"
10. Continues through all changes. Tab/Enter flow makes this fast.
11. Panel shows: "8 changes, 0 uncommented" ✓

### 9.4 Exporting

1. User clicks **Export** → **CriticMarkup (.md)**
2. File downloads as `draft-edited.md`
3. Contents:

```markdown
---
criticmark:
  edit_date: 2026-02-08T14:30:00Z
  changes_total: 8
  changes_commented: 8
  changes_uncommented: 0
---

# Project Update

The results {~~were delivered by the team~>the team delivered~~}{>>Active voice is more direct and attributes action clearly<<} at the quarterly review.

{--This was a significant milestone in the project's ongoing development trajectory.--}{>>Repeated the point made in paragraph 2; removed for concision<<}
```

4. User opens this file in Obsidian → sees the CriticMarkup tokens inline
5. User feeds this file to Claude → Claude analyzes the pattern of edits to learn the user's writing preferences

### 9.5 Resuming a Previous Session

1. User imports a previously exported CriticMarkup `.md` file
2. App detects CriticMarkup tokens
3. Prompt: "Resume editing (restore changes and comments) or start fresh?"
4. User selects "Resume editing"
5. Parser reconstructs: original spans (from text outside CriticMarkup + restored deletions), deleted spans, inserted spans, substitution pairs, comments
6. Editor loads with all tracked changes visible and all comments attached
7. User can continue editing (new changes are tracked) or export again

---

## 10. Non-Goals (Prototype)

- **Collaborative editing** — single user only
- **Real-time sync** — no backend, no cloud storage
- **Full markdown spec support** — tables, footnotes, math blocks may render as plain text; focus is on prose (paragraphs, headings, lists, inline formatting)
- **Accept/reject individual changes** — the prototype captures changes; merge workflow is v2
- **LLM integration** — no in-app Claude calls; the CriticMarkup output is designed to be used externally
- **Multi-file projects** — one document per session
- **Mobile optimization** — desktop-first
- **Highlight mode** — `{==highlight==}` is v2
- **Comment categories** — freeform text only for prototype
- **Merge/conflict resolution** — if two changes overlap or interact, the prototype does not need to resolve this; the user can undo and redo

---

## 11. Success Criteria

The prototype is successful if:

1. **Editing feels natural.** The user can select, delete, type, and replace text without thinking about CriticMarkup. The intercept behavior is invisible — it just works like any text editor, except deletions become strikethroughs instead of vanishing.
2. **Every edit is captured.** No change is lost. The exported CriticMarkup file accurately reflects every deletion, insertion, and substitution.
3. **Annotation is fast.** The Tab → type → Enter flow for commenting on changes takes under 2 minutes for a typical editing session (10-15 changes).
4. **Round-trip works.** An exported file can be re-imported to resume editing with all changes and comments intact.
5. **The output is portable.** The exported `.md` file opens in Obsidian, renders in Marked 2, parses correctly with pandoc, and is understood by Claude.
6. **The tool disappears.** The user thinks about their edits and their writing, not about the tool.

---

## 12. Future Directions

- **Accept/reject UI:** Let the user accept or reject individual changes to produce a clean document
- **Style rule extraction:** Analyze patterns across multiple CriticMarkup files to auto-generate writing style rules
- **LLM pre-edit:** Claude proposes edits as CriticMarkup, human reviews in the same editor — bidirectional workflow
- **Obsidian plugin:** Native integration into the knowledge management ecosystem
- **Comment categories:** Pre-defined tags for rapid classification of changes
- **Session library:** Maintain a history of editing sessions for longitudinal analysis
- **Diff fallback mode:** For users who prefer the import-edit-diff workflow, offer it as an alternative mode that uses the same UI but computes changes via diff rather than interception
- **Custom highlight mode:** `{==text==}{>>comment<<}` for marking passages to keep or flag without changing them
- **Export to Google Docs:** Convert CriticMarkup to `.docx` with Word track changes for sharing with non-markdown users
- **AI comment suggestions:** Given the change and context, suggest a comment explaining the reasoning (meta: Claude explaining why the human changed Claude's writing)

---

## 13. Appendix

### A. CriticMarkup Quick Reference

```
Addition:       {++inserted text++}
Deletion:       {--removed text--}
Substitution:   {~~original~>replacement~~}
Comment:        {>>This is a comment<<}
Highlight:      {==highlighted text==}{>>optional comment<<}
```

### B. Reconstructing Documents from CriticMarkup

**Accept all (produce edited version):**
- Keep text outside markup as-is
- `{++text++}` → keep `text`
- `{--text--}` → remove entirely
- `{~~old~>new~~}` → keep `new`
- `{>>comment<<}` → remove entirely

**Reject all (produce original version):**
- Keep text outside markup as-is
- `{++text++}` → remove entirely
- `{--text--}` → keep `text`
- `{~~old~>new~~}` → keep `old`
- `{>>comment<<}` → remove entirely

### C. Key Architectural Decision: Intercept vs. Diff

| | Intercept (this PRD) | Diff (v0.1 PRD) |
|---|---|---|
| **Model** | Single document with tracked spans | Two documents compared after the fact |
| **Change capture** | Real-time, per-keystroke | Batch, computed on demand |
| **User experience** | Edit naturally; deletions become strikethroughs | Edit in one pane; see diff in another |
| **Comment stability** | Inherent (comments attach to persistent spans) | Fragile (changes recomputed on each diff, IDs may shift) |
| **Substitution accuracy** | Perfect (user selected and replaced = substitution) | Heuristic (adjacent delete+insert may or may not be a substitution) |
| **Undo semantics** | Operates on tracked changes (undo deletion = restore text) | Operates on text (undo = previous text state; diff recomputed) |
| **Implementation complexity** | Higher (custom editor plugin) | Lower (textarea + diff library) |
| **Fidelity** | Higher (captures user intent, not just text delta) | Lower (infers changes from comparison) |

The intercept model was chosen because it captures user *intent* (this was a replacement, not a coincidental adjacent deletion and insertion) and provides a fundamentally better editing experience. The implementation cost is higher but the prototype can use simplifications (Section 8.3) to manage scope.
