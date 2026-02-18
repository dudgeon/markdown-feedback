/**
 * OOXML Walker — converts parsed Word XML DOMs into a CriticMarkup markdown string.
 *
 * Walks <w:body> → <w:p> → child elements (runs, tracked changes, comment anchors)
 * and emits markdown with CriticMarkup tokens for tracked changes and comments.
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get attribute from the w: namespace (or bare, for DOMParser-parsed OOXML). */
function wAttr(el: Element, name: string): string | null {
  return el.getAttributeNS(W_NS, name) ?? el.getAttribute(`w:${name}`)
}

/** Get all direct child elements with a given local name in the w: namespace. */
function wChildren(parent: Element, localName: string): Element[] {
  const results: Element[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1) {
      const el = child as Element
      if (el.localName === localName) results.push(el)
    }
  }
  return results
}

/** Check if a run has a given formatting property (e.g. <w:b/>, <w:i/>). */
function hasRunProp(run: Element, prop: string): boolean {
  const rPr = wChildren(run, 'rPr')[0]
  if (!rPr) return false
  const propEl = wChildren(rPr, prop)[0]
  if (!propEl) return false
  // <w:b w:val="false"/> means NOT bold — check for explicit false
  const val = wAttr(propEl, 'val')
  if (val === 'false' || val === '0') return false
  return true
}

/** Extract all text from <w:t> elements inside a run. */
function runText(run: Element): string {
  let text = ''
  for (let i = 0; i < run.childNodes.length; i++) {
    const child = run.childNodes[i] as Element
    if (child.nodeType !== 1) continue
    if (child.localName === 't') {
      text += child.textContent ?? ''
    } else if (child.localName === 'br') {
      text += '\n'
    } else if (child.localName === 'tab') {
      text += '\t'
    }
  }
  return text
}

/** Extract all text from <w:delText> elements inside a run. */
function runDelText(run: Element): string {
  let text = ''
  for (let i = 0; i < run.childNodes.length; i++) {
    const child = run.childNodes[i] as Element
    if (child.nodeType !== 1) continue
    if (child.localName === 'delText') {
      text += child.textContent ?? ''
    } else if (child.localName === 'br') {
      text += '\n'
    } else if (child.localName === 'tab') {
      text += '\t'
    }
  }
  return text
}

/** Wrap text with markdown formatting based on run properties. */
function applyFormatting(run: Element, text: string): string {
  if (!text) return text
  const bold = hasRunProp(run, 'b')
  const italic = hasRunProp(run, 'i')
  if (bold && italic) return `***${text}***`
  if (bold) return `**${text}**`
  if (italic) return `*${text}*`
  return text
}

// ── Comment Map Builder ──────────────────────────────────────────────────────

/**
 * Build a map of comment ID → comment text.
 *
 * - Each comment is prefixed with its author: "Author: text"
 * - Comments whose IDs are NOT in referencedIds have no anchor in the document
 *   body and are likely replies. They are appended to the most recent referenced
 *   comment using a newline separator so the full thread is preserved.
 */
function buildCommentMap(
  commentsXml: Document | null,
  referencedIds: Set<string>
): Map<string, string> {
  const map = new Map<string, string>()
  if (!commentsXml) return map

  const comments = commentsXml.getElementsByTagName('w:comment')
  let lastReferencedId: string | null = null

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i]
    const id = wAttr(comment, 'id')
    if (!id) continue

    const author = wAttr(comment, 'author')

    // Concatenate all <w:t> text within the comment (may span paragraphs)
    let text = ''
    const tNodes = comment.getElementsByTagName('w:t')
    for (let j = 0; j < tNodes.length; j++) {
      if (j > 0) text += ' '
      text += tNodes[j].textContent ?? ''
    }
    if (!text) continue

    const entry = author ? `${author}: ${text}` : text

    if (referencedIds.has(id)) {
      map.set(id, entry)
      lastReferencedId = id
    } else if (lastReferencedId) {
      // Reply — append to the parent comment thread
      map.set(lastReferencedId, `${map.get(lastReferencedId)!}\n${entry}`)
    }
  }
  return map
}

// ── Numbering / List Detection ───────────────────────────────────────────────

