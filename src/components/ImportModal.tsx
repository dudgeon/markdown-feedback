import { useState, useRef, useEffect } from 'react'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (text: string) => void
}

export default function ImportModal({
  isOpen,
  onClose,
  onImport,
}: ImportModalProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) {
      setText('')
      // Focus textarea after modal renders
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleLoad = () => {
    if (!text.trim()) return
    onImport(text)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Import Markdown
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Paste your markdown below. CriticMarkup syntax will be parsed
            automatically.
          </p>
        </div>

        <div className="px-6 py-4 flex-1 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste markdown here..."
            className="w-full h-64 p-3 border border-gray-300 rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            disabled={!text.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed rounded-md cursor-pointer transition-colors"
          >
            Load
          </button>
        </div>
      </div>
    </div>
  )
}
