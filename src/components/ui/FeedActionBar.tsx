import { Flame, MessageCircle, Send } from 'lucide-react'

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
  return (
    <div className={`flex items-center gap-6 border-t border-[var(--border-subtle)] px-5 py-2.5 ${className}`}>
      <button
        type="button"
        onClick={onLike}
        aria-label={liked ? 'Rimuovi like' : 'Metti like'}
        className={`group flex items-center gap-2 transition-all ${liked ? 'text-orange-500' : 'text-[var(--text-muted)] hover:text-orange-400'}`}
      >
        <div className={`rounded-xl p-1.5 transition-colors ${liked ? 'bg-orange-500/15' : 'group-hover:bg-orange-500/10'}`}>
          <Flame size={19} className={`transition-transform ${liked ? 'fill-orange-500' : ''} ${isLiking ? 'animate-heart-burst' : ''}`} />
        </div>
        <span className="text-xs font-bold">{likesCount}</span>
      </button>

      <button
        type="button"
        onClick={onComments}
        aria-label="Vedi commenti"
        className="group flex items-center gap-2 text-[var(--text-muted)] transition-all hover:text-[var(--accent)]"
      >
        <div className="rounded-xl p-1.5 transition-colors group-hover:bg-[var(--bg-card-hover)]">
          <MessageCircle size={19} />
        </div>
        <span className="text-xs font-bold">{commentsCount}</span>
      </button>

      {reportSlot && <div className="ml-auto">{reportSlot}</div>}

      <button
        type="button"
        onClick={onShare}
        aria-label="Condividi post"
        className={`group flex items-center gap-2 text-[var(--text-muted)] transition-all hover:text-[var(--accent)] ${reportSlot ? '' : 'ml-auto'}`}
      >
        <div className="rounded-xl p-1.5 transition-colors group-hover:bg-[var(--bg-card-hover)]">
          <Send size={18} aria-hidden="true" />
        </div>
      </button>
    </div>
  )
}
