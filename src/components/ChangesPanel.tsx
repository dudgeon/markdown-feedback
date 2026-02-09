import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChangeEntry } from '../utils/extractChanges'

interface ChangesPanelProps {
  changes: ChangeEntry[]
  onScrollTo: (from: number, to: number) => void
  onCommentChange: (id: string, text: string) => void
  focusCommentId: string | null
  onFocusHandled: () => void
  onReturnToEditor: () => void
  onClose?: () => void
}

const TYPE_CONFIG = {
  deletion: {
    label: 'Deleted',
    barColor: 'bg-red-500',
    badgeColor: 'bg-red-100 text-red-700',
  },
  insertion: {
    label: 'Inserted',
    barColor: 'bg-green-500',
    badgeColor: 'bg-green-100 text-green-700',
  },
  substitution: {
    label: 'Replaced',
    barColor: 'bg-blue-500',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  highlight: {
    label: 'Comment',
    barColor: 'bg-yellow-400',
    badgeColor: 'bg-yellow-100 text-yellow-700',
  },
} as const

export default function ChangesPanel({
  changes,
  onScrollTo,
  onCommentChange,
  focusCommentId,
  onFocusHandled,
  onReturnToEditor,
  onClose,
}: ChangesPanelProps) {
  const commentCount = changes.filter((c) => c.comment).length

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          {changes.length === 0
            ? 'No changes'
            : `${changes.length} change${changes.length === 1 ? '' : 's'}${
                commentCount > 0
                  ? `, ${commentCount} comment${commentCount === 1 ? '' : 's'}`
                  : ''
              }`}
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded cursor-pointer"
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-gray-400">
            Edits will appear here as you make changes.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {changes.map((change, i) => (
            <ChangeCard
              key={change.id + '-' + i}
              change={change}
              onScrollTo={onScrollTo}
              onCommentChange={onCommentChange}
              shouldFocus={focusCommentId === change.id}
              onFocusHandled={onFocusHandled}
              onReturnToEditor={onReturnToEditor}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChangeCard({
  change,
  onScrollTo,
  onCommentChange,
  shouldFocus,
  onFocusHandled,
  onReturnToEditor,
}: {
  change: ChangeEntry
  onScrollTo: (from: number, to: number) => void
  onCommentChange: (id: string, text: string) => void
  shouldFocus: boolean
  onFocusHandled: () => void
  onReturnToEditor: () => void
}) {
  const config = TYPE_CONFIG[change.type]
  const [isEditing, setIsEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const showInput = isEditing || shouldFocus

  useEffect(() => {
    if (shouldFocus && textareaRef.current) {
      textareaRef.current.focus()
      onFocusHandled()
    }
  }, [shouldFocus, onFocusHandled])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    const val = textareaRef.current?.value.trim() ?? ''
    onCommentChange(change.id, val)
  }, [change.id, onCommentChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        handleBlur()
        onReturnToEditor()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleBlur()
        onReturnToEditor()
      }
    },
    [handleBlur, onReturnToEditor]
  )

  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={() => onScrollTo(change.from, change.to)}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors flex gap-3"
      >
        <div
          className={`w-1 flex-shrink-0 rounded-full ${config.barColor}`}
        />

        <div className="flex-1 min-w-0">
          <span
            className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${config.badgeColor} mb-1`}
          >
            {config.label}
          </span>

          <p className="text-sm text-gray-700 leading-snug">
            <ContextSnippet change={change} />
          </p>

          {change.comment && !showInput && (
            <p className="text-xs text-purple-600 mt-1.5 italic">
              {change.comment}
            </p>
          )}
        </div>
      </button>

      {showInput ? (
        <div className="px-4 pb-3 pl-8">
          <textarea
            ref={textareaRef}
            defaultValue={change.comment ?? ''}
            placeholder="Add a comment..."
            rows={2}
            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
            onFocus={() => setIsEditing(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              handleBlur()
              onReturnToEditor()
            }}
            className="mt-1 px-2 py-0.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 cursor-pointer transition-colors"
          >
            Save
          </button>
        </div>
      ) : change.comment ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsEditing(true)
            setTimeout(() => textareaRef.current?.focus(), 0)
          }}
          className="px-4 pb-2 pl-8 text-xs text-gray-400 hover:text-purple-500 cursor-pointer"
        >
          Edit comment
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsEditing(true)
            setTimeout(() => textareaRef.current?.focus(), 0)
          }}
          className="px-4 pb-2 pl-8 text-xs text-gray-400 hover:text-purple-500 cursor-pointer"
        >
          + Comment
        </button>
      )}
    </div>
  )
}

function ContextSnippet({ change }: { change: ChangeEntry }) {
  const before = change.contextBefore
  const after = change.contextAfter

  return (
    <>
      {before && <span className="text-gray-500">{before} </span>}
      <ChangeText change={change} />
      {after && <span className="text-gray-500"> {after}</span>}
    </>
  )
}

function ChangeText({ change }: { change: ChangeEntry }) {
  switch (change.type) {
    case 'deletion':
      return (
        <span className="text-red-600 line-through">{change.deletedText}</span>
      )
    case 'insertion':
      return (
        <span className="text-green-600 bg-green-50 rounded-sm px-0.5">
          {change.insertedText}
        </span>
      )
    case 'substitution':
      return (
        <>
          <span className="text-red-600 line-through">
            {change.deletedText}
          </span>
          <span className="text-gray-400 mx-0.5">{' \u2192 '}</span>
          <span className="text-green-600 bg-green-50 rounded-sm px-0.5">
            {change.insertedText}
          </span>
        </>
      )
    case 'highlight':
      return (
        <span className="bg-yellow-100 border-b border-yellow-400 rounded-sm px-0.5">
          {change.highlightedText}
        </span>
      )
  }
}
