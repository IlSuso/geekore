import type { ReactNode } from 'react'

interface FilterChipProps {
  children: ReactNode
  active?: boolean
  icon?: ReactNode
  className?: string
  onClick?: () => void
}

export function FilterChip({ children, active = false, icon, className = '', onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-no-swipe="true"
      onClick={(event) => { event.stopPropagation(); onClick?.() }}
      onPointerDown={event => event.stopPropagation()}
      className={`inline-flex h-8 flex-shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${className}`}
      style={active
        ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#0B0B0F' }
        : { background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {icon && <span className="flex items-center [&_svg]:h-[1em] [&_svg]:w-[1em]">{icon}</span>}
      {children}
    </button>
  )
}
