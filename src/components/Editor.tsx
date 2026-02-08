import { useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor as TipTapEditor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  TrackedDeletion,
  TrackedInsertion,
  TrackChanges,
} from '../extensions/trackChanges'
import SourceView from './SourceView'
import ImportModal from './ImportModal'
import ExportMenu from './ExportMenu'
import ChangesPanel from './ChangesPanel'
import { serializeCriticMarkup } from '../utils/serializeCriticMarkup'
import { extractChanges, type ChangeEntry } from '../utils/extractChanges'
import { criticMarkupToHTML } from '../utils/parseCriticMarkup'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const SAMPLE_MARKDOWN = `# Project Update

The results were delivered by the team at the quarterly review. This was a significant milestone in the project's ongoing development trajectory.

The team has been working very hard on the new features that were requested by the stakeholders. We believe that these improvements will significantly enhance the user experience going forward.

In conclusion, the project is on track and we are confident that we will meet all of the deadlines that have been established for this quarter.`

export default function Editor() {
  const [rawMarkup, setRawMarkup] = useState('')
  const [changes, setChanges] = useState<ChangeEntry[]>([])
  const [sourceExpanded, setSourceExpanded] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const debouncedMarkup = useDebouncedValue(rawMarkup, 500)

  const handleEditorChange = useCallback(
    ({ editor }: { editor: TipTapEditor }) => {
      setRawMarkup(serializeCriticMarkup(editor.state.doc))
      setChanges(extractChanges(editor.state.doc))
    },
    []
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      TrackedDeletion,
      TrackedInsertion,
      TrackChanges,
    ],
    content: criticMarkupToHTML(SAMPLE_MARKDOWN),
    onUpdate: handleEditorChange,
    onCreate: handleEditorChange,
  })

  const handleImport = useCallback(
    (text: string) => {
      if (!editor) return
      const html = criticMarkupToHTML(text)
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

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Markdown Feedback
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Edit the text below. Deletions appear as{' '}
              <span className="tracked-deletion">red strikethrough</span>,
              insertions as{' '}
              <span className="tracked-insertion">green text</span>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
            >
              Import
            </button>
            <ExportMenu markup={rawMarkup} />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="border border-gray-300 rounded-lg bg-white shadow-sm">
            <EditorContent editor={editor} />
          </div>
        </div>

        <div className="w-80 flex-shrink-0">
          <div className="border border-gray-200 rounded-lg bg-white shadow-sm h-[calc(100vh-12rem)] sticky top-6">
            <ChangesPanel changes={changes} onScrollTo={handleScrollTo} />
          </div>
        </div>
      </div>

      <SourceView
        markup={debouncedMarkup}
        isExpanded={sourceExpanded}
        onToggle={() => setSourceExpanded((prev) => !prev)}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  )
}
