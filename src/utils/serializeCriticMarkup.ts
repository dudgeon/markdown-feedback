import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

interface Segment {
  text: string
  isDeletion: boolean
  isInsertion: boolean
  id: string | null
  pairedWith: string | null
}

/**
 * Serialize a ProseMirror document into a CriticMarkup string.
 *
 * Walks the doc tree, converting tracked-change marks into CriticMarkup syntax:
 *   {--deleted text--}       standalone deletions
 *   {++inserted text++}      standalone insertions
 *   {~~old text~>new text~~} substitutions (paired deletion + insertion)
 */
export function serializeCriticMarkup(doc: ProseMirrorNode): string {
  const blocks: string[] = []

  doc.forEach((blockNode) => {
    const prefix = getBlockPrefix(blockNode)
    const segments = collectSegments(blockNode)
    const markup = serializeSegments(segments)
    blocks.push(prefix + markup)
  })

  return blocks.join('\n\n')
}

/** Collect inline text segments with their mark metadata from a block node. */
function collectSegments(blockNode: ProseMirrorNode): Segment[] {
  const segments: Segment[] = []

  blockNode.forEach((node) => {
    if (!node.isText || !node.text) return

    const delMark = node.marks.find((m) => m.type.name === 'trackedDeletion')
    const insMark = node.marks.find((m) => m.type.name === 'trackedInsertion')

    segments.push({
      text: node.text,
      isDeletion: !!delMark,
      isInsertion: !!insMark,
      id: delMark?.attrs.id ?? insMark?.attrs.id ?? null,
      pairedWith: delMark?.attrs.pairedWith ?? insMark?.attrs.pairedWith ?? null,
    })
  })

  return segments
}

/** Convert a flat array of segments into a CriticMarkup string. */
function serializeSegments(segments: Segment[]): string {
  let result = ''
  // Track insertion IDs that have been consumed by a substitution
  const consumedInsertionIds = new Set<string>()

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    // Skip insertions already emitted as part of a substitution
    if (seg.isInsertion && seg.id && consumedInsertionIds.has(seg.id)) {
      continue
    }

    if (seg.isDeletion && seg.pairedWith) {
      // Substitution deletion — collect all deletion text for this pairedWith group,
      // then find the paired insertion
      const pairedInsId = seg.pairedWith
      const delText = collectSubstitutionDeletionText(segments, i, pairedInsId)
      const insText = collectSubstitutionInsertionText(
        segments,
        pairedInsId,
        consumedInsertionIds
      )
      result += `{~~${delText}~>${insText}~~}`
      // Skip remaining deletion segments in this group
      while (
        i + 1 < segments.length &&
        segments[i + 1].isDeletion &&
        segments[i + 1].pairedWith === pairedInsId
      ) {
        i++
      }
    } else if (seg.isDeletion) {
      // Standalone deletion — merge with adjacent standalone deletions
      let delText = seg.text
      while (
        i + 1 < segments.length &&
        segments[i + 1].isDeletion &&
        !segments[i + 1].pairedWith
      ) {
        i++
        delText += segments[i].text
      }
      result += `{--${delText}--}`
    } else if (seg.isInsertion) {
      // Standalone insertion — merge with adjacent standalone insertions
      let insText = seg.text
      while (
        i + 1 < segments.length &&
        segments[i + 1].isInsertion &&
        !segments[i + 1].pairedWith &&
        !(segments[i + 1].id && consumedInsertionIds.has(segments[i + 1].id!))
      ) {
        i++
        insText += segments[i].text
      }
      result += `{++${insText}++}`
    } else {
      // Original text
      result += seg.text
    }
  }

  return result
}

/**
 * Collect deletion text for a substitution group.
 * Gathers text from all segments (starting at `startIdx`) that are deletions
 * with the same `pairedWith` value, skipping any interleaved non-matching segments
 * (e.g., old deletions that were already in the document before the substitution).
 */
function collectSubstitutionDeletionText(
  segments: Segment[],
  startIdx: number,
  pairedInsId: string
): string {
  let text = ''
  for (let i = startIdx; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.isDeletion && seg.pairedWith === pairedInsId) {
      text += seg.text
    } else if (seg.isDeletion && !seg.pairedWith) {
      // Old deletion interleaved — skip it (it will be emitted separately)
      continue
    } else {
      break
    }
  }
  return text
}

/**
 * Find the insertion segment(s) whose `id` matches `pairedInsId` and collect their text.
 * Marks them as consumed so they won't be emitted again as standalone insertions.
 */
function collectSubstitutionInsertionText(
  segments: Segment[],
  pairedInsId: string,
  consumedInsertionIds: Set<string>
): string {
  let text = ''
  for (const seg of segments) {
    if (seg.isInsertion && seg.id === pairedInsId) {
      text += seg.text
      consumedInsertionIds.add(seg.id)
    }
  }
  return text
}

/** Get the markdown block prefix for a node (e.g., `# ` for h1). */
function getBlockPrefix(node: ProseMirrorNode): string {
  if (node.type.name === 'heading') {
    const level = (node.attrs.level as number) ?? 1
    return '#'.repeat(level) + ' '
  }
  return ''
}
