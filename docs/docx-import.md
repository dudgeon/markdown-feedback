# DOCX Import — Specification

**Status:** Research complete, ready for implementation
**Author:** Geoff + Claude
**Date:** 2026-02-09

---

## 1. Motivation

Google Docs has a good "Suggesting" mode that captures proposed changes and lets authors add comments. When you export a Google Doc with suggestions as `.docx`, the suggestions are preserved as standard OOXML tracked changes, and comments are preserved as OOXML comment ranges. This means a `.docx` file is a reliable transport format for tracked edits + comments from Google Docs.

Markdown Feedback should be able to import a `.docx` file — with all its tracked changes and comments intact — and reconstruct them as CriticMarkup in the editor. This unlocks the workflow: **Google Docs suggesting mode → Export .docx → Import into Markdown Feedback → CriticMarkup output**.

### Why not use the Google Docs API?

The Google Docs API can read suggestions and comments directly, but:
- Requires OAuth authentication, API keys, and a server component
- Can't work from a static GitHub Pages deployment
- Adds significant complexity for the user (auth flow, permissions)

The `.docx` export path is simpler: the user downloads a file from Google Docs and uploads it to Markdown Feedback. All processing is client-side. No server, no auth, no API keys.

### Why not use pandoc?

Pandoc has excellent `.docx` → CriticMarkup support via `--track-changes=all`. However:
- Pandoc is a Haskell binary — not available client-side in a browser
- `pandoc-wasm` exists but is experimental, ~10+ MB, and has limited browser support
- We need a lightweight, reliable client-side solution

---

## 2. Architecture

### 2.1 Pipeline Overview

```
.docx file (via <input type="file">)
  │
  ▼
JSZip.loadAsync(arrayBuffer)
  │
  ▼
Extract word/document.xml + word/comments.xml
  │
  ▼
DOMParser (browser-native XML parser)
  │
  ▼
Custom OOXML walker:
  1. Walks <w:body> → <w:p> paragraphs → <w:r> runs
  2. Detects <w:ins>, <w:del> for tracked changes
  3. Extracts <w:commentRangeStart/End> + <w:commentReference>
  4. Maps comments from word/comments.xml to their anchored ranges
  5. Converts paragraph styles to markdown (headings, lists, bold, italic)
  6. Emits CriticMarkup-formatted markdown string
  │
  ▼
Feed into existing criticMarkupToHTML() → editor
```

### 2.2 Library Choices

| Library | Purpose | Size (gzip) | License | Why |
|---------|---------|-------------|---------|-----|
| **JSZip** | Extract XML from .docx ZIP | ~45 KB | MIT | Battle-tested, 8M+ weekly downloads, excellent browser support |
| **DOMParser** | Parse XML to DOM | 0 KB (built-in) | N/A | Browser-native, no dependency needed. OOXML is well-formed XML that DOMParser handles correctly |

**Total added bundle: ~45 KB gzipped** (JSZip only — XML parsing uses browser-native DOMParser).

Both can be **dynamically imported** so they only load when the user actually imports a `.docx` file.

### 2.3 Why DOMParser Instead of fast-xml-parser?

Initial research considered `fast-xml-parser` (~35 KB), but the browser's built-in `DOMParser` is sufficient and adds zero bundle size:

- OOXML is well-formed XML — `DOMParser` handles it correctly
- DOM APIs (`querySelectorAll`, `getElementsByTagName`, `getAttribute`) map naturally to OOXML's namespace-heavy structure
- Namespace-aware methods (`getElementsByTagNameNS`) handle the `w:` prefix properly
- No configuration needed for attribute parsing, element ordering, etc.

### 2.4 Why Not mammoth.js?

