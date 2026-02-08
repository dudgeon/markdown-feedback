import { useState } from 'react'

interface SourceViewProps {
  markup: string
  isExpanded: boolean
  onToggle: () => void
}

/**
 * Syntax-highlight CriticMarkup tokens in an HTML-escaped string.
 * Wraps tokens in colored spans for display on a dark background.
 */
function highlightCriticMarkup(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Substitutions: {~~old~>new~~} (note: > is escaped to &gt;)
  html = html.replace(
    /\{~~(.+?)~&gt;(.+?)~~\}/g,
    '<span class="cm-substitution">{~~<span class="cm-del-text">$1</span>~&gt;<span class="cm-ins-text">$2</span>~~}</span>'
  )

  // Deletions: {--text--}
  html = html.replace(
    /\{--(.+?)--\}/g,
    '<span class="cm-deletion">{--$1--}</span>'
  )

  // Insertions: {++text++}
  html = html.replace(
    /\{\+\+(.+?)\+\+\}/g,
    '<span class="cm-insertion">{++$1++}</span>'
  )

  return html
}

export default function SourceView({
  markup,
  isExpanded,
  onToggle,
}: SourceViewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markup)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 border border-gray-300 rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 cursor-pointer transition-colors"
      >
        <span>CriticMarkup Source</span>
        <span className="text-xs">{isExpanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {isExpanded && (
        <div className="relative">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer transition-colors z-10"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>

          <pre className="p-4 pt-10 overflow-x-auto text-sm font-mono leading-relaxed bg-gray-900 text-gray-100 max-h-96 overflow-y-auto whitespace-pre-wrap">
            <code
              dangerouslySetInnerHTML={{
                __html: highlightCriticMarkup(markup),
              }}
            />
          </pre>
        </div>
      )}
    </div>
  )
}