/** Map of (numId, ilvl) → 'bullet' | 'decimal' */
type NumberingMap = Map<string, 'bullet' | 'decimal'>

function buildNumberingMap(numberingXml: Document | null): NumberingMap {
  const map: NumberingMap = new Map()
  if (!numberingXml) return map

  // Build abstractNumId → levels map
  const abstractNums = numberingXml.getElementsByTagName('w:abstractNum')
  const abstractMap = new Map<string, Map<string, string>>() // abstractNumId → (ilvl → numFmt)

  for (let i = 0; i < abstractNums.length; i++) {
    const an = abstractNums[i]
    const anId = wAttr(an, 'abstractNumId')
    if (!anId) continue
    const levels = new Map<string, string>()
    const lvls = an.getElementsByTagName('w:lvl')
    for (let j = 0; j < lvls.length; j++) {
      const lvl = lvls[j]
      const ilvl = wAttr(lvl, 'ilvl') ?? '0'
      const numFmtEl = lvl.getElementsByTagName('w:numFmt')[0]
      const numFmt = numFmtEl ? (wAttr(numFmtEl, 'val') ?? 'bullet') : 'bullet'
      levels.set(ilvl, numFmt)
    }
    abstractMap.set(anId, levels)
  }

  // Build numId → abstractNumId mapping, then flatten to (numId, ilvl) → format
  const nums = numberingXml.getElementsByTagName('w:num')
  for (let i = 0; i < nums.length; i++) {
    const num = nums[i]
    const numId = wAttr(num, 'numId')
    if (!numId) continue
    const anIdEl = num.getElementsByTagName('w:abstractNumId')[0]
    const anId = anIdEl ? wAttr(anIdEl, 'val') : null
    if (!anId || !abstractMap.has(anId)) continue

    const levels = abstractMap.get(anId)!
    for (const [ilvl, numFmt] of levels) {
      const fmt = numFmt === 'decimal' ? 'decimal' as const : 'bullet' as const
      map.set(`${numId}:${ilvl}`, fmt)
    }
  }

  return map
}

interface ListInfo {
  isList: boolean
  indent: number // ilvl (0-based)
  prefix: string // '- ' or '1. '
}

function getListInfo(paragraph: Element, numberingMap: NumberingMap): ListInfo {
  const pPr = wChildren(paragraph, 'pPr')[0]
  if (!pPr) return { isList: false, indent: 0, prefix: '' }
  const numPr = wChildren(pPr, 'numPr')[0]
  if (!numPr) return { isList: false, indent: 0, prefix: '' }

  const ilvlEl = wChildren(numPr, 'ilvl')[0]
  const numIdEl = wChildren(numPr, 'numId')[0]
  const ilvl = ilvlEl ? (wAttr(ilvlEl, 'val') ?? '0') : '0'
  const numId = numIdEl ? (wAttr(numIdEl, 'val') ?? '') : ''

  if (!numId || numId === '0') return { isList: false, indent: 0, prefix: '' }

  const fmt = numberingMap.get(`${numId}:${ilvl}`) ?? 'bullet'
  const indent = parseInt(ilvl, 10)
  const prefix = fmt === 'decimal' ? '1. ' : '- '

  return { isList: true, indent, prefix }
}

// ── Heading Detection ────────────────────────────────────────────────────────

function getHeadingLevel(paragraph: Element): number {
  const pPr = wChildren(paragraph, 'pPr')[0]
  if (!pPr) return 0
  const pStyle = wChildren(pPr, 'pStyle')[0]
  if (!pStyle) return 0
  const val = wAttr(pStyle, 'val')?.toLowerCase() ?? ''

  // Google Docs and Word use various naming patterns
  if (/^heading\s*1$/.test(val)) return 1
  if (/^heading\s*2$/.test(val)) return 2
  if (/^heading\s*3$/.test(val)) return 3
  if (/^heading\s*4$/.test(val)) return 4
  if (/^heading\s*5$/.test(val)) return 5
  if (/^heading\s*6$/.test(val)) return 6
  return 0
}

// ── Paragraph Walker ─────────────────────────────────────────────────────────

