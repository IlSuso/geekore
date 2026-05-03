import type { ReactNode } from 'react'
import { BookmarkCheck } from 'lucide-react'
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
  /** Variante più pulita per Library/collection: meno badge duplicati, card più sobria. */
  variant?: 'default' | 'library'
}

function hasRealScore(score?: number | string | null): boolean {
  if (score == null || score === '') return false
  const numeric = typeof score === 'string' ? Number(score) : score
  if (Number.isNaN(numeric)) return true
  return numeric > 0
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
  variant = 'default',
}: Omit<PosterCardProps, 'onClick' | 'className'>) {
  const hasCover = !!coverImage
  const collectionStatus = isInCollection ? 'collection' : isWishlisted ? 'wishlist' : null
  const typeColor = getMediaTypeColor(type)
  const visibleStatus = status || (isInCollection ? 'completed' : isWishlisted ? 'planned' : null)
  const realScore = hasRealScore(score) ? score : null
  const isLibrary = variant === 'library'

  return (
    <>
      <div
        className={`gk-poster-first relative aspect-[2/3] overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] ${isLibrary ? 'rounded-[16px]' : 'rounded-[14px]'}`}
      >
        {hasCover ? (
          <img
            src={coverImage || undefined}
            alt={`Copertina di ${title}`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035] ${imageClassName || ''}`}
          />
        ) : (
          <div className="gk-cover-placeholder h-full w-full" style={{ ['--gk-type' as string]: typeColor }}>
            <span className="line-clamp-5">{title}</span>
          </div>
        )}

        <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/28 to-transparent ${isLibrary ? 'h-20' : 'h-24 opacity-90'}`} />
        <div className="pointer-events-none absolute left-2 top-2">
          <MediaTypeBadge type={type} size="xs" variant="tag" />
        </div>

        {realScore != null && !showMetaRow && (
          <div className="pointer-events-none absolute bottom-2 left-2 font-mono-data text-[9px] font-bold text-white" style={{ background: 'rgba(0,0,0,0.62)', padding: '2px 5px', borderRadius: 999 }}>
            ★ {realScore}
          </div>
        )}

        {!isLibrary && collectionStatus === 'collection' && (
          <div className="pointer-events-none absolute right-1.5 top-1.5" style={{ width: 14, height: 14, borderRadius: '99px', background: 'var(--accent)', color: '#0B0B0F', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800 }}>
            ✓
          </div>
        )}
        {collectionStatus === 'wishlist' && (
          <div className="pointer-events-none absolute right-2 top-2">
            <div className="gk-status-pill !static">
              <BookmarkCheck size={10} strokeWidth={2.2} />
              Wishlist
            </div>
          </div>
        )}

        {!collectionStatus && visibleStatus && !isLibrary && (
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

      <div className={`${isLibrary ? 'mt-2.5' : 'mt-2'} min-w-0 px-0.5`}>
        <h3 className={`${isLibrary ? 'text-[14px]' : 'text-[13px]'} line-clamp-2 font-bold leading-tight tracking-[-0.01em] text-[var(--text-primary)]`}>
          {title}
        </h3>
        {showMetaRow ? (
          <MediaMetaRow className="mt-2" type={type} status={isLibrary ? null : status} year={year} score={realScore} progress={progress} />
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
  variant = 'default',
}: PosterCardProps) {
  const classes = `group relative min-w-0 text-left focus-visible:outline-none ${onClick ? 'cursor-pointer' : ''} ${className}`
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
      variant={variant}
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
