import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { CommentThread } from './extractChanges'

interface Segment {
  text: string
  isDeletion: boolean
  isInsertion: boolean
  isHighlight: boolean
  id: string | null
  pairedWith: string | null
  // Inline formatting marks
  bold: boolean
  italic: boolean
  code: boolean
  strike: boolean
  link: string | null // href if link mark present
}

/**
 * Serialize a ProseMirror document into a CriticMarkup string.
 *
 * Walks the doc tree, converting tracked-change marks into CriticMarkup syntax:
 *   {--deleted text--}       standalone deletions
 *   {++inserted text++}      standalone insertions
 *   {~~old text~>new text~~} substitutions (paired deletion + insertion)
 *   {==highlighted text==}   highlights (standalone comment targets)
 *   {>>comment text<<}       comments (from external Record, after their change/highlight)
 */
export function serializeCriticMarkup(
  doc: ProseMirrorNode,
  comments: Record<string, CommentThread[]> = {}
): string {
  const blocks: string[] = []

  doc.forEach((blockNode) => {
    blocks.push(serializeNode(blockNode, comments, ''))
  })

  return blocks.join('\n\n')
}

/** Recursively serialize a block node into markdown + CriticMarkup. */
function serializeNode(
  node: ProseMirrorNode,
  comments: Record<string, CommentThread[]>,
  indent: string
): string {
  const typeName = node.type.name

  if (typeName === 'bulletList') {
    const items: string[] = []
    node.forEach((listItem) => {
      items.push(serializeListItem(listItem, comments, indent, '- '))
    })
    return items.join('\n')
  }

  if (typeName === 'orderedList') {
    const items: string[] = []
    let num = (node.attrs.start as number) ?? 1
    node.forEach((listItem) => {
      const prefix = `${num}. `
      items.push(serializeListItem(listItem, comments, indent, prefix))
      num++
    })
    return items.join('\n')
  }

  if (typeName === 'blockquote') {
    const lines: string[] = []
    node.forEach((child) => {
      const segments = collectSegments(child)
      const markup = serializeSegments(segments, comments)
      lines.push(indent + '> ' + markup)
    })
    return lines.join('\n')
  }

  if (typeName === 'codeBlock') {
    const lang = (node.attrs.language as string) ?? ''
    const code = node.textContent
    return indent + '```' + lang + '\n' + code + '\n' + indent + '```'
  }

  if (typeName === 'horizontalRule') {
    return indent + '---'
  }

  // Textblock (paragraph, heading, etc.) — has inline content
  const prefix = getBlockPrefix(node)
  const segments = collectSegments(node)
  const markup = serializeSegments(segments, comments)
  return indent + prefix + markup
}

/** Serialize a single list item, which may contain paragraphs and nested lists. */
function serializeListItem(
  listItem: ProseMirrorNode,
  comments: Record<string, CommentThread[]>,
  indent: string,
  marker: string
): string {
  const lines: string[] = []
  let isFirst = true

  listItem.forEach((child) => {
    const childType = child.type.name
    if (childType === 'bulletList' || childType === 'orderedList') {
      // Nested list — indent under the parent marker
      lines.push(serializeNode(child, comments, indent + '  '))
    } else {
      const segments = collectSegments(child)
      const markup = serializeSegments(segments, comments)
      if (isFirst) {
        lines.push(indent + marker + markup)
      } else {
        // Continuation paragraph — indent to align with first line content
        lines.push(indent + ' '.repeat(marker.length) + markup)
      }
    }
    isFirst = false
  })

  return lines.join('\n')
}

/** Collect inline text segments with their mark metadata from a block node. */
function collectSegments(blockNode: ProseMirrorNode): Segment[] {
  const segments: Segment[] = []

  blockNode.forEach((node) => {
    if (!node.isText || !node.text) return

    const delMark = node.marks.find((m) => m.type.name === 'trackedDeletion')
    const insMark = node.marks.find((m) => m.type.name === 'trackedInsertion')
    const hlMark = node.marks.find((m) => m.type.name === 'trackedHighlight')
    const linkMark = node.marks.find((m) => m.type.name === 'link')

    segments.push({
      text: node.text,
      isDeletion: !!delMark,
      isInsertion: !!insMark,
      isHighlight: !!hlMark,
      id: delMark?.attrs.id ?? insMark?.attrs.id ?? hlMark?.attrs.id ?? null,
      pairedWith: delMark?.attrs.pairedWith ?? insMark?.attrs.pairedWith ?? null,
      bold: node.marks.some((m) => m.type.name === 'bold'),
      italic: node.marks.some((m) => m.type.name === 'italic'),
      code: node.marks.some((m) => m.type.name === 'code'),
      strike: node.marks.some((m) => m.type.name === 'strike'),
      link: (linkMark?.attrs.href as string) ?? null,
    })
  })

  return segments
}

