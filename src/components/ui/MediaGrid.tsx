import type { ReactNode } from 'react'
import { PosterCard } from '@/components/ui/PosterCard'
import { MediaGridSkeleton } from '@/components/ui/MediaSkeletons'
import type { MediaRailItem } from '@/components/ui/MediaRail'

interface MediaGridProps<T extends MediaRailItem = MediaRailItem> {
  items: T[]
  loading?: boolean
  skeletonCount?: number
  showMetaRow?: boolean
  className?: string
  itemClassName?: string
  emptyState?: ReactNode
  renderActions?: (item: T) => ReactNode
  onItemClick?: (item: T) => void
  variant?: 'default' | 'library'
}

export function MediaGrid<T extends MediaRailItem = MediaRailItem>({
  items,
  loading = false,
  skeletonCount = 12,
  showMetaRow = false,
  className = '',
  itemClassName = '',
  emptyState,
  renderActions,
  onItemClick,
  variant = 'default',
}: MediaGridProps<T>) {
  if (loading) {
    return <MediaGridSkeleton count={skeletonCount} showMeta={showMetaRow} className={className} />
  }

  if (items.length === 0) {
    return (
      <div data-no-swipe="true">
        {emptyState || (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-6 text-center text-[13px] text-[var(--text-muted)]">
            Nessun elemento da mostrare.
          </div>
        )}
      </div>
    )
  }

  const gridClass = variant === 'library'
    ? 'grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8'
    : 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6'

  return (
    <div className={`${gridClass} ${className}`} data-no-swipe="true">
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
          variant={variant}
          onClick={onItemClick ? () => onItemClick(item) : undefined}
        />
      ))}
    </div>
  )
}
