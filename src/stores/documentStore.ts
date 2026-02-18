import { create } from 'zustand'
import type { Editor as TipTapEditor } from '@tiptap/core'
import { nanoid } from 'nanoid'
import { serializeCriticMarkup } from '../utils/serializeCriticMarkup'
import { extractChanges, type ChangeEntry } from '../utils/extractChanges'
import { criticMarkupToHTML } from '../utils/parseCriticMarkup'
import { createPersistence, type SavedSession } from './persistence'
import { getTrackingEnabled, setTrackingEnabled } from '../extensions/trackChanges'

const persistence = createPersistence()

interface DocumentState {
  // Document data
  comments: Record<string, string>
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
  setComment: (id: string, text: string) => void
  scrollToChange: (from: number, to: number) => void
  createHighlight: () => void
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

    setComment: (id, text) => {
      const { editor, comments } = get()
      const updatedComments = { ...comments }
      if (text) {
        updatedComments[id] = text
      } else {
        delete updatedComments[id]
      }
      set({ comments: updatedComments })

      // Re-serialize and re-extract with updated comments
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
