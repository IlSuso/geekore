import type { ReactNode } from 'react'
import { BookmarkCheck, Check, Film, Plus, Star } from 'lucide-react'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { getMediaStatusLabel } from '@/lib/mediaStatus'
import { getMediaTypeColor } from '@/lib/mediaTypes'

interface DiscoverMediaCardProps {
  title: string
  type?: string | null
  coverImage?: string | null
  year?: number | string | null
  score?: number | string | null
  added?: boolean
  wishlisted?: boolean
  placeholderIcon?: ReactNode
  onClick?: () => void
  onWishlist?: () => void
  className?: string
}

export function DiscoverMediaCard({
  title,
  type,
  coverImage,
  year,
  score,
  added = false,
  wishlisted = false,
  placeholderIcon,
  onClick,
  onWishlist,
  className = '',
}: DiscoverMediaCardProps) {
  const hasState = added || wishlisted
  const Wrapper = onClick ? 'button' : 'div'
  const typeColor = getMediaTypeColor(type)

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      data-no-swipe="true"
      className={`group relative min-w-0 cursor-pointer text-left ${className}`}
      onClick={onClick}
      aria-label={onClick ? `Apri dettagli di ${title}` : undefined}
    >
      <div
        className="gk-poster-first relative aspect-[2/3] overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[0_10px_34px_rgba(0,0,0,0.22)]"
        style={{ boxShadow: `0 10px 34px rgba(0,0,0,0.22), inset 0 -3px 0 ${typeColor}` }}
      >
        {coverImage ? (
          <img
            src={coverImage}
            alt={`Copertina di ${title}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="gk-cover-placeholder h-full w-full"
            style={{ ['--gk-type' as string]: typeColor }}
          >
            <span className="line-clamp-5">{title}</span>
            <span className="sr-only">{placeholderIcon || <Film size={28} />}</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-white/10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

        {type && (
          <div className="absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-3rem)]">
            <MediaTypeBadge type={type} size="xs" />
          </div>
        )}

        {score != null && score !== '' && (
          <div className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/72 px-2 py-1 font-mono-data text-[10px] font-bold text-white backdrop-blur-sm">
            <Star size={10} className="text-[var(--accent)]" fill="var(--accent)" />
            {score}
          </div>
        )}

        {hasState && (
          <div className="absolute right-1.5 top-1.5 z-10">
            {added ? (
              <div className="gk-status-pill !static !bg-[var(--accent)] !text-[#0B0B0F]">
                <Check size={10} strokeWidth={2.5} />
                {getMediaStatusLabel('completed')}
              </div>
            ) : (
              <div className="gk-status-pill !static">
                <BookmarkCheck size={10} />
                Wishlist
              </div>
            )}
          </div>
        )}

        {onWishlist && !added && (
          <button
            type="button"
            data-no-swipe="true"
            onClick={event => {
              event.stopPropagation()
              onWishlist()
            }}
            className={`absolute bottom-1.5 right-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-xl border shadow-sm backdrop-blur-sm transition-all hover:scale-105 ${
              wishlisted
                ? 'border-[rgba(230,255,61,0.5)] bg-black/75 text-[var(--accent)]'
                : 'border-white/10 bg-black/70 text-white hover:text-[var(--accent)]'
            }`}
            aria-label={wishlisted ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist'}
          >
            {wishlisted ? <BookmarkCheck size={15} /> : <Plus size={16} />}
          </button>
        )}
      </div>

      <div className="mt-2 min-w-0 px-0.5">
        <p className="line-clamp-2 text-[13px] font-bold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
          {title}
        </p>
        <MediaMetaRow
          dense
          className="mt-1"
          year={year}
        />
      </div>
    </Wrapper>
  )
}
