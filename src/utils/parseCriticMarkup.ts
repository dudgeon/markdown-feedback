import { nanoid } from 'nanoid'
import type { CommentThread } from './extractChanges'

export interface ParsedSegment {
  text: string
  type: 'original' | 'deletion' | 'insertion' | 'highlight' | 'comment'
  id?: string
  pairedWith?: string
}

/**
 * Parse a CriticMarkup string into typed segments.
 *
 * Tokens:
 *   {~~old~>new~~}  → substitution (paired deletion + insertion)
 *   {==text==}      → highlight (standalone comment target)
 *   {--text--}      → deletion
 *   {++text++}      → insertion
 *   {>>comment<<}   → comment (linked to preceding change/highlight)
 *   everything else → original text
 */
export function parseCriticMarkup(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []

  // Combined regex matching all CriticMarkup tokens.
  // Order matters: substitution first, then highlight, then deletion/insertion, then comment.
  const tokenRe =
    /\{~~([\s\S]+?)~>([\s\S]*?)~~\}|\{==([\s\S]+?)==\}|\{--([\s\S]+?)--\}|\{\+\+([\s\S]+?)\+\+\}|\{>>([\s\S]+?)<<\}/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(text)) !== null) {
    // Text before this token → original
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        type: 'original',
      })
    }

    if (match[1] !== undefined) {
      // Substitution: {~~old~>new~~}
      const delId = nanoid(8)
      const insId = nanoid(8)
      if (match[1]) {
        segments.push({
          text: match[1],
          type: 'deletion',
          id: delId,
          pairedWith: insId,
        })
      }
      if (match[2]) {
        segments.push({
          text: match[2],
          type: 'insertion',
          id: insId,
          pairedWith: delId,
        })
      }
    } else if (match[3] !== undefined) {
      // Highlight: {==text==}
      segments.push({
        text: match[3],
        type: 'highlight',
        id: nanoid(8),
      })
    } else if (match[4] !== undefined) {
      // Deletion: {--text--}
      segments.push({
        text: match[4],
        type: 'deletion',
        id: nanoid(8),
      })
    } else if (match[5] !== undefined) {
      // Insertion: {++text++}
      segments.push({
        text: match[5],
        type: 'insertion',
        id: nanoid(8),
      })
    } else if (match[6] !== undefined) {
      // Comment: {>>text<<}
      segments.push({
        text: match[6],
        type: 'comment',
      })
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text after last token → original
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      type: 'original',
    })
  }

  return segments
}

/**
 * Extract comment threads from parsed segments by linking each comment token
 * to the preceding change or highlight segment.
 *
 * Multiple consecutive {>>…<<} blocks after a single change each become their
 * own CommentThread entry in the array — enabling reply threads.
 *
 * Returns a Record mapping change/highlight IDs to arrays of CommentThread.
 */
export function extractCommentsFromSegments(
  segments: ParsedSegment[]
): Record<string, CommentThread[]> {
  const threads: Record<string, CommentThread[]> = {}

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type !== 'comment') continue

    // Scan backwards for the nearest change/highlight segment
    for (let j = i - 1; j >= 0; j--) {
      const prev = segments[j]
      if (
        prev.id &&
        (prev.type === 'deletion' ||
          prev.type === 'insertion' ||
          prev.type === 'highlight')
      ) {
        // For substitutions, the insertion is the last segment before the comment.
        // Use the deletion's ID (via pairedWith) since extractChanges uses the
        // deletion's ID as the substitution entry's ID.
        const key = (prev.type === 'insertion' && prev.pairedWith)
          ? prev.pairedWith
          : prev.id
        if (!threads[key]) threads[key] = []
        threads[key].push({ id: nanoid(8), text: segments[i].text })
        break
      }
    }
  }

  return threads
}

