import { useState, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
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
import RecoveryModal from './RecoveryModal'
import { criticMarkupToHTML } from '../utils/parseCriticMarkup'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useDocumentStore } from '../stores/documentStore'

const SAMPLE_MARKDOWN = `# Selected Passages from *The Elements of Style*

Vigorous writing is concise. A sentence should contain no unnecessary words, a paragraph no unnecessary sentences, for the same reason that a drawing should have no unnecessary lines and a machine no unnecessary parts. This requires not that the writer make all his sentences short, or that he avoid all detail and treat his subjects only in outline, but that every word tell.

(Rule 17: Omit needless words)

Write with nouns and verbs, not with adjectives and adverbs. The adjective hasn't been built that can pull a weak or inaccurate noun out of a tight place. It is nouns and verbs, not their assistants, that give good writing its toughness and color.

(Chapter V: An Approach to Style, Principle 14)

---

**Source:** Strunk, William Jr., and E.B. White. *The Elements of Style*. 4th ed., Longman, 2000.`

export default function Editor() {
  // UI-only local state
  const [sourceExpanded, setSourceExpanded] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1024)
  const [aboutOpen, setAboutOpen] = useState(false)

  // Store state
  const rawMarkup = useDocumentStore((s) => s.rawMarkup)
  const changes = useDocumentStore((s) => s.changes)
  const trackingEnabled = useDocumentStore((s) => s.trackingEnabled)
  const focusCommentId = useDocumentStore((s) => s.focusCommentId)
  const showRecovery = useDocumentStore((s) => s.showRecovery)
  const recoverySession = useDocumentStore((s) => s.recoverySession)

  // Store actions (stable references)
  const setEditor = useDocumentStore((s) => s.setEditor)
  const handleEditorChange = useDocumentStore((s) => s.handleEditorChange)
  const importDocument = useDocumentStore((s) => s.importDocument)
  const setComment = useDocumentStore((s) => s.setComment)
  const scrollToChange = useDocumentStore((s) => s.scrollToChange)
  const clearFocusComment = useDocumentStore((s) => s.clearFocusComment)
  const returnToEditor = useDocumentStore((s) => s.returnToEditor)
  const toggleTracking = useDocumentStore((s) => s.toggleTracking)
  const checkForRecovery = useDocumentStore((s) => s.checkForRecovery)
  const resumeSession = useDocumentStore((s) => s.resumeSession)
  const startFresh = useDocumentStore((s) => s.startFresh)
  const saveSession = useDocumentStore((s) => s.saveSession)

  const debouncedMarkup = useDebouncedValue(rawMarkup, 500)

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
    onUpdate: ({ editor }) => handleEditorChange(editor),
    onCreate: ({ editor }) => {
      setEditor(editor)
      if (Object.keys(initialComments).length > 0) {
        useDocumentStore.setState({ comments: initialComments })
      }
      handleEditorChange(editor)
    },
  })

  // Custom DOM events from TrackChanges plugin
  useEffect(() => {
    const handleTab = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.changeId) {
        useDocumentStore.getState().setFocusCommentId(detail.changeId)
        setPanelOpen(true)
      }
    }
    const handleHighlight = () => {
      useDocumentStore.getState().createHighlight()
      setPanelOpen(true)
    }
    const handleToggle = () => {
      useDocumentStore.getState().toggleTracking()
    }
    window.addEventListener('trackchanges:tab-to-comment', handleTab)
    window.addEventListener('trackchanges:create-highlight', handleHighlight)
    window.addEventListener('trackchanges:toggle-tracking', handleToggle)
    return () => {
      window.removeEventListener('trackchanges:tab-to-comment', handleTab)
      window.removeEventListener('trackchanges:create-highlight', handleHighlight)
      window.removeEventListener('trackchanges:toggle-tracking', handleToggle)
    }
  }, [])

  // Check for saved session on mount (web) or load file content (VSCode/Tauri)
  useEffect(() => {
    checkForRecovery()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle 'saveRequested' from VS Code extension host (Cmd+S).
  // Responds with an immediate (non-debounced) save so the extension host
  // has the latest markup before VS Code writes the file to disk.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === 'saveRequested') {
        const { rawMarkup, saveSession } = useDocumentStore.getState()
        saveSession(rawMarkup)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Auto-save to localStorage (debounced 1s)
  const debouncedMarkupForSave = useDebouncedValue(rawMarkup, 1000)

  useEffect(() => {
    if (debouncedMarkupForSave) {
      saveSession(debouncedMarkupForSave)
    }
  }, [debouncedMarkupForSave]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close mobile drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelOpen) {
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
      onScrollTo={scrollToChange}
      onCommentChange={setComment}
      focusCommentId={focusCommentId}
      onFocusHandled={clearFocusComment}
      onReturnToEditor={returnToEditor}
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
          trackingEnabled={trackingEnabled}
          onTrackingToggle={toggleTracking}
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
        onImport={importDocument}
      />

      <AboutPanel
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />

      {showRecovery && recoverySession && (
        <RecoveryModal
          savedAt={recoverySession.savedAt}
          onResume={resumeSession}
          onStartFresh={startFresh}
        />
      )}
    </div>
  )
}
