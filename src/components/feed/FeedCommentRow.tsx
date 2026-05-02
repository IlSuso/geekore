import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale/it'
import { enUS } from 'date-fns/locale/en-US'
import { MoreHorizontal } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import type { Comment } from '@/components/feed/feedTypes'

interface FeedCommentRowProps {
  comment: Comment
  locale: string
  currentUserId?: string | null
  onClose?: () => void
  onOptions?: (commentId: string) => void
}

export function FeedCommentRow({
  comment,
  locale,
  currentUserId,
  onClose,
  onOptions,
}: FeedCommentRowProps) {
  const canManage = currentUserId === comment.user_id && !!onOptions

  return (
    <div className="flex items-start gap-3 group/mc">
      <Link href={`/profile/${comment.username}`} onClick={onClose} className="shrink-0">
        <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-[var(--border)]">
          <Avatar
            src={undefined}
            username={comment.username || 'user'}
            displayName={comment.display_name}
            size={32}
            className="rounded-full"
          />
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">
          <Link
            href={`/profile/${comment.username}`}
            onClick={onClose}
            className="mr-1 font-semibold text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
          >
            {comment.username}
          </Link>
          <span className="text-[var(--text-secondary)]">{comment.content}</span>
        </p>
        <p className="gk-mono mt-0.5 text-[var(--text-muted)]">
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
        </p>
      </div>

      {canManage && (
        <button
          onClick={() => onOptions(comment.id)}
          aria-label="Opzioni commento"
          className="mt-0.5 shrink-0 text-[var(--text-muted)] opacity-0 transition-all hover:text-[var(--text-primary)] group-hover/mc:opacity-100"
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
