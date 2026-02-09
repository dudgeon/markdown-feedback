interface RecoveryModalProps {
  savedAt: number
  onResume: () => void
  onStartFresh: () => void
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export default function RecoveryModal({
  savedAt,
  onResume,
  onStartFresh,
}: RecoveryModalProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onStartFresh()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onStartFresh}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Resume your previous session?
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            You have unsaved work from {timeAgo(savedAt)}.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onStartFresh}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer transition-colors"
          >
            Start Fresh
          </button>
          <button
            onClick={onResume}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer transition-colors"
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  )
}
