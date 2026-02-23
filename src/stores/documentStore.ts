import { create } from 'zustand'
import type { Editor as TipTapEditor } from '@tiptap/core'
import { nanoid } from 'nanoid'
import { serializeCriticMarkup } from '../utils/serializeCriticMarkup'
import { extractChanges, type ChangeEntry, type CommentThread } from '../utils/extractChanges'
import { criticMarkupToHTML } from '../utils/parseCriticMarkup'
import { createPersistence, type SavedSession } from './persistence'
import { getTrackingEnabled, setTrackingEnabled } from '../extensions/trackChanges'

const persistence = createPersistence()

interface DocumentState {
  // Document data
  comments: Record<string, CommentThread[]>
  changes: ChangeEntry[]
  rawMarkup: string

  // Phase 8B+ placeholders
  trackingEnabled: boolean
  filePath: string | null
  isDirty: boolean

  // Cross-component coordination
  focusCommentId: string | null

  // Recovery
  showRecovery: boolean
  recoverySession: SavedSession | null

  // Editor instance (set once in onCreate, not reactive)
  editor: TipTapEditor | null
}

interface DocumentActions {
  setEditor: (editor: TipTapEditor) => void
  handleEditorChange: (editor: TipTapEditor) => void
  importDocument: (text: string) => void
  addComment: (changeId: string, text: string) => void
  editComment: (changeId: string, threadId: string, text: string) => void
  deleteComment: (changeId: string, threadId: string) => void
  scrollToChange: (from: number, to: number) => void
  createHighlight: () => void
  revertChange: (id: string) => void
  returnToEditor: () => void
  setFocusCommentId: (id: string | null) => void
  clearFocusComment: () => void
  toggleTracking: () => void
  checkForRecovery: () => Promise<void>
  resumeSession: () => void
  startFresh: () => void
  saveSession: (markup: string) => Promise<void>
}

