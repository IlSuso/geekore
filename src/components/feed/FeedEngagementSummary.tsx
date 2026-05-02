import { Flame, MessageCircle } from 'lucide-react'

interface FeedEngagementSummaryProps {
  liked?: boolean
  likesCount?: number
  commentsCount?: number
  isLiking?: boolean
  onLike?: () => void
  className?: string
}

export function FeedEngagementSummary({
  liked = false,
  likesCount = 0,
  commentsCount = 0,
  isLiking = false,
  onLike,
  className = '',
}: FeedEngagementSummaryProps) {
  return (
    <div className={`flex items-center gap-6 border-t border-[var(--border-subtle)] px-5 py-2.5 ${className}`}>
      <button
        type="button"
        onClick={onLike}
        aria-label={liked ? 'Rimuovi like' : 'Metti like'}
        className={`group flex items-center gap-2 transition-all ${liked ? 'text-orange-500' : 'text-[var(--text-muted)] hover:text-orange-400'}`}
      >
        <div className={`rounded-xl p-1.5 transition-colors ${liked ? 'bg-orange-500/15' : 'group-hover:bg-orange-500/10'}`}>
          <Flame
            size={19}
            className={`transition-transform ${liked ? 'fill-orange-500' : ''} ${isLiking ? 'animate-heart-burst' : ''}`}
          />
        </div>
        <span className="text-xs font-bold">{likesCount}</span>
      </button>

      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <MessageCircle size={17} />
        <span className="text-xs font-bold">{commentsCount}</span>
      </div>
    </div>
  )
}
