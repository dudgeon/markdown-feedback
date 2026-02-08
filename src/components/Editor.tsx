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
import { serializeCriticMarkup } from '../utils/serializeCriticMarkup'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const SAMPLE_CONTENT = `<h1>Project Update</h1>
<p>The results were delivered by the team at the quarterly review. This was a significant milestone in the project's ongoing development trajectory.</p>
<p>The team has been working very hard on the new features that were requested by the stakeholders. We believe that these improvements will significantly enhance the user experience going forward.</p>
<p>In conclusion, the project is on track and we are confident that we will meet all of the deadlines that have been established for this quarter.</p>`

export default function Editor() {
  const [rawMarkup, setRawMarkup] = useState('')
  const [sourceExpanded, setSourceExpanded] = useState(false)

  const debouncedMarkup = useDebouncedValue(rawMarkup, 500)

  const handleEditorChange = useCallback(
    ({ editor }: { editor: TipTapEditor }) => {
      setRawMarkup(serializeCriticMarkup(editor.state.doc))
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
    content: SAMPLE_CONTENT,
    onUpdate: handleEditorChange,
    onCreate: handleEditorChange,
  })

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
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

      <div className="border border-gray-300 rounded-lg bg-white shadow-sm">
        <EditorContent editor={editor} />
      </div>

      <SourceView
        markup={debouncedMarkup}
        isExpanded={sourceExpanded}
        onToggle={() => setSourceExpanded((prev) => !prev)}
      />

      <div className="mt-4 text-xs text-gray-400">
        <p>
          Phase 2 — CriticMarkup serialization + source view. Toggle the
          source panel below the editor to see live CriticMarkup output.
        </p>
      </div>
    </div>
  )
}
