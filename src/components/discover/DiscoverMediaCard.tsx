import type { ReactNode } from 'react'
import { BookmarkCheck, Check, Film, Plus } from 'lucide-react'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'
import { MediaCover } from '@/components/ui/MediaCover'
import { getMediaStatusLabel } from '@/lib/mediaStatus'

interface DiscoverMediaCardProps {
  title: string
  type?: string | null
  coverImage?: string | null
  year?: number | string | null
  score?: number | string | null
  match?: number | string | null
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
  match,
  added = false,
  wishlisted = false,
  placeholderIcon,
  onClick,
  onWishlist,
  className = '',
}: DiscoverMediaCardProps) {
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      data-no-swipe="true"
      className={`group relative min-w-0 cursor-pointer text-left ${className}`}
      onClick={onClick}
      aria-label={onClick ? `Apri dettagli di ${title}` : undefined}
    >
      <div className="relative">
        <MediaCover
          src={coverImage}
          alt={`Copertina di ${title}`}
          type={type}
          score={score}
          match={match}
          completed={added}
          fallback={placeholderIcon || <Film size={28} />}
          className="transition-transform duration-300 group-hover:scale-[1.015]"
        />

        {(added || wishlisted) && (
          <div className="absolute right-1.5 top-1.5 z-20">
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
            className={`absolute bottom-1.5 right-1.5 z-20 flex h-9 w-9 items-center justify-center rounded-[14px] border shadow-sm backdrop-blur-sm transition-all hover:scale-105 ${
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
        <MediaMetaRow dense className="mt-1" year={year} />
      </div>
    </Wrapper>
  )
}
