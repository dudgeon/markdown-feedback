# Deletion Span Cursor Dead Zones — Analysis & Solutions

## The Problem

When the user backspaces through original text, `handleSingleCharDelete` creates one `trackedDeletion` mark per keystroke, each with a unique `nanoid(8)` ID. ProseMirror considers marks equal only when type AND attributes match — so each character becomes a separate `<span contenteditable="false">` in the DOM.

Adjacent `contenteditable=false` elements create a "wall" with no valid cursor positions between them. The browser cannot place the caret between two non-editable inline elements. The cursor skip logic (`trackChanges.ts:206–243`) compounds this by jumping the cursor past the entire wall, making it impossible to type at a specific position within or adjacent to the deletions.

**Observed behavior:** User tried "on track" → "off track". The inserted text landed in the wrong position because the cursor couldn't stop between the per-character deletion spans.

**Contrast with range delete:** `handleRangeDelete` applies a single mark (one ID) to the entire selected range, producing one `contenteditable=false` span. This works correctly — one non-editable span is fine; it's the *adjacency of many* that breaks.

---

## Root Cause Chain

1. `handleSingleCharDelete` (line 247): `deletionType.create({ id: nanoid(8) })` — new ID per keystroke
2. Different `id` attributes → ProseMirror treats marks as unequal → separate DOM spans
3. Adjacent `contenteditable=false` spans → no cursor positions between them
4. Cursor skip logic jumps past the wall → user loses precise positioning

---

## Solution Options

### Option A: Adjacent ID Reuse (Recommended)

**Approach:** When creating a new standalone deletion mark, check if the adjacent character already has a standalone deletion mark (no `pairedWith`). If so, reuse its ID. ProseMirror will then merge the marks into a single DOM span.

**Changes:** Modify `handleSingleCharDelete` to:
1. Before creating a new mark, resolve the position and check the adjacent text node
2. If the adjacent node has a `trackedDeletion` mark with `pairedWith === null`, extract its `id`
3. Create the new mark with that same `id`
4. ProseMirror automatically merges equal marks into one span

**Pseudocode:**
```ts
// In handleSingleCharDelete, before creating the mark:
const adjacentId = findAdjacentDeletionId(state, charPos, charEnd)
const id = adjacentId ?? nanoid(8)
tr.addMark(charPos, charEnd, deletionType.create({ id }))
```

Where `findAdjacentDeletionId` scans the character immediately before `charPos` or after `charEnd` for an existing standalone deletion mark.

**Pros:**
- Minimal code change (~15 lines added)
- Directly addresses root cause — fewer DOM spans
- Serializer already merges by adjacency, so output is unchanged
- No risk to substitution pairs (only reuse IDs where `pairedWith === null`)
- Undo still works per-character (each transaction is still one character)

**Cons:**
- Characters deleted across different editing "sessions" (e.g., delete "ab", type something, then delete "cd" adjacent to the first deletion) would get different IDs unless we also handle this case
- Slightly more complex deletion logic

**Risk:** Low. The serializer already handles multiple segments with the same ID, and the `pairedWith` guard prevents contaminating substitution pairs.

### Option B: Post-Hoc Mark Consolidation

**Approach:** After each deletion, scan the block for adjacent standalone deletion marks and replace them with a single mark spanning the full range, using one ID.

**Changes:** Add a consolidation step after `handleSingleCharDelete` dispatches:
1. Walk the block containing the new deletion
2. Find runs of adjacent standalone deletion marks
3. Remove the individual marks and apply one mark spanning the full run

**Pros:**
- Clean separation: deletion logic stays simple, consolidation is a separate concern
- Handles all edge cases (deletions from different sessions that become adjacent)

**Cons:**
- **Potentially breaks undo.** Consolidation is a new transaction. Undoing the consolidation doesn't undo the deletion — the undo stack gets polluted.
- More complex than Option A
- Must run after every deletion, adding overhead

**Risk:** Medium. Undo interaction is the main concern.

### Option C: Remove `contenteditable=false`, Intercept All Input

