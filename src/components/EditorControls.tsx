interface EditorControlsProps {
  trackingEnabled: boolean
  onTrackingToggle: () => void
  fontPreference: 'default' | 'literata'
  onFontChange: () => void
  decorationsEnabled: boolean
  onDecorationsToggle: () => void
}

export default function EditorControls({
  trackingEnabled,
  onTrackingToggle,
  fontPreference,
  onFontChange,
  decorationsEnabled,
  onDecorationsToggle,
}: EditorControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Tracking toggle pill */}
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

      {/* Font toggle */}
      <div className="hidden sm:flex items-center gap-0.5 bg-gray-100 rounded-full p-0.5">
        <button
          onClick={() => fontPreference !== 'default' && onFontChange()}
          className={`px-2 py-0.5 text-[11px] rounded-full transition-colors cursor-pointer ${
            fontPreference === 'default'
              ? 'bg-white text-gray-900 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          title="Sans-serif font"
        >
          Sans
        </button>
        <button
          onClick={() => fontPreference !== 'literata' && onFontChange()}
          className={`px-2 py-0.5 text-[11px] rounded-full transition-colors cursor-pointer ${
            fontPreference === 'literata'
              ? 'bg-white text-gray-900 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          style={fontPreference === 'literata' ? { fontFamily: "'Literata', Georgia, serif" } : undefined}
          title="Serif font (Literata)"
        >
          Serif
        </button>
      </div>

      {/* Markdown decorations toggle (placeholder — no-op until Phase 10D) */}
      <button
        onClick={onDecorationsToggle}
        className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
          decorationsEnabled
            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
        title="Toggle markdown formatting preview (coming soon)"
        aria-label={decorationsEnabled ? 'Formatting preview on' : 'Formatting preview off'}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c.024.082.051.164.082.246.13.346.35.72.678 1.078.33.359.765.686 1.34.927.575.24 1.28.404 2.156.404s1.581-.164 2.156-.404c.575-.241 1.01-.568 1.34-.927.327-.358.547-.732.678-1.078.03-.082.058-.164.082-.246l-.933-.267a1.5 1.5 0 01-1.052-1.767l.716-3.223A1.5 1.5 0 0113.352 2H14.5A1.5 1.5 0 0116 3.5v2.012a1.5 1.5 0 01-1.113 1.45l-2.439.61a1.5 1.5 0 00-1.113 1.45V13.5a1.5 1.5 0 01-1.5 1.5h-1.67a1.5 1.5 0 01-1.5-1.5V9.022a1.5 1.5 0 00-1.113-1.45l-2.439-.61A1.5 1.5 0 012 5.512V3.5z" clipRule="evenodd" />
        </svg>
        <span className="hidden md:inline">{decorationsEnabled ? 'Rich' : 'Plain'}</span>
      </button>
    </div>
  )
}
