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
 *   - Rich mode: markdown inline syntax (bold, italic, code, strike, links)
 *     and block elements (lists, blockquotes, code blocks) → real HTML tags
 */
export function criticMarkupToHTML(
  text: string,
  richMode: boolean = false
): {
  html: string
  comments: Record<string, CommentThread[]>
} {
  const stripped = stripFrontmatter(text)
  const blocks = richMode ? splitIntoRichBlocks(stripped) : splitIntoBlocks(stripped)
  const htmlBlocks: string[] = []
  const allComments: Record<string, CommentThread[]> = {}

  const mergeComments = (blockComments: Record<string, CommentThread[]>) => {
    for (const [key, newThreads] of Object.entries(blockComments)) {
      if (allComments[key]) {
        allComments[key] = [...allComments[key], ...newThreads]
      } else {
        allComments[key] = newThreads
      }
    }
  }

  for (const block of blocks) {
    if (!block.trim()) continue

    // Rich mode: code blocks
    if (richMode) {
      const codeBlockMatch = block.match(/^```(?:\w*)\n([\s\S]*?)(?:\n```)?$/)
      if (codeBlockMatch) {
        htmlBlocks.push(`<pre><code>${escapeHTML(codeBlockMatch[1])}</code></pre>`)
        continue
      }
    }

    // Rich mode: blockquotes
    if (richMode && /^> /.test(block)) {
      const quoteLines = block.split('\n').map((l: string) => l.replace(/^> ?/, ''))
      const quoteContent = quoteLines.join('\n')
      const segments = parseCriticMarkup(quoteContent)
      mergeComments(extractCommentsFromSegments(segments))
      const inner = segments.map((s) => segmentToHTML(s, richMode)).join('')
      htmlBlocks.push(`<blockquote><p>${inner}</p></blockquote>`)
      continue
    }

    // Rich mode: unordered lists
    if (richMode && /^[-*] /.test(block)) {
      const items = groupListItems(block, /^[-*] /)
      let listHtml = '<ul>'
      for (const content of items) {
        const segments = parseCriticMarkup(content)
        mergeComments(extractCommentsFromSegments(segments))
        const inner = segments.map((s) => segmentToHTML(s, richMode)).join('')
        listHtml += `<li><p>${inner}</p></li>`
      }
      listHtml += '</ul>'
      htmlBlocks.push(listHtml)
      continue
    }

    // Rich mode: ordered lists
    if (richMode && /^\d+\. /.test(block)) {
      const items = groupListItems(block, /^\d+\. /)
      let listHtml = '<ol>'
      for (const content of items) {
        const segments = parseCriticMarkup(content)
        mergeComments(extractCommentsFromSegments(segments))
        const inner = segments.map((s) => segmentToHTML(s, richMode)).join('')
        listHtml += `<li><p>${inner}</p></li>`
      }
      listHtml += '</ol>'
      htmlBlocks.push(listHtml)
      continue
    }

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
    mergeComments(extractCommentsFromSegments(segments))
    const inner = segments.map((s) => segmentToHTML(s, richMode)).join('')

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

/**
 * Split markdown text into blocks for rich mode.
 * In addition to headings, also detects list items, blockquotes, and code blocks
 * as distinct block types that should be grouped together.
 */
function splitIntoRichBlocks(text: string): string[] {
  const lines = text.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let inCodeBlock = false
  let codeBlockLines: string[] = []

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
  }

  for (const line of lines) {
    // Code block fences
    if (/^```/.test(line)) {
      if (!inCodeBlock) {
        flush()
        inCodeBlock = true
        codeBlockLines = [line]
      } else {
        codeBlockLines.push(line)
        blocks.push(codeBlockLines.join('\n'))
        codeBlockLines = []
        inCodeBlock = false
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockLines.push(line)
      continue
    }

    const isBlank = line.trim() === ''
    const isHeading = /^#{1,3} /.test(line)
    const isUL = /^[-*] /.test(line)
    const isOL = /^\d+\. /.test(line)
    const isBQ = /^> /.test(line)

    if (isBlank) {
      flush()
    } else if (isHeading) {
      flush()
      blocks.push(line)
    } else if (isUL) {
      // Accumulate consecutive UL items together
      if (current.length > 0 && !/^[-*] /.test(current[0])) flush()
      current.push(line)
    } else if (isOL) {
      if (current.length > 0 && !/^\d+\. /.test(current[0])) flush()
      current.push(line)
    } else if (isBQ) {
      if (current.length > 0 && !/^> /.test(current[0])) flush()
      current.push(line)
    } else {
      // Regular paragraph line
      if (current.length > 0 && (/^[-*] /.test(current[0]) || /^\d+\. /.test(current[0]))) {
        // Continuation line within a list item — keep accumulating
        current.push(line)
      } else if (current.length > 0 && /^> /.test(current[0])) {
        flush()
        current.push(line)
      } else {
        current.push(line)
      }
    }
  }

  // Flush remaining
  if (inCodeBlock && codeBlockLines.length > 0) {
    blocks.push(codeBlockLines.join('\n'))
  }
  flush()

  return blocks
}

/**
 * Group lines in a list block into individual item contents.
 * Lines starting with the marker pattern begin a new item;
 * other non-blank lines are continuation lines joined with a space.
 */
function groupListItems(block: string, markerRe: RegExp): string[] {
  const lines = block.split('\n').filter((l: string) => l.trim())
  const items: string[] = []
  for (const line of lines) {
    if (markerRe.test(line)) {
      items.push(line.replace(markerRe, ''))
    } else if (items.length > 0) {
      // Continuation line — append to previous item
      items[items.length - 1] += ' ' + line.trim()
    }
  }
  return items
}

/** Convert a single parsed segment to an HTML string. */
function segmentToHTML(seg: ParsedSegment, richMode: boolean = false): string {
  const escaped = escapeHTML(seg.text)
  const content = richMode ? parseInlineMarkdown(escaped) : escaped

  switch (seg.type) {
    case 'deletion': {
      const paired = seg.pairedWith
        ? ` data-paired="${seg.pairedWith}"`
        : ''
      return `<span class="tracked-deletion" data-id="${seg.id}"${paired}>${content}</span>`
    }
    case 'insertion': {
      const paired = seg.pairedWith
        ? ` data-paired="${seg.pairedWith}"`
        : ''
      return `<span class="tracked-insertion" data-id="${seg.id}"${paired}>${content}</span>`
    }
    case 'highlight':
      return `<span class="tracked-highlight" data-id="${seg.id}">${content}</span>`
    case 'comment':
      // Comments don't render as HTML — they're metadata extracted separately
      return ''
    default:
      return content
  }
}

/**
 * Parse inline markdown syntax in already-escaped HTML text.
 * Handles: bold (**), italic (*), inline code (`), strikethrough (~~), links ([text](url)).
 *
 * Order matters: bold before italic (** before *), and code first (to prevent
 * parsing markdown inside code spans).
 */
function parseInlineMarkdown(text: string): string {
  let result = text

  // Inline code (backticks) — process first to protect contents from further parsing
  // Replace code spans with placeholders, process other markdown, then restore
  const codeSpans: string[] = []
  result = result.replace(/`([^`]+?)`/g, (_match, code: string) => {
    const idx = codeSpans.length
    codeSpans.push(`<code>${code}</code>`)
    return `\x00CODE${idx}\x00`
  })

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>')

  // Italic: *text* or _text_ (but not inside words for underscore)
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>')
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>')

  // Links: [text](url)
  result = result.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '<a href="$2">$1</a>')

  // Restore code spans
  result = result.replace(/\x00CODE(\d+)\x00/g, (_match, idx: string) => {
    return codeSpans[parseInt(idx, 10)]
  })

  return result
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
