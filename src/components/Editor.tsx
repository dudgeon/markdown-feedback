import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  TrackedDeletion,
  TrackedInsertion,
  TrackChanges,
} from '../extensions/trackChanges'

const SAMPLE_CONTENT = `<h1>Project Update</h1>
<p>The results were delivered by the team at the quarterly review. This was a significant milestone in the project's ongoing development trajectory.</p>
<p>The team has been working very hard on the new features that were requested by the stakeholders. We believe that these improvements will significantly enhance the user experience going forward.</p>
<p>In conclusion, the project is on track and we are confident that we will meet all of the deadlines that have been established for this quarter.</p>`

export default function Editor() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TrackedDeletion,
      TrackedInsertion,
      TrackChanges,
    ],
    content: SAMPLE_CONTENT,
  })

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          CriticMark Editor
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

      <div className="mt-4 text-xs text-gray-400">
        <p>
          Phase 1 spike — testing TipTap intercept plugin. Try: select
          text and delete, type new text, select text and type a
          replacement.
        </p>
      </div>
    </div>
  )
}