/**
 * Emit one {>>…<<} block per comment thread following a change/highlight.
 * Multiple threads produce multiple adjacent blocks, which is valid CriticMarkup.
 */
function commentSuffix(id: string | null, comments: Record<string, CommentThread[]>): string {
  if (!id || !comments[id]?.length) return ''
  return comments[id].map((t) => `{>>${t.text}<<}`).join('')
}

/** Convert a flat array of segments into a CriticMarkup string. */
function serializeSegments(
  segments: Segment[],
  comments: Record<string, CommentThread[]>
): string {
  let result = ''
  // Track insertion IDs that have been consumed by a substitution
  const consumedInsertionIds = new Set<string>()
  // Track IDs whose comments have already been emitted
  const emittedCommentIds = new Set<string>()

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    // Skip insertions already emitted as part of a substitution
    if (seg.isInsertion && seg.id && consumedInsertionIds.has(seg.id)) {
      continue
    }

    if (seg.isHighlight) {
      // Highlight — merge adjacent highlights with the same ID and same formatting
      let hlText = wrapInlineMarkdown(seg.text, seg)
      const hlId = seg.id
      while (
        i + 1 < segments.length &&
        segments[i + 1].isHighlight &&
        segments[i + 1].id === hlId
      ) {
        i++
        hlText += wrapInlineMarkdown(segments[i].text, segments[i])
      }
      result += `{==${hlText}==}`
      if (hlId) {
        result += commentSuffix(hlId, comments)
        emittedCommentIds.add(hlId)
      }
    } else if (seg.isDeletion && seg.pairedWith) {
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
      // Emit comment for the substitution (keyed by deletion ID or insertion ID)
      const subId = seg.id ?? pairedInsId
      if (subId) {
        // Check both the deletion ID and insertion ID for comments
        const delComment = seg.id ? commentSuffix(seg.id, comments) : ''
        const insComment = commentSuffix(pairedInsId, comments)
        const comment = delComment || insComment
        result += comment
        if (seg.id) emittedCommentIds.add(seg.id)
        emittedCommentIds.add(pairedInsId)
      }
      // Skip remaining deletion segments in this group
      while (
        i + 1 < segments.length &&
        segments[i + 1].isDeletion &&
        segments[i + 1].pairedWith === pairedInsId
      ) {
        i++
      }
    } else if (seg.isDeletion) {
      // Standalone deletion — merge with adjacent standalone deletions with same formatting
      let delText = wrapInlineMarkdown(seg.text, seg)
      const delId = seg.id
      while (
        i + 1 < segments.length &&
        segments[i + 1].isDeletion &&
        !segments[i + 1].pairedWith
      ) {
        i++
        delText += wrapInlineMarkdown(segments[i].text, segments[i])
      }
      result += `{--${delText}--}`
      if (delId) {
        result += commentSuffix(delId, comments)
        emittedCommentIds.add(delId)
      }
    } else if (seg.isInsertion) {
      // Standalone insertion — merge with adjacent standalone insertions
      let insText = wrapInlineMarkdown(seg.text, seg)
      const insId = seg.id
      while (
        i + 1 < segments.length &&
        segments[i + 1].isInsertion &&
        !segments[i + 1].pairedWith &&
        !(segments[i + 1].id && consumedInsertionIds.has(segments[i + 1].id!))
      ) {
        i++
        insText += wrapInlineMarkdown(segments[i].text, segments[i])
      }
      result += `{++${insText}++}`
      if (insId) {
        result += commentSuffix(insId, comments)
        emittedCommentIds.add(insId)
      }
    } else {
      // Original text
      result += wrapInlineMarkdown(seg.text, seg)
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
      text += wrapInlineMarkdown(seg.text, seg)
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
      text += wrapInlineMarkdown(seg.text, seg)
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

/** Wrap text in markdown inline syntax based on segment formatting marks. */
function wrapInlineMarkdown(text: string, seg: Segment): string {
  let result = text
  // Order: code innermost (protects content), then strike, italic, bold outermost
  if (seg.code) result = `\`${result}\``
  if (seg.strike) result = `~~${result}~~`
  if (seg.italic) result = `*${result}*`
  if (seg.bold) result = `**${result}**`
  if (seg.link) result = `[${result}](${seg.link})`
  return result
}

