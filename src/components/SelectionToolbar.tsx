import { useState, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'

interface SelectionToolbarProps {
  editor: Editor | null
  onHighlight: () => void
}

/**
 * Floating toolbar that appears above the user's text selection.
 * Shows a "Highlight" button when there is a non-empty selection.
 * Positioned using the native Selection API so it tracks the selection rect.
 */
export default function SelectionToolbar({
  editor,
  onHighlight,
}: SelectionToolbarProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return

    const update = () => {
      const { from, to } = editor.state.selection
      if (from === to) {
        setRect(null)
        return
      }

      // Give the browser a tick to render the selection before measuring
      requestAnimationFrame(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          setRect(null)
          return
        }
        const r = sel.getRangeAt(0).getBoundingClientRect()
        if (r.width === 0 && r.height === 0) {
          setRect(null)
          return
        }
        setRect(r)
      })
    }

    editor.on('selectionUpdate', update)
    editor.on('blur', () => setRect(null))
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('blur', () => setRect(null))
    }
  }, [editor])

  if (!rect) return null

  const TOOLBAR_HEIGHT = 32 // px — approximate height of the toolbar
  const GAP = 6 // px between toolbar bottom and selection top

  const top = rect.top - TOOLBAR_HEIGHT - GAP
  const left = rect.left + rect.width / 2

  return (
    <div
      ref={toolbarRef}
      style={{ top, left }}
      className="fixed z-50 -translate-x-1/2 flex items-center gap-0.5 bg-gray-800 text-white rounded-md shadow-lg px-1 py-1 select-none pointer-events-auto"
    >
      <button
        type="button"
        onMouseDown={(e) => {
          // Prevent the click from collapsing the selection before we read it
          e.preventDefault()
          onHighlight()
        }}
        className="px-2 py-0.5 text-xs font-medium rounded hover:bg-gray-600 transition-colors cursor-pointer"
        title="Highlight and comment (Cmd+Shift+H)"
      >
        Highlight
      </button>
    </div>
  )
}