export const useDocumentStore = create<DocumentState & DocumentActions>(
  (set, get) => ({
    // Initial state
    comments: {},
    changes: [],
    rawMarkup: '',
    trackingEnabled: true,
    filePath: null,
    isDirty: false,
    focusCommentId: null,
    showRecovery: false,
    recoverySession: null,
    editor: null,

    setEditor: (editor) => {
      set({ editor })
    },

    handleEditorChange: (editor) => {
      const comments = get().comments
      const rawMarkup = serializeCriticMarkup(editor.state.doc, comments)
      const currentChanges = extractChanges(editor.state.doc, comments)

      // Prune orphaned comments
      const validIds = new Set(currentChanges.map((c) => c.id))
      let prunedComments = comments
      let changed = false
      for (const key of Object.keys(comments)) {
        if (!validIds.has(key)) {
          if (!changed) {
            prunedComments = { ...comments }
            changed = true
          }
          delete prunedComments[key]
        }
      }

      set({
        rawMarkup,
        changes: currentChanges,
        ...(changed ? { comments: prunedComments } : {}),
      })
    },

    importDocument: (text) => {
      const editor = get().editor
      if (!editor) return
      const { html, comments: importedComments } = criticMarkupToHTML(text)
      // Set comments synchronously BEFORE setContent — Zustand's set() is sync,
      // so handleEditorChange (fired by setContent) sees the correct comments via get()
      set({ comments: importedComments })
      editor.commands.setContent(html)
    },

    addComment: (changeId, text) => {
      if (!text.trim()) return
      const { editor, comments } = get()
      const newThread: CommentThread = { id: nanoid(8), text: text.trim() }
      const updatedComments: Record<string, CommentThread[]> = {
        ...comments,
        [changeId]: [...(comments[changeId] ?? []), newThread],
      }
      set({ comments: updatedComments })
      if (editor) {
        set({
          rawMarkup: serializeCriticMarkup(editor.state.doc, updatedComments),
          changes: extractChanges(editor.state.doc, updatedComments),
        })
      }
    },

    editComment: (changeId, threadId, text) => {
      const { editor, comments } = get()
      const existing = comments[changeId] ?? []
      const updatedComments = { ...comments }
      if (!text.trim()) {
        // Empty → delete this thread
        const remaining = existing.filter((t) => t.id !== threadId)
        if (remaining.length === 0) {
          delete updatedComments[changeId]
        } else {
          updatedComments[changeId] = remaining
        }
      } else {
        updatedComments[changeId] = existing.map((t) =>
          t.id === threadId ? { ...t, text: text.trim() } : t
        )
      }
      set({ comments: updatedComments })
      if (editor) {
        set({
          rawMarkup: serializeCriticMarkup(editor.state.doc, updatedComments),
          changes: extractChanges(editor.state.doc, updatedComments),
        })
      }
    },

    deleteComment: (changeId, threadId) => {
      const { editor, comments } = get()
      const remaining = (comments[changeId] ?? []).filter((t) => t.id !== threadId)
      const updatedComments = { ...comments }
      if (remaining.length === 0) {
        delete updatedComments[changeId]
      } else {
        updatedComments[changeId] = remaining
      }
      set({ comments: updatedComments })
      if (editor) {
        set({
          rawMarkup: serializeCriticMarkup(editor.state.doc, updatedComments),
          changes: extractChanges(editor.state.doc, updatedComments),
        })
      }
    },

    scrollToChange: (from, to) => {
      const editor = get().editor
      if (!editor) return
      editor.commands.setTextSelection({ from, to })
      editor.commands.scrollIntoView()
      editor.commands.focus()
    },

    createHighlight: () => {
      const editor = get().editor
      if (!editor) return
      const { from, to } = editor.state.selection
      if (from === to) return
      const id = nanoid(8)
      const { tr } = editor.state
      tr.addMark(
        from,
        to,
        editor.schema.marks.trackedHighlight.create({ id })
      )
      editor.view.dispatch(tr)
      set({ focusCommentId: id })
    },

    revertChange: (id) => {
      const { editor, comments, changes } = get()
      if (!editor) return
      const change = changes.find((c) => c.id === id)
      if (!change) return

      const doc = editor.state.doc
      const tr = editor.state.tr

      if (change.type === 'highlight') {
        doc.nodesBetween(0, doc.content.size, (node, pos) => {
          if (!node.isText) return
          const hlMark = node.marks.find(
            (m) => m.type.name === 'trackedHighlight' && m.attrs.id === id
          )
          if (hlMark) tr.removeMark(pos, pos + node.nodeSize, hlMark)
        })
      } else if (change.type === 'deletion') {
        doc.nodesBetween(0, doc.content.size, (node, pos) => {
          if (!node.isText) return
          const delMark = node.marks.find(
            (m) => m.type.name === 'trackedDeletion' && m.attrs.id === id
          )
          if (delMark) tr.removeMark(pos, pos + node.nodeSize, delMark)
        })
      } else if (change.type === 'insertion') {
        const ranges: { from: number; to: number }[] = []
        doc.nodesBetween(0, doc.content.size, (node, pos) => {
          if (!node.isText) return
          const insMark = node.marks.find(
            (m) => m.type.name === 'trackedInsertion' && m.attrs.id === id
          )
          if (insMark) ranges.push({ from: pos, to: pos + node.nodeSize })
        })
        for (let i = ranges.length - 1; i >= 0; i--) {
          tr.delete(tr.mapping.map(ranges[i].from), tr.mapping.map(ranges[i].to))
        }
      } else if (change.type === 'substitution') {
        // change.id is the deletion's ID; find the paired insertion ID
        let insId: string | null = null
        doc.nodesBetween(0, doc.content.size, (node) => {
          if (!node.isText || insId) return
          const delMark = node.marks.find(
            (m) => m.type.name === 'trackedDeletion' && m.attrs.id === id
          )
          if (delMark?.attrs.pairedWith) insId = delMark.attrs.pairedWith
        })

        // Delete insertion text first (it sits after deletion in the doc — higher pos)
        if (insId) {
          const insRanges: { from: number; to: number }[] = []
          doc.nodesBetween(0, doc.content.size, (node, pos) => {
            if (!node.isText) return
            const insMark = node.marks.find(
              (m) => m.type.name === 'trackedInsertion' && m.attrs.id === insId
            )
            if (insMark) insRanges.push({ from: pos, to: pos + node.nodeSize })
          })
          for (let i = insRanges.length - 1; i >= 0; i--) {
            tr.delete(tr.mapping.map(insRanges[i].from), tr.mapping.map(insRanges[i].to))
          }
        }

        // Remove deletion marks (positions shift after insertion delete, use mapping)
        doc.nodesBetween(0, doc.content.size, (node, pos) => {
          if (!node.isText) return
          const delMark = node.marks.find(
            (m) => m.type.name === 'trackedDeletion' && m.attrs.id === id
          )
          if (delMark) {
            tr.removeMark(
              tr.mapping.map(pos),
              tr.mapping.map(pos + node.nodeSize),
              delMark
            )
          }
        })
      }

      editor.view.dispatch(tr)

      // Clean up any comment threads associated with this change
      if (comments[id]?.length) {
        const updatedComments = { ...comments }
        delete updatedComments[id]
        set({ comments: updatedComments })
      }
    },

    returnToEditor: () => {
      const editor = get().editor
      if (!editor) return
      editor.commands.focus()
    },

    setFocusCommentId: (id) => {
      set({ focusCommentId: id })
    },

    clearFocusComment: () => {
      set({ focusCommentId: null })
    },

    toggleTracking: () => {
      const next = !getTrackingEnabled()
      setTrackingEnabled(next)
      set({ trackingEnabled: next })
    },

    checkForRecovery: async () => {
      const saved = await persistence.load()
      if (saved) {
        if (persistence.capabilities.autoLoad) {
          // Native targets (VSCode, Tauri): directly import the file content,
          // skip the RecoveryModal (there is no "previous session" concept here)
          get().importDocument(saved.markup)
        } else {
          set({ recoverySession: saved, showRecovery: true })
        }
      }
    },

    resumeSession: () => {
      const session = get().recoverySession
      if (session) {
        get().importDocument(session.markup)
      }
      set({ showRecovery: false })
    },

    startFresh: () => {
      persistence.clear()
      set({ showRecovery: false })
    },

    saveSession: async (markup) => {
      await persistence.save(markup, get().comments)
    },
  })
)
