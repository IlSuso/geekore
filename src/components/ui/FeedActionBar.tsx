'use client'

import { Flame, MessageCircle, Link2, Bookmark } from 'lucide-react'
import { useLocale } from '@/lib/locale'

interface FeedActionBarProps {
  liked?: boolean
  likesCount?: number
  commentsCount?: number
  isLiking?: boolean
  canReport?: boolean
  reportSlot?: React.ReactNode
  onLike?: () => void
  onComments?: () => void
  onShare?: () => void
  className?: string
}

export function FeedActionBar({
  liked = false,
  likesCount = 0,
  commentsCount = 0,
  isLiking = false,
  reportSlot,
  onLike,
  onComments,
  onShare,
  className = '',
}: FeedActionBarProps) {
  const { locale } = useLocale()
  const copy = locale === 'en'
    ? { removeLike: 'Remove like', addLike: 'Like', comments: 'View comments', share: 'Share post', save: 'Save post' }
    : { removeLike: 'Rimuovi like', addLike: 'Metti like', comments: 'Vedi commenti', share: 'Condividi post', save: 'Salva post' }

  return (
    <div className={`gk-feed-card-actions border-t border-[var(--border-soft)] px-3 py-2.5 ${className}`}>
      <button
        type="button"
        data-no-swipe="true"
        onClick={onLike}
        aria-label={liked ? copy.removeLike : copy.addLike}
        className="group inline-flex h-11 min-w-11 items-center gap-1.5 rounded-[14px] px-2.5 text-[var(--text-muted)] transition-all hover:bg-orange-500/10 hover:text-orange-400 active:scale-[0.97]"
        style={liked ? { color: '#f97316', background: 'rgba(249,115,22,0.10)' } : undefined}
      >
        <Flame size={18} className={`transition-transform ${liked ? 'fill-orange-500' : ''} ${isLiking ? 'animate-heart-burst' : ''}`} />
        <span className="font-mono-data text-xs font-black">{likesCount}</span>
      </button>

      <button
        type="button"
        data-no-swipe="true"
        onClick={onComments}
        aria-label={copy.comments}
        className="group inline-flex h-11 min-w-11 items-center gap-1.5 rounded-[14px] px-2.5 text-[var(--text-muted)] transition-all hover:bg-[rgba(230,255,61,0.08)] hover:text-[var(--accent)] active:scale-[0.97]"
      >
        <MessageCircle size={18} />
        <span className="font-mono-data text-xs font-black">{commentsCount}</span>
      </button>

      <button
        type="button"
        data-no-swipe="true"
        onClick={onShare}
        aria-label={copy.share}
        className="group inline-flex h-11 min-w-11 items-center gap-1.5 rounded-[14px] px-2.5 text-[var(--text-muted)] transition-all hover:bg-[rgba(230,255,61,0.08)] hover:text-[var(--accent)] active:scale-[0.97]"
      >
        <Link2 size={17} aria-hidden="true" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        {reportSlot}
        <button
          type="button"
          data-no-swipe="true"
          aria-label={copy.save}
          className="group inline-flex h-11 min-w-11 items-center justify-center rounded-[14px] text-[var(--text-muted)] transition-all hover:bg-[rgba(230,255,61,0.08)] hover:text-[var(--accent)] active:scale-[0.97]"
        >
          <Bookmark size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
