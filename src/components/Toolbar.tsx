import ExportMenu from './ExportMenu'

interface ToolbarProps {
  onImportClick: () => void
  onAboutToggle: () => void
  onPanelToggle: () => void
  isPanelOpen: boolean
  changeCount: number
  markup: string
  trackingEnabled: boolean
  onTrackingToggle: () => void
}

export default function Toolbar({
  onImportClick,
  onAboutToggle,
  onPanelToggle,
  isPanelOpen,
  changeCount,
  markup,
  trackingEnabled,
  onTrackingToggle,
}: ToolbarProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      {/* Left side: about icon + title + tracking indicator */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onAboutToggle}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
          aria-label="About"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
          Markdown Feedback
        </h1>
        <button
          onClick={onTrackingToggle}
          className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
            trackingEnabled
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          title={trackingEnabled ? 'Tracking changes (Cmd+Shift+T)' : 'Direct editing (Cmd+Shift+T)'}
          aria-label={trackingEnabled ? 'Tracking changes — click to disable' : 'Direct editing — click to enable tracking'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${trackingEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="hidden sm:inline">{trackingEnabled ? 'Tracking' : 'Direct'}</span>
        </button>
      </div>

      {/* Right side: import, export, panel toggle */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onImportClick}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <span className="hidden md:inline">Import</span>
          <svg
            className="w-4 h-4 md:hidden"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M13.75 7h-3V3.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L6.2 4.74a.75.75 0 001.1 1.02l1.95-2.1V7h-3A2.25 2.25 0 004 9.25v7.5A2.25 2.25 0 006.25 19h7.5A2.25 2.25 0 0016 16.75v-7.5A2.25 2.25 0 0013.75 7z" />
          </svg>
        </button>

        <ExportMenu markup={markup} />

        <button
          onClick={onPanelToggle}
          className={`relative px-2 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${
            isPanelOpen
              ? 'text-gray-900 bg-gray-100 border border-gray-300'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
          }`}
          aria-label="Toggle changes panel"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 012 10z"
              clipRule="evenodd"
            />
          </svg>
          {!isPanelOpen && changeCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-blue-500 rounded-full px-1">
              {changeCount > 99 ? '99+' : changeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
