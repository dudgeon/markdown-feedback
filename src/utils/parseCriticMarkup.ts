import { nanoid } from 'nanoid'

export interface ParsedSegment {
  text: string
  type: 'original' | 'deletion' | 'insertion'
  id?: string
  pairedWith?: string
}

/**
 * Parse a CriticMarkup string into typed segments.
 *
 * Tokens:
 *   {~~old~>new~~}  → substitution (paired deletion + insertion)
 *   {--text--}      → deletion
 *   {++text++}      → insertion
 *   {>>comment<<}   → stripped (Phase 5)
 *   everything else → original text
 */
export function parseCriticMarkup(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []

  // Combined regex matching all CriticMarkup tokens.
  // Order matters: substitution before deletion/insertion so {~~ is matched first.
  const tokenRe =
    /\{~~([\s\S]+?)~>([\s\S]*?)~~\}|\{--([\s\S]+?)--\}|\{\+\+([\s\S]+?)\+\+\}|\{>>([\s\S]+?)<<\}/g

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
      // Deletion: {--text--}
      segments.push({
        text: match[3],
        type: 'deletion',
        id: nanoid(8),
      })
    } else if (match[4] !== undefined) {
      // Insertion: {++text++}
      segments.push({
        text: match[4],
        type: 'insertion',
        id: nanoid(8),
      })
    }
    // match[5] = comment → silently strip

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
 * Convert a CriticMarkup string to TipTap-compatible HTML.
 *
 * Handles:
 *   - YAML frontmatter (--- ... ---) → stripped
 *   - Paragraph breaks (blank lines) → separate elements
 *   - Heading prefixes (# , ## , ### ) → <h1>, <h2>, <h3>
 *   - Headings are always single-line blocks (even with only \n after)
 *   - CriticMarkup tokens → <span> elements with tracked-change classes
 */
export function criticMarkupToHTML(text: string): string {
  const stripped = stripFrontmatter(text)
  const blocks = splitIntoBlocks(stripped)
  const htmlBlocks: string[] = []

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
    const inner = segments.map(segmentToHTML).join('')

    htmlBlocks.push(`<${tag}>${inner}</${tag}>`)
  }

  return htmlBlocks.join('')
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
