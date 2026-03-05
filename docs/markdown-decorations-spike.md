# Phase 10C: Rich Markdown Decorations — Spike Report

> **Status:** Research complete. Recommendation ready for Phase 10D implementation.
> **Date:** 2026-03-02
> **Scope:** Evaluate approaches for rendering markdown syntax as styled content in the TipTap editor while preserving the track-changes intercept model.

---

## 1. Executive Summary

**Use what we already have: TipTap's StarterKit nodes and marks (Approach A).**

The editor already includes StarterKit with full schema support for headings, bold, italic, code, lists, blockquotes, and more. The CSS styles are written. The serializer already handles heading prefixes. The remaining work for Phase 10D is extending the import parser to produce rich HTML for all markdown elements and extending the serializer to emit markdown syntax for inline marks and additional block types. No new dependencies are required. The intercept model is fully compatible — ProseMirror marks coexist by default, so tracked-change marks (deletion, insertion, highlight) work alongside formatting marks (bold, italic, code) without conflict.

---

## 2. Approaches Evaluated

### A. TipTap StarterKit Nodes/Marks (Already Active) — RECOMMENDED

#### How It Works

StarterKit is already in the `useEditor` extensions array (`Editor.tsx:60`). The schema already defines nodes for headings, paragraphs, bullet lists, ordered lists, blockquotes, code blocks, hard breaks, and horizontal rules, plus marks for bold, italic, code, strike, underline, and links. The import parser (`criticMarkupToHTML`) already generates `<h1>`–`<h3>` tags. The serializer (`serializeCriticMarkup`) already emits `#` prefixes for heading nodes via `getBlockPrefix()`. CSS styles for all these elements already exist in `index.css` under the `.tiptap` scope.

The gap is that:
1. The import parser only generates heading tags — it does not parse `**bold**`, `*italic*`, `` `code` ``, `- list items`, `> blockquotes`, or ` ``` code blocks ` `` into rich HTML.
2. The serializer only handles heading prefixes — it does not emit markdown syntax for inline marks or other block types.
3. StarterKit's input rules (markdown shortcuts like `# ` for headings, `**` for bold) exist but are suppressed by the intercept model's `handleTextInput` when tracking is enabled.

#### Mark Coexistence Analysis

ProseMirror marks coexist by default unless the `excludes` property is set on a mark spec. None of the three tracked-change marks (`trackedDeletion`, `trackedInsertion`, `trackedHighlight`) set `excludes`, and neither do StarterKit's formatting marks. This means:

- **TrackedDeletion + Bold**: A text node carries both marks. ProseMirror renders this as nested spans: `<span class="tracked-deletion"><strong>text</strong></span>` (or the reverse nesting — ProseMirror controls the nesting order based on mark rank). The CSS result is bold red strikethrough text. The `contenteditable="false"` attribute on the deletion span makes the entire compound span non-editable, which is correct.
- **TrackedInsertion + Italic**: Works identically. The text node has both marks. CSS renders green italic text. The insertion mark's `inclusive: true` behavior is unaffected by the presence of the italic mark — new text typed at the boundary extends the insertion mark but not the italic mark (since italic is non-inclusive by default).
- **TrackedHighlight + Code**: Both marks render on the same text node. Yellow highlight background + code background. Visually busy but functionally correct.
- **Tracked deletion spanning part of a bold word**: ProseMirror splits text nodes at mark boundaries. "**hel~~lo~~**" becomes two text nodes: "hel" (bold only) and "lo" (bold + trackedDeletion). Each node carries its correct mark set. The serializer walks these segments independently.

**Verdict: No schema changes needed. Marks coexist correctly.**

#### Intercept Model Compatibility

The intercept model's `handleTextInput` (in `trackChanges.ts`) returns `true` when tracking is enabled. In ProseMirror's plugin prop chain, "the first handler that returns true gets to handle the event." This means:

