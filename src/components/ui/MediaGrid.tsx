import type { ReactNode } from 'react'
import { PosterCard } from '@/components/ui/PosterCard'
import type { MediaRailItem } from '@/components/ui/MediaRail'

interface MediaGridProps<T extends MediaRailItem = MediaRailItem> {
  items: T[]
  showMetaRow?: boolean
  className?: string
  itemClassName?: string
  emptyState?: ReactNode
  renderActions?: (item: T) => ReactNode
  onItemClick?: (item: T) => void
}

export function MediaGrid<T extends MediaRailItem = MediaRailItem>({
  items,
  showMetaRow = false,
  className = '',
  itemClassName = '',
  emptyState,
  renderActions,
  onItemClick,
}: MediaGridProps<T>) {
  if (items.length === 0) {
    return (
      <>
        {emptyState || (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-6 text-center text-[13px] text-[var(--text-muted)]">
            Nessun elemento da mostrare.
          </div>
        )}
      </>
    )
  }

  return (
    <div className={`grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 ${className}`}>
      {items.map(item => (
        <PosterCard
          key={item.id}
          className={itemClassName}
          title={item.title}
          type={item.type}
          coverImage={item.coverImage}
          year={item.year}
          meta={item.meta}
          score={item.score}
          status={item.status}
          progress={item.progress}
          showMetaRow={showMetaRow}
          isInCollection={item.isInCollection}
          isWishlisted={item.isWishlisted}
          actions={renderActions?.(item)}
          onClick={onItemClick ? () => onItemClick(item) : undefined}
        />
      ))}
    </div>
  )
}