/**
 * Convert a CriticMarkup string to TipTap-compatible HTML and extract comments.
 *
 * Handles:
 *   - YAML frontmatter (--- ... ---) → stripped
 *   - Paragraph breaks (blank lines) → separate elements
 *   - Heading prefixes (# , ## , ### ) → <h1>, <h2>, <h3>
 *   - Headings are always single-line blocks (even with only \n after)
 *   - CriticMarkup tokens → <span> elements with tracked-change classes
 *   - Comments → extracted into Record, not rendered as HTML
 */
export function criticMarkupToHTML(text: string): {
  html: string
  comments: Record<string, CommentThread[]>
} {
  const stripped = stripFrontmatter(text)
  const blocks = splitIntoBlocks(stripped)
  const htmlBlocks: string[] = []
  const allComments: Record<string, CommentThread[]> = {}

  for (const block of blocks) {
    if (!block.trim()) continue

    // Check for heading prefix
    const headingMatch = block.match(/^(#{1,3}) (.*)/)
    let tag: string
    let content: string

    if (headingMatch) {
      const level = headingMatch[1].length
      tag = `h${level}`
      content = headingMatch[2]
    } else {
      tag = 'p'
      content = block
    }

    // Parse CriticMarkup tokens within this block
    const segments = parseCriticMarkup(content)
    const blockComments = extractCommentsFromSegments(segments)
    for (const [key, newThreads] of Object.entries(blockComments)) {
      if (allComments[key]) {
        allComments[key] = [...allComments[key], ...newThreads]
      } else {
        allComments[key] = newThreads
      }
    }
    const inner = segments.map(segmentToHTML).join('')

    htmlBlocks.push(`<${tag}>${inner}</${tag}>`)
  }

  return { html: htmlBlocks.join(''), comments: allComments }
}

/**
 * Strip YAML frontmatter (--- ... ---) from the start of a document.
 * Handles the frontmatter that exportCriticMarkup() prepends.
 */
function stripFrontmatter(text: string): string {
  const match = text.match(/^---\n[\s\S]*?\n---\n*/)
  return match ? text.slice(match[0].length) : text
}

/**
 * Split markdown text into blocks, handling:
 * - Blank lines as paragraph separators
 * - Headings as always-single-line blocks (even with only \n after them)
 *
 * This avoids the naive \n\n split which drops content when a heading
 * is followed by body text with only a single newline.
 */
function splitIntoBlocks(text: string): string[] {
  const lines = text.split('\n')
  const blocks: string[] = []
  let current: string[] = []

  for (const line of lines) {
    const isBlank = line.trim() === ''
    const isHeading = /^#{1,3} /.test(line)

    if (isBlank) {
      // Blank line ends the current block
      if (current.length > 0) {
        blocks.push(current.join('\n'))
        current = []
      }
    } else if (isHeading) {
      // Headings are always their own block — flush any accumulated lines first
      if (current.length > 0) {
        blocks.push(current.join('\n'))
        current = []
      }
      blocks.push(line)
    } else {
      // Non-blank, non-heading line — accumulate into current block
      current.push(line)
    }
  }

  // Flush remaining lines
  if (current.length > 0) {
    blocks.push(current.join('\n'))
  }

  return blocks
}

/** Convert a single parsed segment to an HTML string. */
function segmentToHTML(seg: ParsedSegment): string {
  const escaped = escapeHTML(seg.text)

  switch (seg.type) {
    case 'deletion': {
      const paired = seg.pairedWith
        ? ` data-paired="${seg.pairedWith}"`
        : ''
      return `<span class="tracked-deletion" data-id="${seg.id}"${paired}>${escaped}</span>`
    }
    case 'insertion': {
      const paired = seg.pairedWith
        ? ` data-paired="${seg.pairedWith}"`
        : ''
      return `<span class="tracked-insertion" data-id="${seg.id}"${paired}>${escaped}</span>`
    }
    case 'highlight':
      return `<span class="tracked-highlight" data-id="${seg.id}">${escaped}</span>`
    case 'comment':
      // Comments don't render as HTML — they're metadata extracted separately
      return ''
    default:
      return escaped
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