interface WalkContext {
  commentMap: Map<string, string>
  /** commentId → whether the range contains a tracked change */
  commentOnChange: Map<string, boolean>
  /** commentId → collected plain text within the range (for highlight wrapping) */
  commentPlainText: Map<string, string>
  /** Set of comment IDs whose range is currently open */
  openCommentRanges: Set<string>
  changeCount: number
  commentCount: number
}

/**
 * Walk the child elements of a <w:p> paragraph and emit markdown + CriticMarkup.
 * Handles <w:r>, <w:ins>, <w:del>, comment range markers, and <w:commentReference>.
 */
function walkParagraph(paragraph: Element, ctx: WalkContext): string {
  const children = paragraph.childNodes
  const parts: string[] = []

  // First pass: determine which comment ranges contain tracked changes.
  // We need this before the main walk so we know whether to wrap plain text in {==...==}.
  prepassCommentRanges(paragraph, ctx)

  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Element
    if (child.nodeType !== 1) continue

    const tag = child.localName

    if (tag === 'commentRangeStart') {
      const id = wAttr(child, 'id')
      if (id && ctx.commentMap.has(id)) {
        ctx.openCommentRanges.add(id)
        // If this comment is on plain text (not on a tracked change),
        // start collecting text for {==...==} wrapping
        if (!ctx.commentOnChange.get(id)) {
          ctx.commentPlainText.set(id, '')
        }
      }
    } else if (tag === 'commentRangeEnd') {
      const id = wAttr(child, 'id')
      if (id) {
        ctx.openCommentRanges.delete(id)
        // If this was a plain-text comment, emit {==text==} now
        if (!ctx.commentOnChange.get(id) && ctx.commentPlainText.has(id)) {
          const plainText = ctx.commentPlainText.get(id)!
          ctx.commentPlainText.delete(id)
          if (plainText) {
            parts.push(`{==${plainText}==}`)
          }
        }
      }
    } else if (tag === 'r') {
      // Check if this run contains a commentReference
      const commentRef = wChildren(child, 'commentReference')[0]
      if (commentRef) {
        const id = wAttr(commentRef, 'id')
        if (id && ctx.commentMap.has(id)) {
          const commentText = ctx.commentMap.get(id)!
          parts.push(`{>>${commentText}<<}`)
          ctx.commentCount++
        }
        continue // commentReference runs have no visible text
      }

      const text = runText(child)
      const formatted = applyFormatting(child, text)
      if (formatted) {
        // If inside a plain-text comment range, collect text for wrapping
        // instead of emitting directly
        let capturedByComment = false
        for (const commentId of ctx.openCommentRanges) {
          if (!ctx.commentOnChange.get(commentId) && ctx.commentPlainText.has(commentId)) {
            ctx.commentPlainText.set(commentId, ctx.commentPlainText.get(commentId)! + formatted)
            capturedByComment = true
          }
        }
        if (!capturedByComment) {
          parts.push(formatted)
        }
      }
    } else if (tag === 'del') {
      // Check if next sibling is <w:ins> for substitution detection
      const nextSibling = findNextElementSibling(children, i)
      const delText = collectDelText(child)

      if (nextSibling && nextSibling.localName === 'ins') {
        // Substitution: del + ins adjacent
        const insText = collectInsText(nextSibling)
        parts.push(`{~~${delText}~>${insText}~~}`)
        ctx.changeCount++
        // Skip the ins element since we consumed it
        for (let j = i + 1; j < children.length; j++) {
          if (children[j] === nextSibling) {
            i = j
            break
          }
        }
        // Emit author attribution and any comment references nested inside either element
        const refs = [...collectCommentRefsInside(child, ctx), ...collectCommentRefsInside(nextSibling, ctx)]
        emitChangeAttribution(parts, refs, wAttr(child, 'author'), ctx)
        for (const commentId of ctx.openCommentRanges) {
          ctx.commentOnChange.set(commentId, true)
        }
      } else {
        // Standalone deletion
        if (delText) {
          parts.push(`{--${delText}--}`)
          ctx.changeCount++
          emitChangeAttribution(parts, collectCommentRefsInside(child, ctx), wAttr(child, 'author'), ctx)
          for (const commentId of ctx.openCommentRanges) {
            ctx.commentOnChange.set(commentId, true)
          }
        }
      }
    } else if (tag === 'ins') {
      // Check if next sibling is <w:del> for substitution detection (Google Docs order)
      const nextSibling = findNextElementSibling(children, i)
      const insText = collectInsText(child)

      if (nextSibling && nextSibling.localName === 'del') {
        // Substitution: ins + del adjacent (Google Docs puts ins before del)
        const delText = collectDelText(nextSibling)
        parts.push(`{~~${delText}~>${insText}~~}`)
        ctx.changeCount++
        // Skip the del element since we consumed it
        for (let j = i + 1; j < children.length; j++) {
          if (children[j] === nextSibling) {
            i = j
            break
          }
        }
        // Emit author attribution and any comment references nested inside either element
        const refs = [...collectCommentRefsInside(child, ctx), ...collectCommentRefsInside(nextSibling, ctx)]
        emitChangeAttribution(parts, refs, wAttr(child, 'author'), ctx)
        for (const commentId of ctx.openCommentRanges) {
          ctx.commentOnChange.set(commentId, true)
        }
      } else {
        // Standalone insertion (not consumed by a preceding del)
        if (insText) {
          parts.push(`{++${insText}++}`)
          ctx.changeCount++
          emitChangeAttribution(parts, collectCommentRefsInside(child, ctx), wAttr(child, 'author'), ctx)
          for (const commentId of ctx.openCommentRanges) {
            ctx.commentOnChange.set(commentId, true)
          }
        }
      }
    }
    // Ignore other elements (bookmarkStart/End, proofErr, etc.)
  }

  return parts.join('')
}