- **Tracking ON**: Our handler intercepts all text input, wraps it in tracked-change marks, and returns `true`. StarterKit's input rules (e.g., `# ` at line start converts to heading, `**text**` converts to bold) never fire. This is **correct and desirable** — we do not want markdown shortcuts silently mutating the document outside our intercept layer. Formatting is applied during import parsing, not during live typing.
- **Tracking OFF**: Our handler returns `false`, falling through to StarterKit's input rules. Typing `# ` at the start of a line creates a heading. Typing `**text**` bolds it. This is also correct — when tracking is off, the editor behaves like a normal rich text editor.

The `handleKeyDown`, `handlePaste`, and `beforeinput` handlers follow the same pattern: they only intercept when tracking is enabled, and they only care about tracked-change marks, not formatting marks.

**Verdict: No changes to the intercept model needed.**

#### Serialization Impact

The serializer (`serializeCriticMarkup.ts`) currently:
- Walks block nodes via `doc.forEach`
- Calls `getBlockPrefix()` which handles headings only
- Calls `collectSegments()` which reads tracked-change marks only
- Calls `serializeSegments()` which emits CriticMarkup syntax

To support rich markdown, the serializer needs:
1. `getBlockPrefix()` extended for list items (`- `, `1. `), blockquotes (`> `), code blocks (` ``` `)
2. `collectSegments()` extended to also read bold, italic, code, strike, link marks
3. `serializeSegments()` extended to wrap segment text in markdown syntax (`**`, `*`, `` ` ``, etc.) alongside CriticMarkup syntax

The key design question is nesting order: should CriticMarkup wrap markdown formatting, or vice versa? See Section 5 (Risks) for analysis.

#### Toggle Feasibility

The toggle controls whether the import parser generates rich HTML or flat paragraphs:
- **Rich mode ON**: `criticMarkupToHTML()` parses markdown syntax into `<strong>`, `<em>`, `<code>`, `<ul>`, `<ol>`, `<blockquote>` tags alongside CriticMarkup spans.
- **Rich mode OFF**: Current behavior — markdown syntax rendered as literal text in paragraphs.

Toggling re-parses the current document through the import path. This is the same mechanism used for session recovery and file import — well-tested. The toggle state can be stored in the Zustand store and wired to the Phase 10B `EditorControls` component.

#### Pros
- Infrastructure already 80% in place (schema, CSS, partial serialization)
- No new dependencies
- Marks coexist correctly out of the box
- Intercept model unaffected
- Toggle is straightforward (re-parse through import path)
- Copy-paste preserves formatting (real nodes survive the clipboard)

#### Cons
- Serializer complexity increases (must emit markdown syntax for all inline marks and block types)
- Round-trip fidelity requires careful testing (markdown is ambiguous: `*` vs `_`, list indentation)
- No live markdown-to-rich conversion while typing (formatting applied on import only)

---

### B. `tiptap-markdown` / `@tiptap/markdown` (Official Extension)

#### How It Works

TipTap released an official markdown extension in v3.7+ that uses MarkedJS for tokenization. It provides bidirectional conversion between markdown strings and ProseMirror JSON/nodes. Each TipTap extension can define `markdown.serialize()` and `markdown.parse()` methods via `addStorage()`. The extension is a parsing/serialization layer — it does not use input rules for live formatting.

#### Mark Coexistence Analysis

Same as Approach A — this extension uses the same StarterKit nodes/marks and the same ProseMirror schema. Mark coexistence is identical.

#### Intercept Model Compatibility

Same as Approach A — the extension is a parse/serialize layer, not an input handler. It does not register `handleTextInput` or other input props.

#### Serialization Impact

