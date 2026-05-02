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
      className={`inline-flex h-8 flex-shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 font-mono-data text-[11px] font-black uppercase tracking-[0.07em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${className}`}
      style={active
        ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#0B0B0F', boxShadow: '0 0 22px rgba(230,255,61,0.12)' }
        : { background: 'rgba(20,20,27,0.82)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {icon && <span className="flex items-center [&_svg]:h-[1em] [&_svg]:w-[1em]">{icon}</span>}
      {children}
    </button>
  )
}
