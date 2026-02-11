import { useState, useCallback, useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor as TipTapEditor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { nanoid } from 'nanoid'
import {
  TrackedDeletion,
  TrackedInsertion,
  TrackedHighlight,
  TrackChanges,
} from '../extensions/trackChanges'
import SourceView from './SourceView'
import ImportModal from './ImportModal'
import Toolbar from './Toolbar'
import ChangesPanel from './ChangesPanel'
import AboutPanel from './AboutPanel'
import { serializeCriticMarkup } from '../utils/serializeCriticMarkup'
import { extractChanges, type ChangeEntry } from '../utils/extractChanges'
import { criticMarkupToHTML } from '../utils/parseCriticMarkup'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  useSessionPersistence,
  type SavedSession,
} from '../hooks/useSessionPersistence'
import RecoveryModal from './RecoveryModal'

const SAMPLE_MARKDOWN = `# Selected Passages from *The Elements of Style*

Vigorous writing is concise. A sentence should contain no unnecessary words, a paragraph no unnecessary sentences, for the same reason that a drawing should have no unnecessary lines and a machine no unnecessary parts. This requires not that the writer make all his sentences short, or that he avoid all detail and treat his subjects only in outline, but that every word tell.

(Rule 17: Omit needless words)

Write with nouns and verbs, not with adjectives and adverbs. The adjective hasn't been built that can pull a weak or inaccurate noun out of a tight place. It is nouns and verbs, not their assistants, that give good writing its toughness and color.

(Chapter V: An Approach to Style, Principle 14)

---

**Source:** Strunk, William Jr., and E.B. White. *The Elements of Style*. 4th ed., Longman, 2000.`