The extension provides its own markdown serializer via `editor.storage.markdown.getMarkdown()`. However, this serializer knows nothing about CriticMarkup marks. We would need to either:
- Extend its serializer to emit CriticMarkup syntax (invasive, fighting the library's API)
- Use it for markdown formatting only and layer our CriticMarkup serializer on top (complex integration)
- Ignore its serializer and keep our own (then why use it?)

#### Toggle Feasibility

The extension can set content from markdown via `editor.commands.setContent(markdownString)`. Toggle would re-parse through the extension's markdown parser. Feasible but adds an indirection layer.

#### Pros
- Battle-tested markdown parsing via MarkedJS (handles edge cases we'd have to implement)
- Official TipTap support
- Could simplify the import parser for non-CriticMarkup markdown

#### Cons
- Adds a dependency (`@tiptap/markdown` + MarkedJS) for something we partially have
- Its serializer doesn't know about CriticMarkup — would need to be extended or bypassed
- Doesn't solve the core challenge (track-change mark interaction)
- Would need to be layered on top of our existing CriticMarkup parser, not replace it
- Over-engineered for our use case — we need markdown parsing inside CriticMarkup tokens, which no generic markdown parser handles

#### Verdict

Unnecessary complexity. Could be useful later if markdown fidelity edge cases accumulate (e.g., tables, footnotes, reference links), but not warranted for Phase 10D's scope of basic inline and block formatting.

---

### C. ProseMirror Decorations (Obsidian-Style)

#### How It Works

Keep the document model as flat text nodes (no heading nodes, no bold marks). Parse markdown syntax with regex or a lightweight parser. Apply ProseMirror inline decorations for visual rendering (e.g., make `**text**` appear bold by adding an inline decoration with `font-weight: bold`). Use widget decorations to hide or replace markdown syntax characters.

This is conceptually similar to Obsidian's "Live Preview" mode, though Obsidian uses CodeMirror 6 (a different editor framework) with its own decoration/ViewPlugin system.

#### Mark Coexistence Analysis

Decorations are view-layer constructs — they do not modify the document model. However, ProseMirror renders inline decorations **inside** whatever marks are on the same text range. This means:

- A bold decoration on text that also has a `trackedDeletion` mark renders as: `<span class="tracked-deletion" contenteditable="false"><span class="bold-decoration">text</span></span>`. The decoration span is nested inside the deletion span. This works visually but creates semantic confusion.
- A bold decoration on text that also has a `trackedInsertion` mark renders inside the insertion span. The decoration styling competes with the insertion's green text color.

More fundamentally, decorations cannot represent block-level elements. A heading needs to be a `<h1>` element for correct cursor behavior, text selection, accessibility, and copy-paste semantics. Decorations can only add attributes or wrap inline content — they cannot change the block structure.

#### Intercept Model Compatibility

No conflict. Decorations are view-layer only and do not affect transactions, input handling, or mark manipulation. The intercept model would continue to operate on flat text nodes, which is the current behavior.

#### Serialization Impact

Minimal — the serializer would continue to walk flat text nodes. But this is also the problem: without real formatting marks in the document, the serializer emits raw markdown syntax characters, which is the current behavior.

#### Toggle Feasibility

Easy — add or remove the decoration plugin. The underlying document is unchanged.

#### Pros
- Document model unchanged — lowest risk to existing functionality
- Easy toggle (add/remove plugin)
- No changes to serializer or parser

#### Cons
- Cannot represent block elements (headings, lists, blockquotes) — these need real nodes for proper cursor behavior, selection, and accessibility
- Performance issues: inline decorations in ProseMirror re-render all affected spans when the document changes. For large documents with many formatting ranges, this causes visible lag.
- Decorations render inside marks, creating awkward nesting with tracked-change spans
- Copy-paste loses formatting (decorations don't survive the clipboard)
- Would require re-implementing what StarterKit already provides
- Markdown syntax characters remain in the document — the "rendered" view hides them visually but they're still there, creating cursor navigation oddities (cursor passes through invisible characters)

#### Verdict

Wrong tool for this job. Decorations are designed for ephemeral, view-layer annotations (spellcheck underlines, search highlights, linting markers) — not structural document formatting. The fundamental limitation of not supporting block elements makes this a non-starter for headings, lists, and blockquotes.

---

### D. Hybrid (Real Nodes for Blocks, Decorations for Inline)

#### How It Works

Use real ProseMirror nodes for block-level elements (headings, lists, blockquotes, code blocks) — which is what StarterKit already provides. Use decorations for inline elements (bold, italic, code, strikethrough) — regex-matching `**text**` patterns and applying visual styling.

#### Mark Coexistence Analysis

Block nodes: Same as Approach A — no issues.
Inline decorations: Same issues as Approach C — decorations nest inside tracked-change marks, creating visual artifacts.

#### Intercept Model Compatibility

Same as Approach A for block nodes. Same as Approach C for inline decorations. Mixed complexity.

#### Serialization Impact

Block serialization needs real node handling (same as Approach A). Inline serialization works on flat text (same as current). But the inconsistency — some formatting is structural, some is visual — complicates the mental model and makes edge cases harder to reason about.

#### Toggle Feasibility

Block toggle: would require reparsing (same as Approach A). Inline toggle: add/remove decoration plugin (same as Approach C). Two different toggle mechanisms for one feature.

#### Pros
- Block structure is real (cursor, selection, accessibility work correctly)

#### Cons
- Inconsistent model — some formatting is in the document, some isn't
- Inline decorations have the same performance and nesting issues as Approach C
- Copy-paste preserves block formatting but loses inline formatting
- Serializer needs to handle two different paradigms
- More complex than Approach A with no clear benefit

#### Verdict

Combines the complexity of both approaches without the benefits of either. If we're already using real nodes for blocks (which we are via StarterKit), there's no advantage to using decorations for inline marks when the real marks are equally available.

---

## 3. Recommendation

**Approach A: StarterKit nodes and marks.** Use what's already in place.

The decision matrix:

| Criterion | A: StarterKit | B: tiptap-markdown | C: Decorations | D: Hybrid |
|---|---|---|---|---|
| Mark coexistence | Works (default) | Works (default) | Awkward nesting | Mixed |
| Intercept model | Compatible | Compatible | Compatible | Compatible |
| Block elements | Real nodes | Real nodes | Cannot represent | Real nodes |
| Inline formatting | Real marks | Real marks | Visual only | Visual only |
| Serialization | Extend existing | Fight library API | No change needed | Split approach |
| Toggle | Re-parse | Re-parse | Add/remove plugin | Two mechanisms |
| Copy-paste | Preserves all | Preserves all | Loses inline | Loses inline |
| New dependencies | None | @tiptap/markdown + MarkedJS | None | None |
| Existing infrastructure | 80% done | 40% done | 10% done | 50% done |
| Performance | No concerns | No concerns | Inline deco lag | Inline deco lag |

The choice is clear. Approach A is the simplest, most complete, and most aligned with the existing architecture.

---

## 4. Implementation Sketch for Phase 10D

### Step 1: Enhance the Import Parser

`criticMarkupToHTML()` in `parseCriticMarkup.ts` currently generates HTML for CriticMarkup tokens and headings. Extend it to parse markdown inline syntax within block content:

**Inline elements** (within each block's text content, after CriticMarkup tokens are extracted):
- `**text**` or `__text__` → `<strong>text</strong>`
- `*text*` or `_text_` → `<em>text</em>`
- `` `text` `` → `<code>text</code>`
- `~~text~~` → `<s>text</s>`
- `[text](url)` → `<a href="url">text</a>`

**Block elements** (detected from line prefixes during `splitIntoBlocks()`):
- `- item` or `* item` → `<ul><li>item</li></ul>`
- `1. item` → `<ol><li>item</li></ol>`
- `> text` → `<blockquote><p>text</p></blockquote>`
- ` ```lang ... ``` ` → `<pre><code>text</code></pre>`

**Critical constraint**: CriticMarkup tokens must be parsed FIRST, before markdown inline syntax. This prevents false matches inside CriticMarkup delimiters (e.g., `{++**not bold**++}` should not have `**` treated as bold markers — but `**{++bold insertion++}**` should). The current two-pass approach (tokenize CriticMarkup → generate HTML per segment) naturally handles this: markdown parsing runs on the `text` field of each segment.

### Step 2: Enhance the Serializer

`serializeCriticMarkup()` in `serializeCriticMarkup.ts` needs:

**Block prefix expansion** in `getBlockPrefix()`:
```
heading     → '# ', '## ', '### ' (already implemented)
bulletList  → '- ' per listItem
orderedList → '1. ' per listItem (or track actual numbers)
blockquote  → '> ' per line
codeBlock   → '```\n' ... '\n```'
```

Note: Lists and blockquotes have nested structure (a `bulletList` node contains `listItem` children, which contain paragraph children). The serializer's `doc.forEach` loop currently iterates top-level block nodes. It will need to recurse into nested structures or handle them at the top-level iteration.

**Inline mark wrapping** in `collectSegments()` and `serializeSegments()`:

Add mark metadata to the `Segment` interface:
```typescript
interface Segment {
  text: string
  // existing tracked-change fields...
  bold: boolean
  italic: boolean
  code: boolean
  strike: boolean
  link: string | null  // href if link mark present
}
```

In `serializeSegments()`, wrap segment text in markdown syntax:
- Bold: `**text**`
- Italic: `*text*`
- Code: `` `text` ``
- Strike: `~~text~~`
- Link: `[text](href)`

Wrapping must occur outside CriticMarkup delimiters: `**{--deleted bold--}**` not `{--**deleted bold**--}`. This is because the markdown formatting applies to the visual rendering of the text, while CriticMarkup describes the editing operation. A deleted word that was bold should round-trip as "this word was bold, and it was deleted."

### Step 3: Verify Mark Coexistence Edge Cases

Build a test matrix and verify each combination in the browser:

| Scenario | Expected Rendering | Expected Serialization |
|---|---|---|
| TrackedDeletion + Bold | Bold red strikethrough | `**{--text--}**` |
| TrackedInsertion + Italic | Italic green text | `*{++text++}*` |
| TrackedDeletion + Code | Code-styled red strikethrough | `` `{--text--}` `` |
| TrackedHighlight + Bold | Bold yellow highlight | `**{==text==}**` |
| Insertion spanning bold boundary | Split at boundary, green text | `**{++bold part++}**{++plain part++}` |
| Deletion of part of bold word | Bold segment + bold+deleted segment | `**hel{--lo--}**` |
| Substitution where old=bold, new=plain | Bold strikethrough + plain green | `**{~~old~~}**{~~>new~~}` or `{~~**old**~>new~~}` |

### Step 4: Toggle Implementation

- Add `richMarkdownEnabled: boolean` to the Zustand store (default: `true`)
- `criticMarkupToHTML()` accepts a `richMode` parameter
  - `true`: Parse markdown syntax into rich HTML (new behavior)
  - `false`: Treat markdown syntax as literal text (current behavior)
- Toggle wired to the `EditorControls` component placeholder from Phase 10B
- Toggling re-imports the current document: serialize current state → re-parse with new mode → `setContent()`
- Persist preference in `localStorage`

### Step 5: Verify extractChanges Compatibility

`extractChanges()` in `extractChanges.ts` currently reads `trackedDeletion`, `trackedInsertion`, and `trackedHighlight` marks from text nodes. Other marks (bold, italic, code) are not checked and are silently ignored. This is correct — formatting marks do not affect change detection or the Changes Panel.

Verify:
- `collectPositionedSegments()` continues to work when text nodes carry additional marks
- Context snippets (`getContextBefore/After`) still extract readable text
- The Changes Panel renders correctly for changes inside formatted content

---

## 5. Risks and Open Questions

### Confirmed Safe (No Prototyping Needed)

**Mark coexistence**: ProseMirror's mark system explicitly supports multiple marks on the same text node. The `excludes` property on tracked-change marks is not set, so they coexist with all formatting marks. Verified by reading the TipTap schema documentation and ProseMirror reference manual.

**Intercept model compatibility**: The `handleTextInput` handler checks for `trackedInsertion` mark presence and creates insertion/deletion/substitution marks. It does not interact with formatting marks. The `appendTransaction` handler strips insertion marks from untracked text — it also does not touch formatting marks. Both handlers are mark-type-specific and will not be affected by additional marks on text nodes.

**CSS rendering**: `index.css` already contains styles for `.tiptap h1`–`h3`, `.tiptap ul`, `.tiptap ol`, `.tiptap blockquote`, `.tiptap code`, `.tiptap pre`. These styles will apply automatically when the import parser generates the correct HTML elements.

**Input rule suppression**: When tracking is enabled, `handleTextInput` returns `true`, which suppresses StarterKit's markdown shortcuts. This is correct — formatting is applied during import, not during live typing. When tracking is disabled, `handleTextInput` returns `false`, and shortcuts work normally.

### Needs Prototyping

**Inline mark serialization ordering**: When a text node has both `trackedDeletion` and `bold`, the serializer must decide the nesting order. Two options:

- Option 1: `**{--deleted bold text--}**` — markdown wraps CriticMarkup. This says "this bold text was deleted." Semantically clearer. But the import parser must handle markdown syntax wrapping CriticMarkup tokens, which is more complex to parse.
- Option 2: `{--**deleted bold text**--}` — CriticMarkup wraps markdown. This says "the text `**deleted bold text**` was deleted." The import parser already handles this naturally (markdown parsing runs inside CriticMarkup segment text). But it means formatting information is inside the editing operation, which is semantically odd.

**Recommendation**: Start with Option 2 (CriticMarkup wraps markdown) because it's simpler to parse. It matches how CriticMarkup was designed — the markup delimiters wrap the literal text content, including any formatting syntax. Prototype both and pick whichever round-trips more reliably.

**Partial formatting across tracked changes**: Consider the text `**hello world**` where the user deletes "lo wor". ProseMirror produces:

1. Text node "hel" — marks: [bold]
2. Text node "lo wor" — marks: [bold, trackedDeletion]
3. Text node "ld" — marks: [bold]

The serializer must merge adjacent bold segments while respecting the CriticMarkup boundary: `**hel{--lo wor--}ld**`. This requires the segment walker to track formatting mark state across CriticMarkup boundaries. Prototype to confirm the segment walker handles this correctly.

**Nested list serialization**: Markdown list serialization is notoriously tricky. A `bulletList` node contains `listItem` children, which may contain nested `bulletList` or `orderedList` nodes. The serializer's current `doc.forEach` top-level iteration needs to recurse into these structures. Accept imperfect fidelity for deeply nested lists in Phase 10D and improve iteratively.

**Block-level structural changes**: Deleting a heading's `#` characters or converting a paragraph to a heading are structural changes that CriticMarkup cannot represent. The intercept model does not track these changes (they're node-level operations, not text-level). This is the existing behavior and should remain unchanged in Phase 10D. Document this limitation explicitly.

### Open Questions

**Should the toggle affect existing content or only new imports?**
Recommendation: The toggle re-parses ALL current content. Serialize the current document to CriticMarkup, then re-import with the new mode. This ensures consistent rendering. The toggle is a view preference, not a document property.

**How to handle literal markdown syntax in content?**
A document about markdown might contain literal `**` characters that are not formatting. In rich mode, these would be parsed as bold markers. In raw mode, they render literally. This is an inherent tension in any WYSIWYG markdown editor. Recommendation: Accept this as a known limitation. Users who need literal markdown syntax can use raw mode or escape with backslashes (if we choose to support escaping).

**Should tracked insertions preserve formatting from paste?**
Currently, paste is intercepted and flattened to plain text (via `slice.content.textBetween`). If the user pastes bold text, the bold formatting is lost. In a rich-mode editor, this may feel wrong. Recommendation: Defer to a later phase. The paste handler in `trackChanges.ts` would need to preserve the slice's marks, which requires careful interaction with the insertion mark application.

**Should StarterKit's input rules be re-enabled when tracking is on?**
Currently they're suppressed because `handleTextInput` returns `true`. An alternative is to allow markdown shortcuts to work AND create tracked insertions simultaneously (e.g., typing `# ` converts to a heading and marks the heading creation as a tracked change). This is extremely complex — ProseMirror would need to track structural (node-type) changes, not just text mark changes. Recommendation: Do not pursue. Formatting during live typing is out of scope for Phase 10D.

---

## 6. Round-Trip Serialization Fidelity

### The Critical Requirement

Import → edit → export → re-import must produce the same document state. This is the foundation of the app's reliability.

### Current Round-Trip Path

1. CriticMarkup string → `parseCriticMarkup()` → segments → `criticMarkupToHTML()` → HTML string
2. HTML string → `editor.commands.setContent()` → ProseMirror doc with tracked-change marks
3. ProseMirror doc → `serializeCriticMarkup()` → CriticMarkup string

### Extended Round-Trip Path (Phase 10D)

1. CriticMarkup+Markdown string → `parseCriticMarkup()` → segments → markdown parsing per segment → `criticMarkupToHTML()` → rich HTML with `<strong>`, `<em>`, `<code>`, `<ul>`, `<blockquote>`, etc.
2. Rich HTML → `editor.commands.setContent()` → ProseMirror doc with tracked-change marks AND formatting marks/nodes
3. ProseMirror doc → `serializeCriticMarkup()` → CriticMarkup+Markdown string

### Fidelity Risks

**Markdown syntax ambiguity**: `*` and `_` both mean italic. `**` and `__` both mean bold. The serializer must pick one canonical form and always emit it. Recommendation: Use `**` for bold, `*` for italic, `` ` `` for code, `~~` for strikethrough. These are the most common conventions and what TipTap's parsing expects.

**List formatting precision**: Markdown list parsing has many edge cases (indentation levels, mixed ordered/unordered, continuation paragraphs). The parser may interpret list structure differently than the serializer emits it. Accept imperfect fidelity for deeply nested or complex lists. Simple flat lists (the common case) must round-trip exactly.

**Code blocks with language specifiers**: ` ```javascript ` includes a language hint. TipTap's `codeBlock` node has a `language` attribute. The serializer must emit the language specifier if present. The parser must extract it. Defer to a later phase if complex; basic fenced code blocks without language should work in Phase 10D.

**CriticMarkup + markdown nesting**: With Option 2 serialization (CriticMarkup wraps markdown), the string `{--**deleted bold**--}` must re-import as a deletion segment with text `**deleted bold**`, which then gets markdown-parsed into a bold span inside a deletion span. This requires the import parser to run markdown parsing INSIDE CriticMarkup segment text, which is the natural ordering (CriticMarkup tokens are extracted first, then each segment's text is markdown-parsed).

**Whitespace and line breaks**: Markdown is whitespace-sensitive (two trailing spaces = `<br>`, blank lines = paragraph break). The serializer's block joining (`blocks.join('\n\n')`) must not introduce spurious blank lines inside lists or blockquotes. Test with real-world documents.

### Testing Strategy

1. **Unit tests**: For each formatting type, serialize a known ProseMirror document → parse the output → serialize again → verify identical strings.
2. **Edge case matrix**: Every combination of tracked-change type (deletion, insertion, substitution, highlight) crossed with every formatting type (bold, italic, code, strike, link, heading, list, blockquote, code block). This is a 4x9 = 36 cell matrix. Most cells are straightforward; focus testing on the edge cases identified in Section 5.
3. **Real-world documents**: Import a markdown file with mixed formatting, make tracked changes, export, re-import, and verify the editor state matches. Use at least three source documents: a README with headings and lists, a blog post with bold/italic and code blocks, and a document with existing CriticMarkup and formatting.
4. **Regression**: Run the existing import/export flows (plain CriticMarkup without markdown formatting) and verify they still work identically when rich mode is off.

---

## References

- [TipTap Schema Documentation](https://tiptap.dev/docs/editor/core-concepts/schema)
- [TipTap Nodes and Marks](https://tiptap.dev/docs/editor/core-concepts/nodes-and-marks)
- [TipTap StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)
- [TipTap Official Markdown Extension](https://tiptap.dev/docs/editor/markdown)
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [ProseMirror Reference Manual](https://prosemirror.net/docs/ref/)
- [ProseMirror Track Changes Discussion](https://discuss.prosemirror.net/t/tracking-changes-by-wrapping-insertions-and-deletions-with-marks/8315)
- [ProseMirror Decoration Placement Discussion](https://discuss.prosemirror.net/t/placement-of-decorations-around-marks/1098)
- [tiptap-markdown (Community Extension)](https://github.com/aguingand/tiptap-markdown)
- [Obsidian CriticMarkup Plugin](https://github.com/Fevol/obsidian-criticmarkup)
- [CriticMarkup Spec](http://criticmarkup.com/spec.php)
