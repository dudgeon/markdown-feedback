import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChangeEntry, CommentThread } from '../utils/extractChanges'

interface ChangesPanelProps {
  changes: ChangeEntry[]
  onScrollTo: (from: number, to: number) => void
  onAddComment: (changeId: string, text: string) => void
  onEditComment: (changeId: string, threadId: string, text: string) => void
  onDeleteComment: (changeId: string, threadId: string) => void
  onRevert: (id: string) => void
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
  onAddComment,
  onEditComment,
  onDeleteComment,
  onRevert,
  focusCommentId,
  onFocusHandled,
  onReturnToEditor,
  onClose,
}: ChangesPanelProps) {
  const totalComments = changes.reduce(
    (sum, c) => sum + (c.comments?.length ?? 0),
    0
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          {changes.length === 0
            ? 'No changes'
            : `${changes.length} change${changes.length === 1 ? '' : 's'}${
                totalComments > 0
                  ? `, ${totalComments} comment${totalComments === 1 ? '' : 's'}`
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
              onAddComment={onAddComment}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
              onRevert={onRevert}
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
  onAddComment,
  onEditComment,
  onDeleteComment,
  onRevert,
  shouldFocus,
  onFocusHandled,
  onReturnToEditor,
}: {
  change: ChangeEntry
  onScrollTo: (from: number, to: number) => void
  onAddComment: (changeId: string, text: string) => void
  onEditComment: (changeId: string, threadId: string, text: string) => void
  onDeleteComment: (changeId: string, threadId: string) => void
  onRevert: (id: string) => void
  shouldFocus: boolean
  onFocusHandled: () => void
  onReturnToEditor: () => void
}) {
  const config = TYPE_CONFIG[change.type]
  // showReplyInput: whether the new-comment textarea is open
  const [showReplyInput, setShowReplyInput] = useState(false)
  const replyRef = useRef<HTMLTextAreaElement>(null)

  const showInput = showReplyInput || shouldFocus

  useEffect(() => {
    if (shouldFocus && replyRef.current) {
      replyRef.current.focus()
      onFocusHandled()
    }
  }, [shouldFocus, onFocusHandled])

  const handleReplyBlur = useCallback(() => {
    const val = replyRef.current?.value.trim() ?? ''
    if (val) {
      onAddComment(change.id, val)
      if (replyRef.current) replyRef.current.value = ''
    }
    setShowReplyInput(false)
  }, [change.id, onAddComment])

  const handleReplyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        handleReplyBlur()
        onReturnToEditor()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleReplyBlur()
        onReturnToEditor()
      } else if (e.key === 'Escape') {
        if (replyRef.current) replyRef.current.value = ''
        setShowReplyInput(false)
        onReturnToEditor()
      }
    },
    [handleReplyBlur, onReturnToEditor]
  )

  const threads = change.comments ?? []

  return (
    <div className="border-b border-gray-100">
      {/* Header row: change summary + revert button */}
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => onScrollTo(change.from, change.to)}
          className="flex-1 text-left px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors flex gap-3 min-w-0"
        >
          <div
            className={`w-1 flex-shrink-0 rounded-full mt-0.5 ${config.barColor}`}
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
          </div>
        </button>

        <button
          type="button"
          onClick={() => onRevert(change.id)}
          title="Revert this change"
          className="flex-shrink-0 mt-3 mr-3 p-1 text-gray-300 hover:text-gray-500 rounded hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Revert change"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.061.025z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Thread stack */}
      {threads.length > 0 && (
        <div className="pl-8 pr-4 pb-2 space-y-1">
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              changeId={change.id}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
            />
          ))}
        </div>
      )}

      {/* New-comment (reply) textarea */}
      {showInput ? (
        <div className="px-4 pb-3 pl-8">
          <textarea
            ref={replyRef}
            placeholder={threads.length > 0 ? 'Reply…' : 'Add a comment…'}
            rows={2}
            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
            onBlur={handleReplyBlur}
            onKeyDown={handleReplyKeyDown}
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              handleReplyBlur()
              onReturnToEditor()
            }}
            className="mt-1 px-2 py-0.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 cursor-pointer transition-colors"
          >
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowReplyInput(true)
            setTimeout(() => replyRef.current?.focus(), 0)
          }}
          className="px-4 pb-2 pl-8 text-xs text-gray-400 hover:text-purple-500 cursor-pointer"
        >
          {threads.length > 0 ? '+ Reply' : '+ Comment'}
        </button>
      )}
    </div>
  )
}

/** A single thread entry with inline edit capability. */
function ThreadItem({
  thread,
  changeId,
  onEdit,
  onDelete,
}: {
  thread: CommentThread
  changeId: string
  onEdit: (changeId: string, threadId: string, text: string) => void
  onDelete: (changeId: string, threadId: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      // Place cursor at end
      const len = editRef.current.value.length
      editRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  const handleEditBlur = useCallback(() => {
    const val = editRef.current?.value.trim() ?? ''
    onEdit(changeId, thread.id, val) // empty string → delete in store
    setIsEditing(false)
  }, [changeId, thread.id, onEdit])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleEditBlur()
      } else if (e.key === 'Escape') {
        setIsEditing(false)
      }
    },
    [handleEditBlur]
  )

  if (isEditing) {
    return (
      <div>
        <textarea
          ref={editRef}
          defaultValue={thread.text}
          rows={2}
          className="w-full text-xs border border-purple-300 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400"
          onBlur={handleEditBlur}
          onKeyDown={handleEditKeyDown}
        />
      </div>
    )
  }

  return (
    <div className="group flex items-start gap-1">
      <div className="flex-shrink-0 mt-0.5 w-3 h-3 text-purple-300">
        <svg viewBox="0 0 12 12" fill="currentColor">
          <path d="M10 1H2a1 1 0 00-1 1v6a1 1 0 001 1h1v2l2.5-2H10a1 1 0 001-1V2a1 1 0 00-1-1z" />
        </svg>
      </div>
      <p
        className="flex-1 text-xs text-purple-700 leading-snug cursor-pointer hover:text-purple-900"
        onClick={() => setIsEditing(true)}
        title="Click to edit"
      >
        {thread.text}
      </p>
      <button
        type="button"
        onClick={() => onDelete(changeId, thread.id)}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-400 transition-all cursor-pointer"
        aria-label="Delete comment"
        title="Delete"
      >
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
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