/** Find the next element sibling after index i, skipping non-element nodes and comment markers. */
function findNextElementSibling(children: NodeListOf<ChildNode>, i: number): Element | null {
  for (let j = i + 1; j < children.length; j++) {
    const node = children[j] as Element
    if (node.nodeType !== 1) continue
    const tag = node.localName
    // Skip comment markers and bookmark markers — they're metadata, not content
    if (tag === 'commentRangeStart' || tag === 'commentRangeEnd' ||
        tag === 'bookmarkStart' || tag === 'bookmarkEnd') continue
    // Skip runs that only contain commentReference (no visible text)
    if (tag === 'r' && wChildren(node, 'commentReference').length > 0 && !runText(node)) continue
    return node
  }
  return null
}

/** Collect all deleted text from a <w:del> element's child runs. */
function collectDelText(del: Element): string {
  let text = ''
  const runs = wChildren(del, 'r')
  for (const run of runs) {
    text += applyFormatting(run, runDelText(run))
  }
  return text
}

/** Collect all inserted text from a <w:ins> element's child runs. */
function collectInsText(ins: Element): string {
  let text = ''
  const runs = wChildren(ins, 'r')
  for (const run of runs) {
    text += applyFormatting(run, runText(run))
  }
  return text
}

/** Collect comment reference IDs from inside a tracked change element (<w:ins> or <w:del>). */
function collectCommentRefsInside(el: Element, ctx: WalkContext): string[] {
  const refs: string[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as Element
    if (child.nodeType !== 1) continue
    if (child.localName === 'r') {
      const commentRef = wChildren(child, 'commentReference')[0]
      if (commentRef) {
        const id = wAttr(commentRef, 'id')
        if (id && ctx.commentMap.has(id)) refs.push(id)
      }
    }
  }
  return refs
}

/**
 * Emit attribution and comment references after a tracked change.
 *
 * If there are comment refs, emit them (author is already embedded in the
 * comment text by buildCommentMap). If there are no comments but the tracked
 * change has a w:author, emit a bare attribution token so the reviewer knows
 * who made the edit.
 */
function emitChangeAttribution(
  parts: string[],
  refs: string[],
  author: string | null,
  ctx: WalkContext
): void {
  if (refs.length === 0) {
    if (author) {
      parts.push(`{>>${author}<<}`)
      ctx.commentCount++
    }
  } else {
    for (const id of refs) {
      parts.push(`{>>${ctx.commentMap.get(id)!}<<}`)
      ctx.commentCount++
    }
  }
}

