interface MediaSkeletonsProps {
  count?: number
  variant?: 'rail' | 'grid'
  showMeta?: boolean
  className?: string
}

function PosterSkeleton({ showMeta = false }: { showMeta?: boolean }) {
  return (
    <div className="min-w-0 animate-pulse">
      <div className="aspect-[2/3] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]" />
      <div className="mt-2 space-y-1.5 px-0.5">
        <div className="h-3 w-4/5 rounded-full bg-[var(--bg-card-hover)]" />
        <div className="h-3 w-1/2 rounded-full bg-[var(--bg-card-hover)]" />
        {showMeta && (
          <div className="pt-1 space-y-2">
            <div className="flex gap-1.5">
              <div className="h-5 w-14 rounded-full bg-[var(--bg-card-hover)]" />
              <div className="h-5 w-16 rounded-full bg-[var(--bg-card-hover)]" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--bg-card-hover)]" />
          </div>
        )}
      </div>
    </div>
  )
}

export function MediaRailSkeleton({ count = 8, showMeta = false, className = '' }: Omit<MediaSkeletonsProps, 'variant'>) {
  return (
    <div className={`gk-carousel -mx-4 flex gap-3 px-4 pb-1 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="w-[118px] sm:w-[138px] md:w-[150px] flex-shrink-0">
          <PosterSkeleton showMeta={showMeta} />
        </div>
      ))}
    </div>
  )
}

export function MediaGridSkeleton({ count = 12, showMeta = false, className = '' }: Omit<MediaSkeletonsProps, 'variant'>) {
  return (
    <div className={`grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <PosterSkeleton key={index} showMeta={showMeta} />
      ))}
    </div>
  )
}

export function MediaSkeletons({ variant = 'grid', count, showMeta, className }: MediaSkeletonsProps) {
  return variant === 'rail'
    ? <MediaRailSkeleton count={count} showMeta={showMeta} className={className} />
    : <MediaGridSkeleton count={count} showMeta={showMeta} className={className} />
}
