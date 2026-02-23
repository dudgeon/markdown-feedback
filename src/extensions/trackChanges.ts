import { Extension, Mark } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import { nanoid } from 'nanoid'

// Module-level tracking state — survives TipTap extension reconfiguration.
// TipTap's useEditor can re-register extensions on re-render, which resets
// addStorage() and re-runs addProseMirrorPlugins(). A module variable is
// immune to this lifecycle.
let _trackingEnabled = true

// Timestamp of the last deletion handled by handleKeyDown.
// Guards against double-processing if beforeinput fires after handleKeyDown
// already handled the same event. On desktop this shouldn't happen (handleKeyDown's
// preventDefault stops beforeinput), but this is a safety net for edge cases.
let _lastDeleteHandledAt = 0

export function getTrackingEnabled(): boolean {
  return _trackingEnabled
}

export function setTrackingEnabled(enabled: boolean): void {
  _trackingEnabled = enabled
}

/**
 * Mark: tracked-deletion
 * Applied to text that the user deleted from the original document.
 * The text remains in the document as red strikethrough — it is NOT removed.
 */
export const TrackedDeletion = Mark.create({
  name: 'trackedDeletion',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => ({ 'data-id': attrs.id }),
      },
      pairedWith: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-paired'),
        renderHTML: (attrs) =>
          attrs.pairedWith ? { 'data-paired': attrs.pairedWith } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span.tracked-deletion' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        class: 'tracked-deletion',
        contenteditable: 'false',
      },
      0,
    ]
  },

  // Deletion marks should not extend when typing at their edges
  inclusive: false,
})

/**
 * Mark: tracked-highlight
 * Applied to unchanged text that the user wants to comment on (standalone comment).
 * Displayed as yellow highlight. The comment text lives in external React state,
 * keyed by this mark's `id` attribute.
 * Serialized as {==highlighted text==}{>>comment<<} in CriticMarkup.
 */
export const TrackedHighlight = Mark.create({
  name: 'trackedHighlight',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => ({ 'data-id': attrs.id }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span.tracked-highlight' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'tracked-highlight' }, 0]
  },

  // Highlight should not extend when typing at edges
  inclusive: false,
})

/**
 * Mark: tracked-insertion
 * Applied to text that the user added to the document.
 * Displayed as green text. Editable — the user can continue refining their additions.
 */
export const TrackedInsertion = Mark.create({
  name: 'trackedInsertion',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => ({ 'data-id': attrs.id }),
      },
      pairedWith: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-paired'),
        renderHTML: (attrs) =>
          attrs.pairedWith ? { 'data-paired': attrs.pairedWith } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span.tracked-insertion' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'tracked-insertion' }, 0]
  },

  // Insertion marks SHOULD extend when the user types at the end
  inclusive: true,
})

/**
 * The track changes intercept extension.
 *
 * Uses input handler approach: intercepts keyboard events, text input,
 * and paste events directly, preventing default behavior and applying
 * tracked-change transformations instead.
 */
