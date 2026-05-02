import type { ReactNode } from 'react'

interface DiscoverFilterItem {
  id: string
  label: string
  icon?: ReactNode
}

interface DiscoverFilterBarProps {
  items: DiscoverFilterItem[]
  activeId: string
  onChange: (id: string) => void
  className?: string
}

export function DiscoverFilterBar({
  items,
  activeId,
  onChange,
  className = '',
}: DiscoverFilterBarProps) {
  return (
    <div className={`-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide ${className}`}>
      {items.map(item => {
        const active = activeId === item.id

        return (
          <button
            key={item.id}
            data-testid={`filter-${item.id}`}
            type="button"
            onClick={() => onChange(item.id)}
            className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-all ${
              active
                ? 'border-transparent bg-[var(--accent)] text-[#0B0B0F]'
                : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