/**
 * Pre-pass: scan a paragraph's children to determine which comment ranges
 * contain tracked changes (ins/del). This lets the main walk know whether
 * to wrap plain text in {==...==} or just emit {>>comment<<} after a change.
 *
 * Also scans inside <w:ins>/<w:del> for comment markers, since Google Docs
 * nests commentRangeStart/End inside tracked change elements.
 */
function prepassCommentRanges(paragraph: Element, ctx: WalkContext): void {
  const openRanges = new Set<string>()
  const children = paragraph.childNodes

  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Element
    if (child.nodeType !== 1) continue
    const tag = child.localName

    if (tag === 'commentRangeStart') {
      const id = wAttr(child, 'id')
      if (id && ctx.commentMap.has(id)) openRanges.add(id)
    } else if (tag === 'commentRangeEnd') {
      const id = wAttr(child, 'id')
      if (id) openRanges.delete(id)
    } else if (tag === 'del' || tag === 'ins') {
      // Scan inside tracked change elements for nested comment markers
      for (let j = 0; j < child.childNodes.length; j++) {
        const inner = child.childNodes[j] as Element
        if (inner.nodeType !== 1) continue
        if (inner.localName === 'commentRangeStart') {
          const id = wAttr(inner, 'id')
          if (id && ctx.commentMap.has(id)) openRanges.add(id)
        } else if (inner.localName === 'commentRangeEnd') {
          const id = wAttr(inner, 'id')
          if (id) openRanges.delete(id)
        }
      }
      // Any tracked change inside an open comment range means the comment is on a change
      for (const commentId of openRanges) {
        ctx.commentOnChange.set(commentId, true)
      }
    }
  }
}

// ── Main Entry ───────────────────────────────────────────────────────────────

export function docxToMarkdown(
  documentXml: Document,
  commentsXml: Document | null,
  numberingXml: Document | null = null
): { markup: string; changeCount: number; commentCount: number } {
  // Pre-pass: collect comment reference IDs so buildCommentMap can distinguish
  // main comments (anchored in the document) from replies (no anchor).
  const referencedCommentIds = new Set<string>()
  const commentRefEls = documentXml.getElementsByTagName('w:commentReference')
  for (let i = 0; i < commentRefEls.length; i++) {
    const id = wAttr(commentRefEls[i], 'id')
    if (id) referencedCommentIds.add(id)
  }

  const commentMap = buildCommentMap(commentsXml, referencedCommentIds)
  const numberingMap = buildNumberingMap(numberingXml)

  const ctx: WalkContext = {
    commentMap,
    commentOnChange: new Map(),
    commentPlainText: new Map(),
    openCommentRanges: new Set(),
    changeCount: 0,
    commentCount: 0,
  }

  // Find <w:body>
  const bodies = documentXml.getElementsByTagName('w:body')
  if (bodies.length === 0) {
    throw new Error('No <w:body> found in document.xml')
  }
  const body = bodies[0]

  const entries: string[] = []

  // Walk direct children of <w:body>
  for (let i = 0; i < body.childNodes.length; i++) {
    const child = body.childNodes[i] as Element
    if (child.nodeType !== 1) continue

    if (child.localName === 'p') {
      const headingLevel = getHeadingLevel(child)
      const listInfo = getListInfo(child, numberingMap)

      let prefix: string
      if (headingLevel > 0) {
        prefix = '#'.repeat(headingLevel) + ' '
      } else if (listInfo.isList) {
        prefix = '  '.repeat(listInfo.indent) + listInfo.prefix
      } else {
        prefix = ''
      }

      // Reset per-paragraph comment tracking state
      ctx.openCommentRanges.clear()
      ctx.commentPlainText.clear()

      const content = walkParagraph(child, ctx)

      // Skip completely empty paragraphs (but keep paragraphs that have only whitespace
      // as they might be intentional spacing)
      if (content || prefix) {
        entries.push(prefix + content)
      }
    }
    // Skip <w:tbl> (tables), <w:sectPr> (section properties), etc.
  }

  // Join all entries with \n\n (criticMarkupToHTML splits on blank lines).
  // List items each become their own paragraph with a `- ` or `1. ` prefix.
  const markup = entries.join('\n\n')

  return {
    markup,
    changeCount: ctx.changeCount,
    commentCount: ctx.commentCount,
  }
}