export const TrackChanges = Extension.create({
  name: 'trackChanges',

  addProseMirrorPlugins() {
    const deletionType = this.editor.schema.marks.trackedDeletion
    const insertionType = this.editor.schema.marks.trackedInsertion
    const highlightType = this.editor.schema.marks.trackedHighlight

    return [
      new Plugin({
        key: new PluginKey('trackChanges'),

        props: {
          // iOS virtual keyboards fire keydown with key:"Unidentified" for
          // Backspace/Delete. beforeinput with inputType catches these reliably.
          // On desktop, handleKeyDown returns true → preventDefault() → beforeinput
          // never fires. On iOS, handleKeyDown returns false → beforeinput fires.
          handleDOMEvents: {
            beforeinput(view: EditorView, event: InputEvent) {
              if (!_trackingEnabled) return false

              const inputType = event.inputType

              // Only handle deletion inputTypes. Text insertion is handled by
              // handleTextInput. Composition events are non-cancelable.
              const isDeletion =
                inputType === 'deleteContentBackward' ||
                inputType === 'deleteContentForward' ||
                inputType === 'deleteWordBackward' ||
                inputType === 'deleteWordForward' ||
                inputType === 'deleteSoftLineBackward' ||
                inputType === 'deleteSoftLineForward' ||
                inputType === 'deleteHardLineBackward' ||
                inputType === 'deleteHardLineForward' ||
                inputType === 'deleteByCut' ||
                inputType === 'deleteByDrag'

              if (!isDeletion) return false

              // Guard: if handleKeyDown just handled this deletion, skip.
              if (Date.now() - _lastDeleteHandledAt < 50) return false

              const { state } = view
              const { selection } = state
              const { from, to, empty } = selection

              // Word/line deletions: use getTargetRanges() for the affected range
              if (
                inputType === 'deleteWordBackward' ||
                inputType === 'deleteWordForward' ||
                inputType === 'deleteSoftLineBackward' ||
                inputType === 'deleteSoftLineForward' ||
                inputType === 'deleteHardLineBackward' ||
                inputType === 'deleteHardLineForward'
              ) {
                if (!empty) {
                  const handled = handleRangeDelete(view, from, to)
                  if (handled) { event.preventDefault(); return true }
                  return false
                }

                const targetRanges = event.getTargetRanges()
                if (targetRanges.length > 0) {
                  const range = targetRanges[0]
                  const rangeFrom = view.posAtDOM(range.startContainer, range.startOffset)
                  const rangeTo = view.posAtDOM(range.endContainer, range.endOffset)
                  if (rangeFrom !== rangeTo) {
                    const handled = handleRangeDelete(
                      view,
                      Math.min(rangeFrom, rangeTo),
                      Math.max(rangeFrom, rangeTo)
                    )
                    if (handled) { event.preventDefault(); return true }
                    return false
                  }
                }

                // Fallback: treat as single char delete
                const key = inputType.includes('Backward') ? 'Backspace' : 'Delete'
                const handled = handleSingleCharDelete(view, key, from)
                if (handled) { event.preventDefault(); return true }
                return false
              }

              // Cut and drag: always range
              if (inputType === 'deleteByCut' || inputType === 'deleteByDrag') {
                if (!empty) {
                  const handled = handleRangeDelete(view, from, to)
                  if (handled) { event.preventDefault(); return true }
                }
                return false
              }

              // Single character deletions (deleteContentBackward/Forward)
              const key = inputType === 'deleteContentBackward' ? 'Backspace' : 'Delete'

              if (empty) {
                const handled = handleSingleCharDelete(view, key, from)
                if (handled) { event.preventDefault(); return true }
                return false
              } else {
                const handled = handleRangeDelete(view, from, to)
                if (handled) { event.preventDefault(); return true }
                return false
              }
            },
          },

          handleKeyDown(view, event) {
            const { state } = view
            const { selection } = state
            const { from, to, empty } = selection

            // Cmd+Shift+T (Mac) / Ctrl+Shift+T (Win): toggle tracking
            // Always active regardless of _trackingEnabled
            if (
              event.key === 't' &&
              event.shiftKey &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault()
              window.dispatchEvent(
                new CustomEvent('trackchanges:toggle-tracking')
              )
              return true
            }

            // Cmd+Shift+H (Mac) / Ctrl+Shift+H (Win): create highlight
            // Always active regardless of _trackingEnabled
            if (
              event.key === 'h' &&
              event.shiftKey &&
              (event.metaKey || event.ctrlKey) &&
              from !== to
            ) {
              event.preventDefault()
              window.dispatchEvent(
                new CustomEvent('trackchanges:create-highlight')
              )
              return true
            }

            // Tab: jump to comment input if cursor is on/adjacent to a change
            // Always active regardless of _trackingEnabled
            if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
              const changeId = findChangeIdAtCursor(state, from, deletionType, insertionType, highlightType)
              if (changeId) {
                event.preventDefault()
                window.dispatchEvent(
                  new CustomEvent('trackchanges:tab-to-comment', {
                    detail: { changeId },
                  })
                )
                return true
              }
              return false // Let Tab function normally
            }

            // Below this point: tracking-dependent behavior
            if (!_trackingEnabled) return false

            if (event.key !== 'Backspace' && event.key !== 'Delete') {
              return false
            }

            if (empty) {
              const handled = handleSingleCharDelete(view, event.key, from)
              if (handled) _lastDeleteHandledAt = Date.now()
              return handled
            } else {
              const handled = handleRangeDelete(view, from, to)
              if (handled) _lastDeleteHandledAt = Date.now()
              return handled
            }
          },

          handleTextInput(view, from, to, text) {
            if (!_trackingEnabled) return false
            const { state, dispatch } = view
            const $from = state.doc.resolve(from)
            const isInInsertion = insertionType.isInSet($from.marks())

            if (from === to) {
              // Pure insertion, no selection
              if (isInInsertion) {
                return false // Let TipTap handle it normally
              }

              // Typing in original text — wrap in insertion mark
              const tr = state.tr
              tr.insertText(text, from, to)
              tr.addMark(
                from,
                from + text.length,
                insertionType.create({ id: nanoid(8) })
              )
              tr.setMeta('trackChangesProcessed', true)
              dispatch(tr)
              return true
            } else {
              // Selection replacement — substitution
              return handleSubstitution(view, from, to, text)
            }
          },

          handlePaste(view, _event, slice) {
            if (!_trackingEnabled) return false
            const { state, dispatch } = view
            const { from, to } = state.selection
            const text = slice.content.textBetween(
              0,
              slice.content.size,
              '\n'
            )
            if (!text) return false

            if (from === to) {
              const $from = state.doc.resolve(from)
              if (insertionType.isInSet($from.marks())) {
                return false // Inside an insertion, paste normally
              }

              const tr = state.tr
              tr.insertText(text, from)
              tr.addMark(
                from,
                from + text.length,
                insertionType.create({ id: nanoid(8) })
              )
              tr.setMeta('trackChangesProcessed', true)
              dispatch(tr)
              return true
            } else {
              return handleSubstitution(view, from, to, text)
            }
          },
        },

        // When tracking is off, strip insertion marks from newly added text.
        // TrackedInsertion is inclusive, so ProseMirror's default text input
        // extends the mark onto adjacent new characters. This appendTransaction
        // catches ALL input methods (keyboard, paste, composition, automation).
        appendTransaction(transactions, _oldState, newState) {
          if (_trackingEnabled) return null
          if (!transactions.some((tr) => tr.docChanged)) return null

          const tr = newState.tr
          let modified = false

          for (const transaction of transactions) {
            if (!transaction.docChanged) continue
            transaction.steps.forEach((step) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              step.getMap().forEach((_oldStart: any, _oldEnd: any, newStart: any, newEnd: any) => {
                if (newEnd <= newStart) return
                const safeEnd = Math.min(newEnd, newState.doc.content.size)
                if (newStart >= safeEnd) return
                newState.doc.nodesBetween(newStart, safeEnd, (node, pos) => {
                  if (node.isText && insertionType.isInSet(node.marks)) {
                    const from = Math.max(pos, newStart)
                    const to = Math.min(pos + node.nodeSize, safeEnd)
                    tr.removeMark(from, to, insertionType)
                    modified = true
                  }
                })
              })
            })
          }

          return modified ? tr : null
        },
      }),
    ]

    function handleSingleCharDelete(
      view: EditorView,
      key: string,
      cursorPos: number
    ): boolean {
      const { state, dispatch } = view
      const isBackspace = key === 'Backspace'
      const charPos = isBackspace ? cursorPos - 1 : cursorPos
      const charEnd = isBackspace ? cursorPos : cursorPos + 1

      if (charPos < 0 || charEnd > state.doc.content.size) return false

      // If cursor is at the start (Backspace) or end (Delete) of a block node,
      // return false so ProseMirror's default joinBackward/joinForward handles
      // the block merge. Without this the cursor gets stuck in deletion spans.
      const $cursor = state.doc.resolve(cursorPos)
      if (isBackspace && $cursor.parentOffset === 0) return false
      if (!isBackspace && $cursor.parentOffset === $cursor.parent.content.size) return false

      // Resolve the position to find the text node
      const $pos = state.doc.resolve(charPos)
      const textNode = $pos.parent.maybeChild($pos.index())
      if (!textNode || !textNode.isText) return false

      // If inside an insertion — truly delete (user editing own addition)
      if (insertionType.isInSet(textNode.marks)) {
        return false
      }

      // If already deleted — skip cursor over the deletion span
      if (deletionType.isInSet(textNode.marks)) {
        if (isBackspace) {
          // Scan backward to find the start of this deletion run
          let scanPos = charPos
          while (scanPos > 0) {
            const $scan = state.doc.resolve(scanPos)
            const scanNode = $scan.parent.maybeChild($scan.index())
            if (
              !scanNode?.isText ||
              !deletionType.isInSet(scanNode.marks)
            ) {
              break
            }
            scanPos--
          }
          // If the scan landed at the start of a block, fall through to
          // ProseMirror's default joinBackward rather than placing the cursor
          // at the block boundary (which would cause an infinite loop).
          const $target = state.doc.resolve(scanPos + 1)
          if ($target.parentOffset === 0) return false
          const tr = state.tr
          tr.setSelection(TextSelection.near($target))
          dispatch(tr)
        } else {
          // Scan forward to find the end of this deletion run
          let scanPos = charEnd
          while (scanPos < state.doc.content.size) {
            const $scan = state.doc.resolve(scanPos)
            const scanNode = $scan.parent.maybeChild($scan.index())
            if (
              !scanNode?.isText ||
              !deletionType.isInSet(scanNode.marks)
            ) {
              break
            }
            scanPos++
          }
          const $target = state.doc.resolve(scanPos)
          if ($target.parentOffset === $target.parent.content.size) return false
          const tr = state.tr
          tr.setSelection(TextSelection.near($target))
          dispatch(tr)
        }
        return true
      }

      // Original text — mark as deleted instead of removing.
      // Reuse the ID of an adjacent standalone deletion so ProseMirror
      // merges the marks into a single DOM span (avoids cursor dead zones).
      const adjacentId = findAdjacentStandaloneDeletionId(state, charPos, charEnd)
      const tr = state.tr
      tr.addMark(
        charPos,
        charEnd,
        deletionType.create({ id: adjacentId ?? nanoid(8) })
      )
      tr.setMeta('trackChangesProcessed', true)
      dispatch(tr)
      return true
    }

    function handleRangeDelete(
      view: EditorView,
      from: number,
      to: number
    ): boolean {
      const { state, dispatch } = view
      const ranges = collectTextRanges(state, from, to)
      if (ranges.length === 0) return false

      const tr = state.tr

      // Process ranges in reverse order so positions stay valid
      for (let i = ranges.length - 1; i >= 0; i--) {
        const range = ranges[i]
        if (range.isInsertion) {
          tr.delete(range.from, range.to)
        } else if (range.isDeletion) {
          // Already deleted — leave as is
        } else {
          tr.addMark(
            range.from,
            range.to,
            deletionType.create({ id: nanoid(8) })
          )
        }
      }

      tr.setMeta('trackChangesProcessed', true)
      dispatch(tr)
      return true
    }

    function handleSubstitution(
      view: EditorView,
      from: number,
      to: number,
      text: string
    ): boolean {
      const { state, dispatch } = view
      const delId = nanoid(8)
      const insId = nanoid(8)
      const ranges = collectTextRanges(state, from, to)

      const tr = state.tr

      // Process ranges in reverse
      for (let i = ranges.length - 1; i >= 0; i--) {
        const range = ranges[i]
        if (range.isInsertion) {
          tr.delete(range.from, range.to)
        } else if (range.isDeletion) {
          // Leave as-is
        } else {
          tr.addMark(
            range.from,
            range.to,
            deletionType.create({ id: delId, pairedWith: insId })
          )
        }
      }

      // Insert replacement text after the deletion marks
      const mappedTo = tr.mapping.map(to)
      tr.insertText(text, mappedTo, mappedTo)
      tr.addMark(
        mappedTo,
        mappedTo + text.length,
        insertionType.create({ id: insId, pairedWith: delId })
      )

      tr.setMeta('trackChangesProcessed', true)
      dispatch(tr)
      return true
    }

    /**
     * Check for an adjacent standalone deletion mark and return its ID.
     * "Standalone" means pairedWith === null (not part of a substitution).
     * When found, reusing this ID causes ProseMirror to merge adjacent
     * deletion marks into a single DOM span, preventing cursor dead zones.
     */
    function findAdjacentStandaloneDeletionId(
      state: any,
      charPos: number,
      charEnd: number
    ): string | null {
      // Check the character immediately before charPos
      if (charPos > 0) {
        const $before = state.doc.resolve(charPos)
        const nodeBefore = $before.nodeBefore
        if (nodeBefore?.isText) {
          const delMark = deletionType.isInSet(nodeBefore.marks)
          if (delMark && delMark.attrs.pairedWith === null) {
            return delMark.attrs.id
          }
        }
      }
      // Check the character immediately after charEnd
      if (charEnd < state.doc.content.size) {
        const $after = state.doc.resolve(charEnd)
        const nodeAfter = $after.nodeAfter
        if (nodeAfter?.isText) {
          const delMark = deletionType.isInSet(nodeAfter.marks)
          if (delMark && delMark.attrs.pairedWith === null) {
            return delMark.attrs.id
          }
        }
      }
      return null
    }

    function collectTextRanges(
      state: ReturnType<EditorView['state'] extends infer S ? () => S : never> extends () => infer R ? R : any,
      from: number,
      to: number
    ) {
      const ranges: Array<{
        from: number
        to: number
        isInsertion: boolean
        isDeletion: boolean
      }> = []

      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (node.isText) {
          const start = Math.max(pos, from)
          const end = Math.min(pos + node.nodeSize, to)
          if (start < end) {
            ranges.push({
              from: start,
              to: end,
              isInsertion: !!insertionType.isInSet(node.marks),
              isDeletion: !!deletionType.isInSet(node.marks),
            })
          }
        }
      })

      return ranges
    }

    /**
     * Find the ID of a tracked change (deletion, insertion, or highlight)
     * at or adjacent to the given cursor position.
     * Returns null if the cursor is not on or next to any change.
     *
     * For substitution marks, always returns the deletion's ID (which is what
     * extractChanges uses as the ChangeEntry ID). Paired insertions have
     * pairedWith = delId, so we return that instead of the insertion's own ID.
     */
    function isChangeMark(
      mark: any,
      delType: typeof deletionType,
      insType: typeof insertionType,
      hlType: typeof highlightType
    ): boolean {
      return mark.type === delType || mark.type === insType || mark.type === hlType
    }

    /** Return the ChangeEntry-compatible ID for a mark. */
    function resolveChangeId(mark: any, insType: typeof insertionType): string {
      // Paired insertion → return the deletion's ID (= mark.attrs.pairedWith)
      if (mark.type === insType && mark.attrs.pairedWith) {
        return mark.attrs.pairedWith
      }
      return mark.attrs.id
    }

    function findChangeIdAtCursor(
      state: any,
      pos: number,
      delType: typeof deletionType,
      insType: typeof insertionType,
      hlType: typeof highlightType
    ): string | null {
      const $pos = state.doc.resolve(pos)

      // Check marks at the cursor position
      for (const mark of $pos.marks()) {
        if (isChangeMark(mark, delType, insType, hlType)) {
          return resolveChangeId(mark, insType)
        }
      }

      // Check the node immediately before the cursor
      const nodeBefore = $pos.nodeBefore
      if (nodeBefore?.isText) {
        for (const mark of nodeBefore.marks) {
          if (isChangeMark(mark, delType, insType, hlType)) {
            return resolveChangeId(mark, insType)
          }
        }
      }

      // Check the node immediately after the cursor
      const nodeAfter = $pos.nodeAfter
      if (nodeAfter?.isText) {
        for (const mark of nodeAfter.marks) {
          if (isChangeMark(mark, delType, insType, hlType)) {
            return resolveChangeId(mark, insType)
          }
        }
      }

      // When clicking on a contenteditable=false deletion span, the browser
      // often places the cursor 1 char into the adjacent text node.
      // Check the previous/next sibling inline node if we're near a boundary.
      const textOffset = $pos.textOffset
      const index = $pos.index($pos.depth)
      const parent = $pos.parent

      if (textOffset <= 1 && index > 0) {
        const prevChild = parent.child(index - 1)
        if (prevChild.isText) {
          for (const mark of prevChild.marks) {
            if (isChangeMark(mark, delType, insType, hlType)) {
              return resolveChangeId(mark, insType)
            }
          }
        }
      }

      const nodeAfterFull = $pos.nodeAfter
      if (nodeAfterFull?.isText) {
        const remainingLen = nodeAfterFull.nodeSize - textOffset
        if (remainingLen <= 1 && index < parent.childCount - 1) {
          const nextChild = parent.child(index + 1)
          if (nextChild.isText) {
            for (const mark of nextChild.marks) {
              if (isChangeMark(mark, delType, insType, hlType)) {
                return resolveChangeId(mark, insType)
              }
            }
          }
        }
      }

      return null
    }
  },
})
