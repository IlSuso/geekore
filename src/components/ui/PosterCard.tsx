import type { ReactNode } from 'react'
import { Check, BookmarkCheck } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'
import { getMediaTypeAccentStyle, getMediaTypeColor } from '@/lib/mediaTypes'
import { getMediaStatusLabel } from '@/lib/mediaStatus'

interface PosterCardProps {
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
  showMetaRow?: boolean
  isInCollection?: boolean
  isWishlisted?: boolean
  actions?: ReactNode
  onClick?: () => void
  className?: string
  imageClassName?: string
  priority?: boolean
}

function PosterCardContent({
  title,
  type,
  coverImage,
  year,
  meta,
  score,
  status,
  progress,
  showMetaRow,
  isInCollection,
  isWishlisted,
  actions,
  imageClassName,
  priority,
}: Omit<PosterCardProps, 'onClick' | 'className'>) {
  const hasCover = !!coverImage
  const collectionStatus = isInCollection ? 'collection' : isWishlisted ? 'wishlist' : null
  const typeColor = getMediaTypeColor(type)
  const visibleStatus = status || (isInCollection ? 'completed' : isWishlisted ? 'planned' : null)

  return (
    <>
      <div
        className="gk-poster-first relative aspect-[2/3] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]"
        style={{ boxShadow: `0 10px 30px rgba(0,0,0,0.22), inset 0 -3px 0 ${typeColor}` }}
      >
        {hasCover ? (
          <img
            src={coverImage || undefined}
            alt={`Copertina di ${title}`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${imageClassName || ''}`}
          />
        ) : (
          <div className="gk-cover-placeholder h-full w-full" style={{ ['--gk-type' as string]: typeColor }}>
            <span className="line-clamp-5">{title}</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/86 via-black/24 to-transparent opacity-90" />
        <div className="pointer-events-none absolute left-2 top-2">
          <MediaTypeBadge type={type} size="xs" variant="soft" />
        </div>

        {score != null && score !== '' && !showMetaRow && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/70 px-2 py-1 font-mono-data text-[10px] font-bold text-white backdrop-blur-sm">
            {score}
          </div>
        )}

        {collectionStatus && (
          <div className="pointer-events-none absolute right-2 top-2">
            {collectionStatus === 'collection' ? (
              <div className="gk-status-pill !static !bg-[var(--accent)] !text-[#0B0B0F]">
                <Check size={10} strokeWidth={2.6} />
                {getMediaStatusLabel(visibleStatus)}
              </div>
            ) : (
              <div className="gk-status-pill !static">
                <BookmarkCheck size={10} strokeWidth={2.2} />
                Wishlist
              </div>
            )}
          </div>
        )}

        {!collectionStatus && visibleStatus && (
          <div className="pointer-events-none absolute right-2 top-2">
            <div className="gk-status-pill !static">{getMediaStatusLabel(visibleStatus)}</div>
          </div>
        )}

        {actions && (
          <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100" data-no-swipe="true">
            {actions}
          </div>
        )}
      </div>

      <div className="mt-2 min-w-0 px-0.5">
        <h3 className="line-clamp-2 text-[13px] font-bold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
          {title}
        </h3>
        {showMetaRow ? (
          <MediaMetaRow className="mt-2" type={type} status={status} year={year} score={score} progress={progress} />
        ) : (year || meta) && (
          <p className="mt-1 truncate font-mono-data text-[11px] text-[var(--text-muted)]">
            {[year, meta].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </>
  )
}

export function PosterCard({
  title,
  type,
  coverImage,
  year,
  meta,
  score,
  status,
  progress,
  showMetaRow = false,
  isInCollection = false,
  isWishlisted = false,
  actions,
  onClick,
  className = '',
  imageClassName = '',
  priority = false,
}: PosterCardProps) {
  const classes = `group relative min-w-0 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${onClick ? 'cursor-pointer' : ''} ${className}`
  const style = getMediaTypeAccentStyle(type)
  const content = (
    <PosterCardContent
      title={title}
      type={type}
      coverImage={coverImage}
      year={year}
      meta={meta}
      score={score}
      status={status}
      progress={progress}
      showMetaRow={showMetaRow}
      isInCollection={isInCollection}
      isWishlisted={isWishlisted}
      actions={actions}
      imageClassName={imageClassName}
      priority={priority}
    />
  )

  if (onClick) {
    return (
      <button
        type="button"
        data-no-swipe="true"
        className={classes}
        onClick={(event) => { event.stopPropagation(); onClick() }}
        onPointerDown={event => event.stopPropagation()}
        style={style}
        aria-label={`Apri ${title}`}
      >
        {content}
      </button>
    )
  }

  return (
    <article data-no-swipe="true" className={classes} style={style}>
      {content}
    </article>
  )
}