**Approach:** Make deletion spans editable (remove `contenteditable=false`) but intercept all input events to prevent modification. Rely on `handleTextInput`, `handleKeyDown`, and `handlePaste` to reject edits within deletion ranges.

**Changes:**
1. Remove `contenteditable: 'false'` from `TrackedDeletion.renderHTML`
2. Remove `user-select: none` from `.tracked-deletion` CSS
3. Add input guards: if cursor is inside a deletion mark, reject text input, paste, etc.
4. Keep visual styling (red strikethrough)

**Pros:**
- Completely eliminates cursor dead zones — cursor can land anywhere
- No DOM fragmentation issues at all
- Simpler mental model: marks are just data + styling

**Cons:**
- **Must handle many edge cases:** typing inside deletions, pasting into deletions, drag-and-drop into deletions, IME composition inside deletions, selecting across deletion boundaries
- Current intercept handlers don't guard against cursor-inside-deletion; they assume the cursor is always outside deletions
- Risk of regressions: any unguarded input path could corrupt deleted text
- Users could visually place cursor inside strikethrough text, which might be confusing

**Risk:** High. The surface area of input events to guard is large, and any gap would let users corrupt deleted text.

### Option D: Decorations for Visual Layer

**Approach:** Store deletion state as marks (for persistence/serialization) but use ProseMirror `Decoration.inline` for the visual strikethrough styling. Marks would not set `contenteditable=false`.

**Pros:**
- Separates data (marks) from presentation (decorations)
- Could theoretically allow cursor positioning while keeping visual styling

**Cons:**
- Decorations are ephemeral — must recalculate on every document change
- "Inline decoration rerendering has poor performance" (ProseMirror docs) — all spans after an edit position are re-rendered
- Doesn't solve the core issue: you still need marks for data, and without `contenteditable=false` on the marks, you need the same input guards as Option C
- Adds complexity without clear benefit over Option C

**Risk:** High. Combines the downsides of Options C and additional performance concerns.

---

## Recommendation

**Option A (Adjacent ID Reuse)** is the best path forward:
- Lowest risk, smallest change
- Directly addresses the DOM fragmentation root cause
- No undo/redo concerns
- Serializer compatibility guaranteed (already merges by adjacency)
- Preserves the `contenteditable=false` model that prevents accidental editing

Option C is interesting as a longer-term direction but would require a much larger effort and careful auditing of all input paths.

---

## Implementation Notes for Option A

### Guard: Only Reuse for Standalone Deletions

The ID reuse MUST only apply when `pairedWith === null` on the adjacent mark. Substitution deletions have `pairedWith` linking them to a specific insertion. Merging their IDs would break the pairing.

```ts
function findAdjacentDeletionId(
  state: EditorState,
  charPos: number,
  charEnd: number
): string | null {
  // Check character before charPos
  if (charPos > 0) {
    const $before = state.doc.resolve(charPos)
    const nodeBefore = $before.nodeBefore
    if (nodeBefore?.isText) {
      const delMark = nodeBefore.marks.find(m => m.type.name === 'trackedDeletion')
      if (delMark && delMark.attrs.pairedWith === null) {
        return delMark.attrs.id
      }
    }
  }
  // Check character after charEnd
  if (charEnd < state.doc.content.size) {
    const $after = state.doc.resolve(charEnd)
    const nodeAfter = $after.nodeAfter
    if (nodeAfter?.isText) {
      const delMark = nodeAfter.marks.find(m => m.type.name === 'trackedDeletion')
      if (delMark && delMark.attrs.pairedWith === null) {
        return delMark.attrs.id
      }
    }
  }
  return null
}
```

### Cursor Skip Logic May Need Adjustment

With merged spans, the cursor skip logic (`lines 206–243`) should still work — it scans for any `trackedDeletion` mark regardless of ID. But verify that the cursor lands correctly at the boundary of the merged span.

### Serialization Impact: None

The serializer merges by adjacency, not by ID. Whether adjacent deletion segments share the same ID or have different IDs, the output is identical: `{--merged text--}`.

### Import Impact: None

The parser already creates one deletion segment per CriticMarkup token. `{--hello--}` becomes one segment with one ID. No change needed.
