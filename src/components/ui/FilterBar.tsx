import type { ReactNode } from 'react'
import { FilterChip } from '@/components/ui/FilterChip'

export interface FilterBarItem {
  id: string
  label: string
  icon?: ReactNode
}

interface FilterBarProps<T extends FilterBarItem = FilterBarItem> {
  items: T[]
  activeId: string
  onChange: (id: T['id'], item: T) => void
  className?: string
  chipClassName?: string
  ariaLabel?: string
}

export function FilterBar<T extends FilterBarItem = FilterBarItem>({
  items,
  activeId,
  onChange,
  className = '',
  chipClassName = '',
  ariaLabel = 'Filtri',
}: FilterBarProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-no-swipe="true"
      data-horizontal-scroll="true"
      data-interactive="true"
      className={`gk-carousel -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 ${className}`}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      {items.map(item => (
        <FilterChip
          key={item.id}
          active={item.id === activeId}
          icon={item.icon}
          className={chipClassName}
          onClick={() => onChange(item.id, item)}
        >
          {item.label}
        </FilterChip>
      ))}
    </div>
  )
}