mammoth.js converts `.docx` to HTML but **does not preserve tracked changes**. It silently accepts all changes and outputs the "final" document. Since tracked changes are the entire point of this feature, mammoth.js is not suitable as the primary parser. (It could theoretically be used as a formatting fallback, but the added complexity and ~70 KB bundle aren't worth it.)

---

## 3. OOXML Format Reference

### 3.1 .docx File Structure

A `.docx` file is a ZIP archive containing:

```
[Content_Types].xml          — manifest
word/document.xml            — main document body (text, tracked changes, comment anchors)
word/comments.xml            — all comment bodies
word/styles.xml              — style definitions
word/numbering.xml           — list numbering definitions
word/settings.xml            — document settings
word/_rels/document.xml.rels — relationships
```

The primary namespace is `http://schemas.openxmlformats.org/wordprocessingml/2006/main` (prefix `w:`).

### 3.2 Document Structure

```xml
<w:document>
  <w:body>
    <w:p>                          <!-- paragraph -->
      <w:pPr>                      <!-- paragraph properties -->
        <w:pStyle w:val="Heading1"/>
      </w:pPr>
      <w:r>                        <!-- run (text span) -->
        <w:rPr>                    <!-- run properties (bold, italic, etc.) -->
          <w:b/>
        </w:rPr>
        <w:t>Hello world</w:t>     <!-- text content -->
      </w:r>
    </w:p>
  </w:body>
</w:document>
```

### 3.3 Tracked Changes (Insertions)

```xml
<w:ins w:id="1" w:author="Jane Doe" w:date="2026-02-09T12:00:00Z">
  <w:r>
    <w:rPr>...</w:rPr>
    <w:t>inserted text</w:t>
  </w:r>
</w:ins>
```

- `<w:ins>` wraps one or more `<w:r>` runs
- Contains `w:id`, `w:author`, `w:date` attributes
- Text content is in normal `<w:t>` elements
- Maps to CriticMarkup: `{++inserted text++}`

### 3.4 Tracked Changes (Deletions)

```xml
<w:del w:id="2" w:author="Jane Doe" w:date="2026-02-09T12:00:00Z">
  <w:r>
    <w:rPr>...</w:rPr>
    <w:delText xml:space="preserve">deleted text</w:delText>
  </w:r>
</w:del>
```

- `<w:del>` wraps one or more `<w:r>` runs
- Deleted text uses `<w:delText>` instead of `<w:t>`
- Contains `w:id`, `w:author`, `w:date` attributes
- Maps to CriticMarkup: `{--deleted text--}`

### 3.5 Substitutions

OOXML has **no explicit substitution element**. A substitution appears as an adjacent `<w:del>` followed by `<w:ins>` at the same position, typically with the same author and similar timestamp. Our walker will need heuristics to detect these:

- Adjacent `<w:del>` + `<w:ins>` by the same author within a few seconds → substitution
- Maps to CriticMarkup: `{~~old text~>new text~~}`
- Fallback: if heuristics don't match, emit as separate `{--...--}{++...++}`

### 3.6 Comments

Comments involve three coordinated elements in `document.xml` with matching IDs:

```xml
<!-- In document.xml -->
<w:p>
  <w:commentRangeStart w:id="0"/>
  <w:r>
    <w:t>commented text</w:t>
  </w:r>
  <w:commentRangeEnd w:id="0"/>
  <w:r>
    <w:commentReference w:id="0"/>
  </w:r>
</w:p>
```

Plus the comment body in `word/comments.xml`:

```xml
<w:comments>
  <w:comment w:id="0" w:author="Jane Doe" w:date="2026-02-09T12:00:00Z" w:initials="JD">
    <w:p>
      <w:r>
        <w:t>This needs a citation.</w:t>
      </w:r>
    </w:p>
  </w:comment>
</w:comments>
```

- `w:commentRangeStart` / `w:commentRangeEnd` mark the anchored text range
- `w:commentReference` links to the comment body
- All three share the same `w:id` value
- Comment body can contain multiple paragraphs

**Mapping to CriticMarkup:**

| Scenario | CriticMarkup Output |
|----------|-------------------|
| Comment on plain text (no tracked change) | `{==commented text==}{>>comment body<<}` |
| Comment on a tracked change (insertion or deletion) | `{++inserted text++}{>>comment body<<}` or `{--deleted text--}{>>comment body<<}` |
| Comment on a substitution | `{~~old~>new~~}{>>comment body<<}` |

### 3.7 Other Revision Elements (Out of Scope Initially)

These exist in OOXML but are lower priority:

| Element | Purpose | Handling |
|---------|---------|----------|
| `w:moveFrom` / `w:moveTo` | Move tracking | Convert to separate delete + insert |
| `w:rPrChange` | Run formatting change (bold, italic) | Ignore (CriticMarkup has no formatting-change syntax) |
| `w:pPrChange` | Paragraph style change | Ignore |
| `w:tblPrChange` | Table property change | Ignore |
| `w:sectPrChange` | Section property change | Ignore |
| `w:numberingChange` | List numbering change | Ignore |

---

## 4. Markdown Conversion

The OOXML walker must also convert document structure to markdown:

### 4.1 Paragraph Styles

| OOXML Style | Markdown |
|------------|----------|
| `<w:pStyle w:val="Heading1"/>` (or equivalent) | `# Heading` |
| `<w:pStyle w:val="Heading2"/>` | `## Heading` |
| `<w:pStyle w:val="Heading3"/>` | `### Heading` |
| No style / `Normal` | Plain paragraph |
| `ListParagraph` + `<w:numId>` + `<w:ilvl>` | `- item` or `1. item` |

### 4.2 Inline Formatting

| OOXML Run Property | Markdown |
|-------------------|----------|
| `<w:b/>` | `**bold**` |
| `<w:i/>` | `*italic*` |
| `<w:b/>` + `<w:i/>` | `***bold italic***` |
| `<w:u/>` | No standard markdown; pass through as plain text |
| `<w:strike/>` | `~~strikethrough~~` (GFM) |

### 4.3 Special Elements

| OOXML Element | Markdown |
|--------------|----------|
| `<w:br/>` | Line break (`\n`) |
| `<w:tab/>` | Tab character |
| `<w:hyperlink>` | `[text](url)` (URL from relationships file) |
| `<w:drawing>` / `<w:pict>` | Ignore (images not supported in editor) |

### 4.4 Google Docs–Specific Considerations

Google Docs exports may have quirks:
- Style names may differ from Word defaults (e.g., `"heading 1"` vs `"Heading1"`)
- List numbering may use different `w:numId` patterns
- Comments on suggestions may anchor to the tracked change range rather than plain text
- Multiple revisions may be by the same author with slightly different email aliases

These need to be tested with real Google Docs exports during implementation.

---

## 5. Implementation Phases

Build iteratively, testing each phase with real `.docx` files before moving to the next.

### Phase A: Basic DOCX → Markdown (No Tracked Changes)

**Goal:** Parse a `.docx` file and produce clean markdown with paragraph structure and basic formatting. Ignore all tracked changes and comments — just extract the "accepted" document text.

**Deliverables:**
- `src/utils/parseDocx.ts` — main entry point
  - Takes `ArrayBuffer` from file input
  - Uses JSZip to extract `word/document.xml`
  - Walks `<w:body>` → `<w:p>` → `<w:r>` → `<w:t>` / `<w:delText>`
  - Converts paragraph styles to markdown headings
  - Converts inline formatting (bold, italic) to markdown
  - Returns a markdown string
- UI: Add "Import .docx" button/option alongside existing paste import
  - File input (`<input type="file" accept=".docx">`)
  - Feed resulting markdown into existing `onImport` handler

**Testing:** Import a Google Doc exported as `.docx`. Verify the markdown renders correctly in the editor. Compare against copy-pasting the same doc's text.

### Phase B: Tracked Changes → CriticMarkup

**Goal:** Detect `<w:ins>` and `<w:del>` elements and emit them as CriticMarkup tokens in the markdown output.

**Deliverables:**
- Enhance the OOXML walker to:
  - Wrap `<w:ins>` content in `{++...++}`
  - Wrap `<w:del>` content in `{--...--}`
  - Detect adjacent `<w:del>` + `<w:ins>` pairs and emit `{~~old~>new~~}`
- The output markdown now contains CriticMarkup
- Feed through existing `criticMarkupToHTML()` → editor reconstructs tracked changes

**Testing:** Create a Google Doc, make suggestions in Suggesting mode, export as `.docx`, import. Verify tracked changes appear with correct styling (red strikethrough for deletions, green for insertions).

### Phase C: Comments

**Goal:** Extract comments from `word/comments.xml` and link them to their anchored ranges in the document.

**Deliverables:**
- Parse `word/comments.xml` to build a map: `commentId → commentText`
- Track `<w:commentRangeStart>` / `<w:commentRangeEnd>` / `<w:commentReference>` positions while walking the document
- Emit `{>>comment<<}` after the range that the comment anchors to
- Handle comments on tracked changes: emit comment after the CriticMarkup token

**Testing:** Add comments to suggestions in Google Docs, export, import. Verify comments appear in the Changes Panel linked to the correct changes.

### Phase D: Comment-to-Change Attribution

**Goal:** When a comment is anchored to the same range as a tracked change, correctly associate the comment with that change rather than creating a standalone highlight.

**Deliverables:**
- During the walk, detect when a comment range overlaps with a tracked change range
- If the comment is on a tracked change: emit `{++text++}{>>comment<<}` (comment after the change token)
- If the comment is on plain text: emit `{==text==}{>>comment<<}` (highlight + comment)
- Handle edge cases: comment spanning multiple tracked changes, comment partially overlapping a change

**Testing:** Create a doc with:
1. A suggestion with a comment on it
2. A comment on plain (non-suggested) text
3. A suggestion without a comment

Verify all three cases import correctly.

### Phase E: Polish & Edge Cases

**Goal:** Handle real-world complexity and improve robustness.

**Deliverables:**
- List handling (ordered + unordered, with tracked changes inside list items)
- `<w:moveFrom>` / `<w:moveTo>` → separate delete + insert
- Hyperlink handling
- Multi-paragraph tracked changes (change spans paragraph boundary)
- Graceful handling of tables, images, and other unsupported elements (skip with optional warning)
- Error handling: invalid/corrupt .docx files, missing XML files, malformed XML
- Progress feedback for large files
- Lazy loading: dynamically import JSZip only when `.docx` import is triggered

---

## 6. UI Integration

### 6.1 Import Flow

The Import modal gains a second path alongside paste:

```
┌────────────────────────────────────────────┐
│  Import                                     │
│                                             │
│  ┌──────────────────┐  ┌────────────────┐  │
│  │  📄 Paste         │  │  📎 .docx File  │  │
│  │  Markdown         │  │  (Google Docs)  │  │
│  └──────────────────┘  └────────────────┘  │
│                                             │
│  [Tab: Paste]  [Tab: .docx File]           │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  [Choose File]  mydoc.docx          │   │
│  │                                     │   │
│  │  ✓ 3 tracked changes found          │   │
│  │  ✓ 2 comments found                 │   │
│  └─────────────────────────────────────┘   │
│                                             │
│            [Cancel]  [Load]                 │
└────────────────────────────────────────────┘
```

### 6.2 Interaction

1. User clicks Import in toolbar
2. Import modal opens with two tabs: "Paste" (existing) and ".docx File" (new)
3. User clicks ".docx File" tab
4. File picker appears (`<input type="file" accept=".docx">`)
5. User selects file
6. File is parsed client-side (JSZip + OOXML walker)
7. Modal shows preview: "N tracked changes found, M comments found"
8. User clicks "Load"
9. CriticMarkup string feeds into existing `onImport()` pipeline
10. Editor renders with all tracked changes and comments intact

### 6.3 Error States

- **Not a .docx file:** "This doesn't appear to be a .docx file. Please select a Word document."
- **No document.xml found:** "This file appears to be corrupted or is not a standard Word document."
- **Parse error:** "There was a problem reading this file. Try re-exporting from Google Docs."
- **No tracked changes:** File imports fine as clean markdown (no error, but note in preview: "No tracked changes found — importing as plain markdown")

---

## 7. Integration Points

### 7.1 Existing Code Reuse

The output of the OOXML walker is a **CriticMarkup markdown string** — the same format as the paste import. This means:

- `criticMarkupToHTML()` in `parseCriticMarkup.ts` handles parsing into editor HTML
- `extractCommentsFromSegments()` handles comment extraction
- The `onImport()` handler in `Editor.tsx` accepts the string and loads it
- No changes needed to the editor, changes panel, or serialization

### 7.2 New Files

```
src/utils/parseDocx.ts         — Main entry: ArrayBuffer → CriticMarkup markdown string
src/utils/docxToMarkdown.ts    — OOXML walker: XML DOM → markdown + CriticMarkup tokens
src/components/ImportModal.tsx  — Extend with .docx file tab (modify existing)
```

### 7.3 New Dependencies

```json
{
  "jszip": "^3.10.1"
}
```

Single new dependency. ~45 KB gzipped. Dynamically imported.

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Google Docs .docx export uses non-standard OOXML | Medium | High | Test with real Google Docs exports early and often. Keep the walker tolerant of missing/unexpected elements. |
| Complex tracked changes (nested, spanning paragraphs) | Medium | Medium | Start with simple cases (Phase B). Handle complex cases in Phase E. Emit as separate tokens rather than crashing on unexpected structure. |
| Comment anchoring is ambiguous (comment range overlaps multiple changes) | Medium | Medium | Use heuristic: if comment range matches a tracked change range exactly, attribute it. Otherwise, emit as standalone highlight. |
| Large .docx files (many images, embedded objects) | Low | Low | We only extract text XML files, not media. JSZip is efficient for selective extraction. |
| Browser memory for very large documents | Low | Low | .docx text XML is typically small even for long documents. Images/media are the size drivers, and we skip those. |
| Substitution detection heuristic fails | Medium | Low | Fallback is correct — separate `{--...--}{++...++}` is semantically valid CriticMarkup, just not as compact as `{~~...~~}`. |

---

## 9. Testing Strategy

### 9.1 Test Documents

Create a suite of Google Docs test documents:

1. **Simple edits:** A few insertions, deletions, and substitutions
2. **Comments on edits:** Suggestions with comments explaining them
3. **Comments on plain text:** Comments on non-suggested text
4. **Mixed formatting:** Headings, bold, italic, lists with tracked changes
5. **Long document:** 5+ pages with many tracked changes
6. **Edge cases:** Empty suggestions, suggestions spanning formatting boundaries, comments on deleted text

### 9.2 Testing Approach

For each test document:
1. Export from Google Docs as `.docx`
2. Import into Markdown Feedback
3. Verify: correct markdown structure, correct CriticMarkup tokens, correct comments
4. Compare: export from Markdown Feedback and verify the CriticMarkup round-trips through Google Docs → .docx → Markdown Feedback → CriticMarkup

### 9.3 Automated Testing

Use `npx tsx -e` scripts to test the parser directly with sample `.docx` files, separate from the UI. This catches parsing bugs faster than manual testing through the browser.

---

## 10. References

- [OOXML tracked revisions specification (Eric White)](http://www.ericwhite.com/blog/using-xml-dom-to-detect-tracked-revisions-in-an-open-xml-wordprocessingml-document/)
- [Pandoc filter: tracked changes → CriticMarkup](https://gist.github.com/HeirOfNorton/3dc2795f6307145cf7cb)
- [OOXML comment structure (Microsoft Learn)](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-insert-a-comment-into-a-word-processing-document)
- [OOXML tracked revisions element reference (c-rex.net)](https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_trackRevisions_topic_ID0EKXKY.html)
- [CriticMarkup specification](http://criticmarkup.com/spec.php)
- [JSZip library](https://stuk.github.io/jszip/)
- [Google Docs suggestion export confirmation](https://support.google.com/docs/thread/6538178)
