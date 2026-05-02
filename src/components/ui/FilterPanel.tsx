import type { ReactNode } from 'react'
import { FilterBar, type FilterBarItem } from '@/components/ui/FilterBar'
import { SearchField } from '@/components/ui/SearchField'

interface FilterPanelProps<T extends FilterBarItem = FilterBarItem> {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchLoading?: boolean
  searchRightSlot?: ReactNode
  onSearchClear?: () => void
  filters?: T[]
  activeFilterId?: string
  onFilterChange?: (id: T['id'], item: T) => void
  actions?: ReactNode
  className?: string
}

export function FilterPanel<T extends FilterBarItem = FilterBarItem>({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchLoading = false,
  searchRightSlot,
  onSearchClear,
  filters = [],
  activeFilterId,
  onFilterChange,
  actions,
  className = '',
}: FilterPanelProps<T>) {
  const hasSearch = typeof searchValue === 'string' && !!onSearchChange
  const hasFilters = filters.length > 0 && typeof activeFilterId === 'string' && !!onFilterChange

  return (
    <div className={`space-y-3 ${className}`}>
      {(hasSearch || actions) && (
        <div className="flex items-center gap-2">
          {hasSearch && (
            <SearchField
              value={searchValue}
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
              loading={searchLoading}
              rightSlot={searchRightSlot}
              onClear={onSearchClear}
              className="min-w-0 flex-1"
            />
          )}
          {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      {hasFilters && (
        <FilterBar
          items={filters}
          activeId={activeFilterId}
          onChange={onFilterChange}
        />
      )}
    </div>
  )
}