export default function Editor() {
  const [rawMarkup, setRawMarkup] = useState('')
  const [changes, setChanges] = useState<ChangeEntry[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})
  const [sourceExpanded, setSourceExpanded] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoverySession, setRecoverySession] = useState<SavedSession | null>(
    null
  )

  const { getSavedSession, saveSession, clearSession } =
    useSessionPersistence()

  // Ref to avoid stale closures in handleEditorChange
  const commentsRef = useRef(comments)
  commentsRef.current = comments

  const debouncedMarkup = useDebouncedValue(rawMarkup, 500)

  const handleEditorChange = useCallback(
    ({ editor }: { editor: TipTapEditor }) => {
      setRawMarkup(serializeCriticMarkup(editor.state.doc, commentsRef.current))
      const currentChanges = extractChanges(editor.state.doc, commentsRef.current)
      setChanges(currentChanges)

      // Prune orphaned comments
      const validIds = new Set(currentChanges.map((c) => c.id))
      setComments((prev) => {
        const pruned = { ...prev }
        let changed = false
        for (const key of Object.keys(pruned)) {
          if (!validIds.has(key)) {
            delete pruned[key]
            changed = true
          }
        }
        return changed ? pruned : prev
      })
    },
    []
  )

  const { html: initialHTML, comments: initialComments } =
    criticMarkupToHTML(SAMPLE_MARKDOWN)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TrackedDeletion,
      TrackedInsertion,
      TrackedHighlight,
      TrackChanges,
    ],
    content: initialHTML,
    onUpdate: handleEditorChange,
    onCreate: ({ editor }) => {
      // Load initial comments from sample content
      if (Object.keys(initialComments).length > 0) {
        setComments(initialComments)
      }
      handleEditorChange({ editor })
    },
  })

  const handleImport = useCallback(
    (text: string) => {
      if (!editor) return
      const { html, comments: importedComments } = criticMarkupToHTML(text)
      // Update ref BEFORE setContent so handleEditorChange picks up the new comments
      commentsRef.current = importedComments
      setComments(importedComments)
      editor.commands.setContent(html)
    },
    [editor]
  )

  const handleScrollTo = useCallback(
    (from: number, to: number) => {
      if (!editor) return
      editor.commands.setTextSelection({ from, to })
      editor.commands.scrollIntoView()
      editor.commands.focus()
    },
    [editor]
  )

  const handleCommentChange = useCallback(
    (id: string, text: string) => {
      setComments((prev) => {
        const next = { ...prev }
        if (text) {
          next[id] = text
        } else {
          delete next[id]
        }
        return next
      })
      // Re-serialize and re-extract with the updated comment
      if (editor) {
        const updatedComments = { ...commentsRef.current }
        if (text) updatedComments[id] = text
        else delete updatedComments[id]
        setRawMarkup(serializeCriticMarkup(editor.state.doc, updatedComments))
        setChanges(extractChanges(editor.state.doc, updatedComments))
      }
    },
    [editor]
  )

  const handleReturnToEditor = useCallback(() => {
    if (!editor) return
    editor.commands.focus()
  }, [editor])

  const handleFocusHandled = useCallback(() => {
    setFocusCommentId(null)
  }, [])

  // Tab-to-comment: called from TrackChanges plugin via custom event
  // Cmd+Shift+H: create highlight on selection
  // These are wired via DOM events since the plugin can't access React state directly

  // Listen for custom events from the TrackChanges plugin
  const handleTabToComment = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.changeId) {
        setFocusCommentId(detail.changeId)
        // On mobile, open the panel if it's closed
        setPanelOpen(true)
      }
    },
    []
  )

  const handleCreateHighlight = useCallback(
    () => {
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
      // Focus the comment input for this new highlight
      setFocusCommentId(id)
      setPanelOpen(true)
    },
    [editor]
  )

  // Attach event listeners for custom events from the TrackChanges plugin
  useEffect(() => {
    window.addEventListener('trackchanges:tab-to-comment', handleTabToComment)
    window.addEventListener(
      'trackchanges:create-highlight',
      handleCreateHighlight
    )
    return () => {
      window.removeEventListener(
        'trackchanges:tab-to-comment',
        handleTabToComment
      )
      window.removeEventListener(
        'trackchanges:create-highlight',
        handleCreateHighlight
      )
    }
  }, [handleTabToComment, handleCreateHighlight])

  // Check for saved session on mount
  useEffect(() => {
    const saved = getSavedSession()
    if (saved) {
      setRecoverySession(saved)
      setShowRecovery(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save to localStorage (debounced 1s)
  const debouncedMarkupForSave = useDebouncedValue(rawMarkup, 1000)

  useEffect(() => {
    if (debouncedMarkupForSave) {
      saveSession(debouncedMarkupForSave, commentsRef.current)
    }
  }, [debouncedMarkupForSave]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleResume = useCallback(() => {
    if (recoverySession && editor) {
      const { html, comments: savedComments } = criticMarkupToHTML(
        recoverySession.markup
      )
      commentsRef.current = savedComments
      setComments(savedComments)
      editor.commands.setContent(html)
    }
    setShowRecovery(false)
  }, [recoverySession, editor])

  const handleStartFresh = useCallback(() => {
    clearSession()
    setShowRecovery(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close mobile drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelOpen) {
        // Only close on mobile (< lg:). On desktop, Escape shouldn't close the inline panel.
        if (window.innerWidth < 1024) {
          setPanelOpen(false)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [panelOpen])

  const changesPanelElement = (
    <ChangesPanel
      changes={changes}
      onScrollTo={handleScrollTo}
      onCommentChange={handleCommentChange}
      focusCommentId={focusCommentId}
      onFocusHandled={handleFocusHandled}
      onReturnToEditor={handleReturnToEditor}
      onClose={() => setPanelOpen(false)}
    />
  )

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 flex flex-col h-dvh overflow-hidden">
      <div className="flex-shrink-0 pt-4 lg:pt-6">
        <Toolbar
          onImportClick={() => setImportOpen(true)}
          onAboutToggle={() => setAboutOpen((prev) => !prev)}
          onPanelToggle={() => setPanelOpen((prev) => !prev)}
          isPanelOpen={panelOpen}
          changeCount={changes.length}
          markup={rawMarkup}
        />
      </div>

      <div className="flex flex-col lg:flex-row lg:gap-4 flex-1 min-h-0">
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto pb-4 lg:pb-6">
          <div className="border border-gray-300 rounded-lg bg-white shadow-sm">
            <EditorContent editor={editor} />
          </div>

          <SourceView
            markup={debouncedMarkup}
            isExpanded={sourceExpanded}
            onToggle={() => setSourceExpanded((prev) => !prev)}
          />
        </div>

        {/* Desktop inline panel */}
        {panelOpen && (
          <div className="hidden lg:block w-80 flex-shrink-0 overflow-y-auto border-l border-gray-200">
            {changesPanelElement}
          </div>
        )}
      </div>

      {/* Mobile drawer backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* Mobile drawer panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-white shadow-xl transition-transform duration-200 ease-out lg:hidden ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto">
          {changesPanelElement}
        </div>
      </div>

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      <AboutPanel
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />

      {showRecovery && recoverySession && (
        <RecoveryModal
          savedAt={recoverySession.savedAt}
          onResume={handleResume}
          onStartFresh={handleStartFresh}
        />
      )}
    </div>
  )
}
