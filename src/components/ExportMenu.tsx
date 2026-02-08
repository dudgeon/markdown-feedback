import { useState, useRef, useEffect } from 'react'
import {
  exportCriticMarkup,
  exportClean,
  exportOriginal,
  countChanges,
  downloadFile,
} from '../utils/exportDocument'

interface ExportMenuProps {
  markup: string
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function ExportMenu({ markup }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const handleExportCriticMarkup = () => {
    const content = exportCriticMarkup(markup, {
      editDate: new Date().toISOString(),
      changesTotal: countChanges(markup),
    })
    downloadFile(content, `feedback-${formatDate()}.md`)
    setIsOpen(false)
  }

  const handleExportClean = () => {
    const content = exportClean(markup)
    downloadFile(content, `feedback-${formatDate()}-clean.md`)
    setIsOpen(false)
  }

  const handleExportOriginal = () => {
    const content = exportOriginal(markup)
    downloadFile(content, `feedback-${formatDate()}-original.md`)
    setIsOpen(false)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markup)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setIsOpen(false)
    }, 1000)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
      >
        Export &#9662;
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-40">
          <div className="py-1">
            <button
              onClick={handleExportCriticMarkup}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              Download CriticMarkup (.md)
            </button>
            <button
              onClick={handleExportClean}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              Download clean (.md)
            </button>
            <button
              onClick={handleExportOriginal}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              Download original (.md)
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={handleCopy}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              {copied ? 'Copied!' : 'Copy CriticMarkup'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
