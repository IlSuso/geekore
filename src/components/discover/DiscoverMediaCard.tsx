import type { KeyboardEvent, ReactNode } from 'react'
import { BookmarkCheck, Check, Film, Plus } from 'lucide-react'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'
import { MediaCover } from '@/components/ui/MediaCover'
import { getMediaStatusLabel } from '@/lib/mediaStatus'
import { useLocale } from '@/lib/locale'

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

function hasRealScore(score?: number | string | null): boolean {
  if (score == null || score === '') return false
  const numeric = typeof score === 'string' ? Number(score) : score
  if (Number.isNaN(numeric)) return true
  return numeric > 0
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
  const { locale } = useLocale()
  const copy = locale === 'en' ? { openDetails: (title: string) => `Open details for ${title}`, coverAlt: (title: string) => `Cover for ${title}`, removeWishlist: 'Remove from wishlist', addWishlist: 'Add to wishlist', wishlist: 'Wishlist' } : { openDetails: (title: string) => `Apri dettagli di ${title}`, coverAlt: (title: string) => `Copertina di ${title}`, removeWishlist: 'Rimuovi dalla wishlist', addWishlist: 'Aggiungi alla wishlist', wishlist: 'Wishlist' }
  const visibleScore = hasRealScore(score) ? score : null
  const isInteractive = Boolean(onClick)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <div
      data-no-swipe="true"
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      className={`group relative min-w-0 ${isInteractive ? 'cursor-pointer' : ''} text-left ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={isInteractive ? copy.openDetails(title) : undefined}
    >
      <div className="relative">
        <MediaCover
          src={coverImage}
          alt={copy.coverAlt(title)}
          type={type}
          score={visibleScore}
          match={match}
          completed={added}
          fallback={placeholderIcon || <Film size={28} />}
          className="transition-transform duration-300 group-hover:scale-[1.015]"
        />

        {(added || wishlisted) && (
          <div className="absolute right-1.5 top-1.5 z-20">
            {added ? (
              <div className="gk-status-pill !static !bg-[var(--accent)] !px-2 !py-1 !text-[#0B0B0F]">
                <Check size={10} strokeWidth={2.5} />
                {getMediaStatusLabel('completed')}
              </div>
            ) : (
              <div className="gk-status-pill !static !px-2 !py-1">
                <BookmarkCheck size={10} />
                {copy.wishlist}
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
            className={`absolute bottom-1.5 right-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-[13px] border shadow-sm backdrop-blur-sm transition-all hover:scale-105 ${
              wishlisted
                ? 'border-[rgba(230,255,61,0.5)] bg-black/75 text-[var(--accent)]'
                : 'border-white/10 bg-black/62 text-white hover:text-[var(--accent)]'
            }`}
            aria-label={wishlisted ? copy.removeWishlist : copy.addWishlist}
          >
            {wishlisted ? <BookmarkCheck size={14} /> : <Plus size={15} />}
          </button>
        )}
      </div>

      <div className="mt-2 min-w-0 px-0.5">
        <p className="line-clamp-2 text-[13px] font-bold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
          {title}
        </p>
        <MediaMetaRow dense className="mt-1" year={year} score={visibleScore} />
      </div>
    </div>
  )
}
