import type { ChangeEntry } from '../utils/extractChanges'

interface ChangesPanelProps {
  changes: ChangeEntry[]
  onScrollTo: (from: number, to: number) => void
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
} as const

export default function ChangesPanel({
  changes,
  onScrollTo,
}: ChangesPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-900">
          {changes.length === 0
            ? 'No changes'
            : `${changes.length} change${changes.length === 1 ? '' : 's'}`}
        </h2>
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
}: {
  change: ChangeEntry
  onScrollTo: (from: number, to: number) => void
}) {
  const config = TYPE_CONFIG[change.type]

  return (
    <button
      type="button"
      onClick={() => onScrollTo(change.from, change.to)}
      className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors flex gap-3"
    >
      <div className={`w-1 flex-shrink-0 rounded-full ${config.barColor}`} />

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
  }
}
