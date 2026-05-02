import type { ReactNode } from 'react'
import { PosterCard } from '@/components/ui/PosterCard'
import { RailSection } from '@/components/ui/RailSection'
import { MediaRailSkeleton } from '@/components/ui/MediaSkeletons'

export interface MediaRailItem {
  id: string | number
  title: string
  type?: string | null
  coverImage?: string | null
  year?: number | string | null
  meta?: string | null
  score?: number | string | null
  status?: string | null
  progress?: {
    current?: number | null
    total?: number | null
    label?: string
  }
  isInCollection?: boolean
  isWishlisted?: boolean
}

interface MediaRailProps<T extends MediaRailItem = MediaRailItem> {
  title: string
  eyebrow?: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  icon?: ReactNode
  items: T[]
  limit?: number
  loading?: boolean
  skeletonCount?: number
  showMetaRow?: boolean
  className?: string
  itemClassName?: string
  emptyState?: ReactNode
  renderActions?: (item: T) => ReactNode
  onItemClick?: (item: T) => void
}

export function MediaRail<T extends MediaRailItem = MediaRailItem>({
  title,
  eyebrow,
  description,
  action,
  icon,
  items,
  limit,
  loading = false,
  skeletonCount = 8,
  showMetaRow = false,
  className = '',
  itemClassName = 'w-[118px] sm:w-[138px] md:w-[150px] flex-shrink-0 snap-start',
  emptyState,
  renderActions,
  onItemClick,
}: MediaRailProps<T>) {
  const visibleItems = typeof limit === 'number' ? items.slice(0, limit) : items

  return (
    <RailSection
      title={title}
      eyebrow={eyebrow}
      description={description}
      action={action}
      icon={icon}
      className={className}
    >
      {loading ? (
        <MediaRailSkeleton count={skeletonCount} showMeta={showMetaRow} />
      ) : visibleItems.length > 0 ? (
        visibleItems.map(item => (
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
        ))
      ) : (
        emptyState || (
          <div className="flex min-h-[180px] w-full items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-6 text-center text-[13px] text-[var(--text-muted)]">
            Nessun elemento da mostrare.
          </div>
        )
      )}
    </RailSection>
  )
}
