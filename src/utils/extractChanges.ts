import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * A single comment thread entry attached to a tracked change or highlight.
 * Multiple threads per change are supported (reply threads).
 * Serialized as adjacent {>>...<<} blocks in CriticMarkup output.
 */
export interface CommentThread {
  id: string
  text: string
}

export interface ChangeEntry {
  type: 'deletion' | 'insertion' | 'substitution' | 'highlight'
  id: string
  deletedText?: string
  insertedText?: string
  highlightedText?: string
  comments?: CommentThread[]
  contextBefore: string
  contextAfter: string
  from: number
  to: number
}

interface PositionedSegment {
  text: string
  isDeletion: boolean
  isInsertion: boolean
  isHighlight: boolean
  id: string | null
  pairedWith: string | null
  from: number
  to: number
}

/**
 * Extract all tracked changes and highlights from a ProseMirror document.
 *
 * Walks the doc tree (same pattern as serializeCriticMarkup) and returns
 * a list of changes with type, text, context, and positions for scrollTo.
 *
 * If a comments Record is provided, comment text is merged into each entry
 * by matching change/highlight IDs.
 */
export function extractChanges(
  doc: ProseMirrorNode,
  comments: Record<string, CommentThread[]> = {}
): ChangeEntry[] {
  const changes: ChangeEntry[] = []

  doc.forEach((blockNode, blockOffset) => {
    const basePos = blockOffset + 1 // +1 for the block node's opening tag
    const segments = collectPositionedSegments(blockNode, basePos)
    const blockChanges = groupSegmentsIntoChanges(segments)
    changes.push(...blockChanges)
  })

  // Merge consecutive highlight entries with the same ID across block boundaries.
  // ProseMirror marks cannot span block nodes, so a single highlight selection
  // spanning multiple paragraphs produces one mark per block — all sharing the
  // same `id`. Merge them into one ChangeEntry here so the panel shows a single
  // highlight card.
  const merged: ChangeEntry[] = []
  for (const change of changes) {
    const prev = merged[merged.length - 1]
    if (
      change.type === 'highlight' &&
      prev?.type === 'highlight' &&
      prev.id === change.id
    ) {
      prev.highlightedText = (prev.highlightedText ?? '') + '\n' + (change.highlightedText ?? '')
      prev.to = change.to
      prev.contextAfter = change.contextAfter
      // Merge comment threads from each block-segment into the unified entry
      if (change.comments?.length) {
        prev.comments = [...(prev.comments ?? []), ...change.comments]
      }
    } else {
      merged.push(change)
    }
  }

  // Merge comment threads into entries
  for (const change of merged) {
    if (comments[change.id]?.length) {
      change.comments = comments[change.id]
    }
  }

  return merged
}

/** Collect inline segments with position info from a block node. */
function collectPositionedSegments(
  blockNode: ProseMirrorNode,
  basePos: number
): PositionedSegment[] {
  const segments: PositionedSegment[] = []

  blockNode.forEach((node, nodeOffset) => {
    if (!node.isText || !node.text) return

    const delMark = node.marks.find((m) => m.type.name === 'trackedDeletion')
    const insMark = node.marks.find((m) => m.type.name === 'trackedInsertion')
    const hlMark = node.marks.find((m) => m.type.name === 'trackedHighlight')

    segments.push({
      text: node.text,
      isDeletion: !!delMark,
      isInsertion: !!insMark,
      isHighlight: !!hlMark,
      id: delMark?.attrs.id ?? insMark?.attrs.id ?? hlMark?.attrs.id ?? null,
      pairedWith:
        delMark?.attrs.pairedWith ?? insMark?.attrs.pairedWith ?? null,
      from: basePos + nodeOffset,
      to: basePos + nodeOffset + node.nodeSize,
    })
  })

  return segments
}

