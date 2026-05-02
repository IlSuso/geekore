import type { ReactNode } from 'react'
import { BookmarkCheck, Check, Film, Plus } from 'lucide-react'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'

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
  return (
    <div className={`group relative min-w-0 cursor-pointer ${className}`} onClick={onClick}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
        {coverImage ? (
          <img
            src={coverImage}
            alt={`Copertina di ${title}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
            {placeholderIcon || <Film size={28} />}
          </div>
        )}

        {(added || wishlisted) && (
          <div className="absolute right-1.5 top-1.5 z-10">
            {added ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--accent)] shadow-sm">
                <Check size={9} className="text-[#0B0B0F]" strokeWidth={2.5} />
              </div>
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-md border border-[rgba(230,255,61,0.5)] bg-black/70 shadow-sm backdrop-blur-sm">
                <BookmarkCheck size={9} className="text-[var(--accent)]" />
              </div>
            )}
          </div>
        )}

        {onWishlist && !added && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onWishlist()
            }}
            className="absolute right-1.5 bottom-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-[var(--accent)] group-hover:opacity-100"
            aria-label={wishlisted ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist'}
          >
            {wishlisted ? <BookmarkCheck size={14} /> : <Plus size={15} />}
          </button>
        )}
      </div>

      <div className="mt-1.5 min-w-0 px-0.5">
        <p className="line-clamp-2 text-[12px] font-semibold leading-tight text-[var(--text-primary)]">
          {title}
        </p>
        <MediaMetaRow
          className="mt-1"
          type={type}
          year={year}
          score={score}
        />
      </div>
    </div>
  )
}
