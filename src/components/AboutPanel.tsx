import { useEffect, useCallback } from 'react'

interface AboutPanelProps {
  isOpen: boolean
  onClose: () => void
  fontPreference: 'default' | 'literata'
  onFontToggle: () => void
}

export default function AboutPanel({ isOpen, onClose, fontPreference, onFontToggle }: AboutPanelProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-50 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[340px] max-w-[85vw] bg-white shadow-xl transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto p-6 flex flex-col">
          <p className="text-sm text-gray-700 leading-relaxed">
            <strong>Markdown Feedback</strong> helps you make, track, and add
            context to changes you make while editing markdown files — all while
            using AI-friendly,{' '}
            <a
              href="https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              CriticMarkup
            </a>-native
            formatting. Import from paste or directly from Google Docs
            via .docx files with tracked changes and comments preserved.
          </p>

          <p className="mt-6 text-[10px] font-semibold tracking-widest uppercase text-gray-400">
            Why I built this
          </p>

          <div className="mt-3 space-y-3 text-sm text-gray-700 leading-relaxed">
            <p>
              As a manager of people and robots, providing context on changes to
              writing style is essential for continual learning and improved
              future output quality.
            </p>
            <p>
              As you build your own Claude Skills and other context documents,
              annotated examples of your changes to others' text is as powerful
              as high quality examples of your own writing.
            </p>
            <p>
              Markdown Feedback was designed to help you generate those annotated
              examples in a simple, lightweight way.
            </p>
          </div>

          <p className="mt-4 text-xs text-gray-500 leading-relaxed">
            All processing happens in your browser — no server, no accounts, no
            data sent anywhere. Sessions persist in local storage, so avoid
            pasting sensitive content on shared computers.
          </p>

          <p className="mt-6 text-[10px] font-semibold tracking-widest uppercase text-gray-400">
            Editor Font
          </p>

          <div className="mt-3 flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => fontPreference !== 'default' && onFontToggle()}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                fontPreference === 'default'
                  ? 'bg-white text-gray-900 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Default
            </button>
            <button
              onClick={() => fontPreference !== 'literata' && onFontToggle()}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                fontPreference === 'literata'
                  ? 'bg-white text-gray-900 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={fontPreference === 'literata' ? { fontFamily: "'Literata', Georgia, serif" } : undefined}
            >
              Literata
            </button>
          </div>

          <p className="mt-6 text-[10px] font-semibold tracking-widest uppercase text-gray-400">
            Keyboard Shortcuts
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-700">Toggle tracking</span>
              <kbd className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">Cmd+Shift+T</kbd>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-700">Highlight + comment</span>
              <kbd className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">Cmd+Shift+H</kbd>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-700">Jump to comment</span>
              <kbd className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">Tab</kbd>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Tab jumps to the comment input when the cursor is on a tracked change. In the comment input, Enter saves and Tab returns to the editor.
            </p>
          </div>

          <div className="mt-6">
            <a
              href="https://github.com/dudgeon/markdown-feedback"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              View on GitHub
            </a>
          </div>

          <p className="mt-auto pt-6 text-xs text-gray-400">
            Made by Geoff and Claude in 2026.
          </p>
        </div>
      </div>
    </>
  )
}