/** Group flat segments into change entries, mirroring serializer logic. */
function groupSegmentsIntoChanges(
  segments: PositionedSegment[]
): ChangeEntry[] {
  const changes: ChangeEntry[] = []
  const consumedInsertionIds = new Set<string>()

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    // Skip original text (no marks)
    if (!seg.isDeletion && !seg.isInsertion && !seg.isHighlight) continue

    // Skip insertions already consumed by a substitution
    if (seg.isInsertion && seg.id && consumedInsertionIds.has(seg.id)) continue

    if (seg.isHighlight) {
      // Highlight — merge adjacent with same ID
      let hlText = seg.text
      const hlFrom = seg.from
      let hlTo = seg.to
      let j = i + 1

      while (
        j < segments.length &&
        segments[j].isHighlight &&
        segments[j].id === seg.id
      ) {
        hlText += segments[j].text
        hlTo = segments[j].to
        j++
      }

      const contextBefore = getContextBefore(segments, i, 5)
      const contextAfter = getContextAfter(segments, j, 5)

      changes.push({
        type: 'highlight',
        id: seg.id ?? '',
        highlightedText: hlText,
        contextBefore,
        contextAfter,
        from: hlFrom,
        to: hlTo,
      })

      i = j - 1
    } else if (seg.isDeletion && seg.pairedWith) {
      // Substitution — collect deletion text and find paired insertion
      const pairedInsId = seg.pairedWith
      let delText = ''
      let delFrom = seg.from
      let delTo = seg.to

      // Gather all deletion segments in this substitution group
      let j = i
      while (j < segments.length) {
        const s = segments[j]
        if (s.isDeletion && s.pairedWith === pairedInsId) {
          delText += s.text
          delTo = s.to
          j++
        } else if (s.isDeletion && !s.pairedWith) {
          // Old interleaved deletion — skip
          j++
        } else {
          break
        }
      }

      // Find paired insertion
      let insText = ''
      let insTo = delTo
      for (const s of segments) {
        if (s.isInsertion && s.id === pairedInsId) {
          insText += s.text
          insTo = Math.max(insTo, s.to)
          consumedInsertionIds.add(s.id)
        }
      }

      const contextBefore = getContextBefore(segments, i, 5)
      const contextAfter = getContextAfter(segments, j, 5)

      changes.push({
        type: 'substitution',
        id: seg.id ?? pairedInsId,
        deletedText: delText,
        insertedText: insText,
        contextBefore,
        contextAfter,
        from: delFrom,
        to: insTo,
      })

      // Skip past the deletion segments we consumed
      i = j - 1
    } else if (seg.isDeletion) {
      // Standalone deletion — merge adjacent
      let delText = seg.text
      const delFrom = seg.from
      let delTo = seg.to
      let j = i + 1

      while (
        j < segments.length &&
        segments[j].isDeletion &&
        !segments[j].pairedWith
      ) {
        delText += segments[j].text
        delTo = segments[j].to
        j++
      }

      const contextBefore = getContextBefore(segments, i, 5)
      const contextAfter = getContextAfter(segments, j, 5)

      changes.push({
        type: 'deletion',
        id: seg.id ?? '',
        deletedText: delText,
        contextBefore,
        contextAfter,
        from: delFrom,
        to: delTo,
      })

      i = j - 1
    } else if (seg.isInsertion) {
      // Standalone insertion — merge adjacent
      let insText = seg.text
      const insFrom = seg.from
      let insTo = seg.to
      let j = i + 1

      while (
        j < segments.length &&
        segments[j].isInsertion &&
        !segments[j].pairedWith &&
        !(segments[j].id && consumedInsertionIds.has(segments[j].id!))
      ) {
        insText += segments[j].text
        insTo = segments[j].to
        j++
      }

      const contextBefore = getContextBefore(segments, i, 5)
      const contextAfter = getContextAfter(segments, j, 5)

      changes.push({
        type: 'insertion',
        id: seg.id ?? '',
        insertedText: insText,
        contextBefore,
        contextAfter,
        from: insFrom,
        to: insTo,
      })

      i = j - 1
    }
  }

  return changes
}

/** Get ~N words of original text before the segment at `idx`. */
function getContextBefore(
  segments: PositionedSegment[],
  idx: number,
  wordCount: number
): string {
  let text = ''
  for (let i = idx - 1; i >= 0; i--) {
    if (!segments[i].isDeletion && !segments[i].isInsertion && !segments[i].isHighlight) {
      text = segments[i].text + text
    }
  }
  return lastNWords(text.trim(), wordCount)
}

/** Get ~N words of original text after the segment at `idx`. */
function getContextAfter(
  segments: PositionedSegment[],
  idx: number,
  wordCount: number
): string {
  let text = ''
  for (let i = idx; i < segments.length; i++) {
    if (!segments[i].isDeletion && !segments[i].isInsertion && !segments[i].isHighlight) {
      text += segments[i].text
    }
  }
  return firstNWords(text.trim(), wordCount)
}

function lastNWords(text: string, n: number): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= n) return text
  return '...' + words.slice(-n).join(' ')
}

function firstNWords(text: string, n: number): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= n) return text
  return words.slice(0, n).join(' ') + '...'
}
