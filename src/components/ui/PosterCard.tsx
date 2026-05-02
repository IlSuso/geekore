import type { ReactNode } from 'react'
import { Check, BookmarkCheck, ImageIcon } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { getMediaTypeAccentStyle } from '@/lib/mediaTypes'

interface PosterCardProps {
  title: string
  type?: string | null
  coverImage?: string | null
  year?: number | string | null
  meta?: string | null
  score?: number | string | null
  isInCollection?: boolean
  isWishlisted?: boolean
  actions?: ReactNode
  onClick?: () => void
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function PosterCard({
  title,
  type,
  coverImage,
  year,
  meta,
  score,
  isInCollection = false,
  isWishlisted = false,
  actions,
  onClick,
  className = '',
  imageClassName = '',
  priority = false,
}: PosterCardProps) {
  const hasCover = !!coverImage
  const status = isInCollection ? 'collection' : isWishlisted ? 'wishlist' : null

  return (
    <article
      className={`group relative min-w-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      style={getMediaTypeAccentStyle(type)}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        {hasCover ? (
          <img
            src={coverImage || undefined}
            alt={`Copertina di ${title}`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${imageClassName}`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-3 text-center text-[var(--text-muted)]">
            <ImageIcon size={28} strokeWidth={1.4} />
            <span className="line-clamp-3 text-[12px] font-semibold leading-tight text-[var(--text-secondary)]">
              {title}
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />
        <div className="absolute left-2 top-2">
          <MediaTypeBadge type={type} size="xs" variant="soft" />
        </div>

        {score != null && score !== '' && (
          <div className="absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/70 px-2 py-1 font-mono-data text-[10px] font-bold text-white backdrop-blur-sm">
            {score}
          </div>
        )}

        {status && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg shadow-lg"
            style={status === 'collection'
              ? { background: 'var(--accent)', color: '#0B0B0F' }
              : { background: 'rgba(0,0,0,0.72)', color: 'var(--accent)', border: '1px solid rgba(230,255,61,0.45)' }}
          >
            {status === 'collection' ? <Check size={12} strokeWidth={2.6} /> : <BookmarkCheck size={12} strokeWidth={2.2} />}
          </div>
        )}

        {actions && (
          <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
            {actions}
          </div>
        )}
      </div>

      <div className="mt-2 min-w-0 px-0.5">
        <h3 className="line-clamp-2 text-[13px] font-bold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
          {title}
        </h3>
        {(year || meta) && (
          <p className="mt-1 truncate font-mono-data text-[11px] text-[var(--text-muted)]">
            {[year, meta].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </article>
  )
}
