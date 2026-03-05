import { create } from 'zustand'
import type { Editor as TipTapEditor } from '@tiptap/core'
import { nanoid } from 'nanoid'
import { serializeCriticMarkup } from '../utils/serializeCriticMarkup'
import { extractChanges, type ChangeEntry, type CommentThread } from '../utils/extractChanges'
import { criticMarkupToHTML } from '../utils/parseCriticMarkup'
import { createPersistence, type SavedSession, type PlatformCapabilities } from './persistence'
import { getTrackingEnabled, setTrackingEnabled } from '../extensions/trackChanges'

const persistence = createPersistence()

interface DocumentState {
  // Document data
  comments: Record<string, CommentThread[]>
  changes: ChangeEntry[]
  rawMarkup: string

  // Platform
  capabilities: PlatformCapabilities

  // Phase 8B+ placeholders
  trackingEnabled: boolean
  filePath: string | null
  isDirty: boolean

  // Rich markdown decorations (Phase 10D)
  decorationsEnabled: boolean

  // Cross-component coordination
  focusCommentId: string | null

  // Recovery
  showRecovery: boolean
  recoverySession: SavedSession | null

  // Pending import — set by recovery/autoLoad, consumed by Editor.tsx effect
  // with the live useEditor instance (avoids stale editor ref).
  pendingImport: string | null

  // Editor instance (set once in onCreate, not reactive)
  editor: TipTapEditor | null
}

interface DocumentActions {
  setEditor: (editor: TipTapEditor) => void
  handleEditorChange: (editor: TipTapEditor) => void
  importDocument: (text: string, editor: TipTapEditor) => void
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
  toggleDecorations: () => void
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
    capabilities: persistence.capabilities,
    trackingEnabled: true,
    filePath: null,
    isDirty: false,
    decorationsEnabled: localStorage.getItem('decorationsEnabled') === 'true',
    focusCommentId: null,
    showRecovery: false,
    recoverySession: null,
    pendingImport: null,
    editor: null,

    setEditor: (editor) => set({ editor }),

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

    importDocument: (text, editor) => {
      const { html, comments: parsedComments } = criticMarkupToHTML(text, get().decorationsEnabled)
      editor.commands.setContent(html)
      // Single atomic set — setContent's emitUpdate defaults to false in
      // TipTap 3, so onUpdate may not fire. Compute all derived state here
      // and set everything in one call to avoid intermediate renders.
      // Always use parsedComments (IDs match the new marks in the doc).
      // Comment actions re-serialize rawMarkup to include {>>comment<<},
      // so the markup string is always the source of truth for comments.
      set({
        comments: parsedComments,
        rawMarkup: serializeCriticMarkup(editor.state.doc, parsedComments),
        changes: extractChanges(editor.state.doc, parsedComments),
        pendingImport: null,
      })
    },

    addComment: (changeId, text) => {
      if (!text.trim()) return
      const { comments, changes, editor } = get()
      const newThread: CommentThread = { id: nanoid(8), text: text.trim() }
      const updatedComments: Record<string, CommentThread[]> = {
        ...comments,
        [changeId]: [...(comments[changeId] ?? []), newThread],
      }
      // Update changes in-place — don't re-extract from editor.state.doc
      // because useEditor may have silently replaced the editor instance
      // with an empty one (React StrictMode / re-render), leaving the
      // stored reference stale. The next onUpdate will resync fully.
      const updatedChanges = changes.map((c) =>
        c.id === changeId
          ? { ...c, comments: updatedComments[changeId] }
          : c
      )
      // Re-serialize markup to include {>>comment<<} so recovery from
      // markup alone works (mark IDs change on re-import, so the markup
      // string must be the single source of truth for comments).
      // Guard: if editor is destroyed (stale ref from HMR/StrictMode),
      // keep the existing rawMarkup to avoid overwriting with empty string.
      const rawMarkup = editor && !editor.isDestroyed
        ? serializeCriticMarkup(editor.state.doc, updatedComments)
        : get().rawMarkup
      set({ comments: updatedComments, changes: updatedChanges, rawMarkup })
      persistence.save(rawMarkup, updatedComments)
    },

    editComment: (changeId, threadId, text) => {
      const { comments, changes, editor } = get()
      const existing = comments[changeId] ?? []
      const updatedComments = { ...comments }
      if (!text.trim()) {
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
      const updatedChanges = changes.map((c) =>
        c.id === changeId
          ? { ...c, comments: updatedComments[changeId] }
          : c
      )
      const rawMarkup = editor && !editor.isDestroyed
        ? serializeCriticMarkup(editor.state.doc, updatedComments)
        : get().rawMarkup
      set({ comments: updatedComments, changes: updatedChanges, rawMarkup })
      persistence.save(rawMarkup, updatedComments)
    },

    deleteComment: (changeId, threadId) => {
      const { comments, changes, editor } = get()
      const remaining = (comments[changeId] ?? []).filter((t) => t.id !== threadId)
      const updatedComments = { ...comments }
      if (remaining.length === 0) {
        delete updatedComments[changeId]
      } else {
        updatedComments[changeId] = remaining
      }
      const updatedChanges = changes.map((c) =>
        c.id === changeId
          ? { ...c, comments: updatedComments[changeId] }
          : c
      )
      const rawMarkup = editor && !editor.isDestroyed
        ? serializeCriticMarkup(editor.state.doc, updatedComments)
        : get().rawMarkup
      set({ comments: updatedComments, changes: updatedChanges, rawMarkup })
      persistence.save(rawMarkup, updatedComments)
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

    toggleDecorations: () => {
      const { decorationsEnabled, rawMarkup, editor } = get()
      const next = !decorationsEnabled
      localStorage.setItem('decorationsEnabled', String(next))

      // Re-parse the document with the new mode
      if (editor && !editor.isDestroyed && rawMarkup) {
        const { html, comments: parsedComments } = criticMarkupToHTML(rawMarkup, next)
        editor.commands.setContent(html)
        // Merge: use parsedComments for newly parsed IDs, but they're fresh IDs.
        // Since we re-import, the old comments map is invalid (IDs change).
        // parsedComments already contains comments extracted from rawMarkup.
        set({
          decorationsEnabled: next,
          comments: parsedComments,
          rawMarkup: serializeCriticMarkup(editor.state.doc, parsedComments),
          changes: extractChanges(editor.state.doc, parsedComments),
        })
      } else {
        set({ decorationsEnabled: next })
      }
    },

    checkForRecovery: async () => {
      const saved = await persistence.load()
      if (saved) {
        if (persistence.capabilities.autoLoad) {
          // Native targets (VSCode, Tauri): set pendingImport so
          // Editor.tsx's effect applies it with the live editor instance
          set({ pendingImport: saved.markup })
        } else {
          set({ recoverySession: saved, showRecovery: true })
        }
      }
    },

    resumeSession: () => {
      const session = get().recoverySession
      if (session) {
        // Don't call importDocument here — the stored editor ref may be stale.
        // Set pendingImport and let Editor.tsx's effect apply it with the
        // live useEditor instance.
        set({
          pendingImport: session.markup,
          showRecovery: false,
        })
      } else {
        set({ showRecovery: false })
      }
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

// Dev-only: expose store for browser console testing
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__docStore = useDocumentStore
}
