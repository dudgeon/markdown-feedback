import { useState, useRef, useEffect } from 'react'
import { parseDocx, type DocxParseResult } from '../utils/parseDocx'

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
  const [activeTab, setActiveTab] = useState<'paste' | 'docx'>('paste')
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // .docx state
  const [docxResult, setDocxResult] = useState<DocxParseResult | null>(null)
  const [docxError, setDocxError] = useState<string | null>(null)
  const [docxLoading, setDocxLoading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setText('')
      setActiveTab('paste')
      resetDocxState()
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [isOpen])

  function resetDocxState() {
    setDocxResult(null)
    setDocxError(null)
    setDocxLoading(false)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (!isOpen) return null

  const canLoad =
    activeTab === 'paste' ? !!text.trim() : !!docxResult

  const handleLoad = () => {
    if (activeTab === 'paste') {
      if (!text.trim()) return
      onImport(text)
    } else {
      if (!docxResult) return
      onImport(docxResult.markup)
    }
    onClose()
  }

  const handleTabSwitch = (tab: 'paste' | 'docx') => {
    setActiveTab(tab)
    if (tab === 'paste') {
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setDocxError(null)
    setDocxResult(null)
    setDocxLoading(true)

    try {
      const buffer = await file.arrayBuffer()
      const result = await parseDocx(buffer)
      setDocxResult(result)
    } catch (err) {
      setDocxError(
        err instanceof Error
          ? err.message
          : 'There was a problem reading this file. Try re-exporting from Google Docs.'
      )
    } finally {
      setDocxLoading(false)
    }
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
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Import</h2>

          {/* Tabs */}
          <div className="flex gap-4 mt-3">
            <button
              onClick={() => handleTabSwitch('paste')}
              className={`pb-1.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'paste'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Paste
            </button>
            <button
              onClick={() => handleTabSwitch('docx')}
              className={`pb-1.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'docx'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              .docx File
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 flex-1 overflow-hidden">
          {activeTab === 'paste' ? (
            <>
              <p className="text-sm text-gray-500 mb-3">
                Paste your markdown below. CriticMarkup syntax will be parsed
                automatically.
              </p>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste markdown here..."
                className="w-full h-56 p-3 border border-gray-300 rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Import a .docx file exported from Google Docs. Tracked changes
                (suggestions) and comments will be preserved.
              </p>
              <p className="text-xs text-gray-400">
                <strong>Known limitation:</strong> Google Docs strips tables
                when exporting to .docx. Tables are supported in Microsoft Word
                .docx files.
              </p>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  Choose File
                </button>
                {fileName && (
                  <span className="ml-3 text-sm text-gray-600">{fileName}</span>
                )}
              </div>

              {/* Status area */}
              <div className="h-32 flex items-center justify-center border border-gray-200 rounded-md bg-gray-50">
                {docxLoading ? (
                  <p className="text-sm text-gray-500">Parsing document...</p>
                ) : docxError ? (
                  <p className="text-sm text-red-600 px-4 text-center">
                    {docxError}
                  </p>
                ) : docxResult ? (
                  <div className="text-sm text-gray-700 text-center">
                    {docxResult.changeCount > 0 ? (
                      <p className="text-green-700">
                        {docxResult.changeCount} tracked change
                        {docxResult.changeCount !== 1 ? 's' : ''} found
                        {docxResult.commentCount > 0 && (
                          <>, {docxResult.commentCount} comment
                            {docxResult.commentCount !== 1 ? 's' : ''}</>
                        )}
                      </p>
                    ) : (
                      <p className="text-gray-500">
                        No tracked changes found — importing as plain markdown
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    Select a .docx file to import
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            disabled={!canLoad}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed rounded-md cursor-pointer transition-colors"
          >
            Load
          </button>
        </div>
      </div>
    </div>
  )
}
