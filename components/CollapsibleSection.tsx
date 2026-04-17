type Props = {
  title: string
  isOpen: boolean
  onToggle: () => void
  loading?: boolean
  badge?: number
  children: React.ReactNode
}

export default function CollapsibleSection({ title, isOpen, onToggle, loading, badge, children }: Props) {
  return (
    <div className="flex-shrink-0 border-b border-gray-100 bg-gray-50">
      <button
        onClick={onToggle}
        disabled={loading}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-100 transition-colors disabled:cursor-default"
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">{title}</p>
          {badge !== undefined && !loading && (
            <span className="text-xs font-medium bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        {loading ? (
          <div className="w-14 h-3 bg-gray-200 rounded animate-pulse" />
        ) : (
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : '-rotate-90'}`}
            viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <path d="M5 2l5 5-5 5"/>
          </svg>
        )}
      </button>
      {isOpen && !loading && <div>{children}</div>}
    </div>
  )
}
