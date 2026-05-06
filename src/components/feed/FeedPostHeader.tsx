import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale/it'
import { enUS } from 'date-fns/locale/en-US'
import { MoreHorizontal } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { PostTypeBadge } from '@/components/ui/PostTypeBadge'
import { UserBadge } from '@/components/ui/UserBadge'
import type { Post } from '@/components/feed/feedTypes'

interface FeedPostHeaderProps {
  post: Post
  locale: string
  currentUserId?: string | null
  onPostOptions?: (postId: string) => void
  onProfileClick?: () => void
  showPostType?: boolean
}

export function FeedPostHeader({
  post,
  locale,
  currentUserId,
  onPostOptions,
  onProfileClick,
  showPostType = true,
}: FeedPostHeaderProps) {
  const postType = post.category ? 'activity' : 'discussion'

  return (
    <div className="flex items-start gap-3">
      <Link
        href={`/profile/${post.profiles.username}`}
        data-no-swipe="true"
        className="group shrink-0"
        onClick={event => {
          event.stopPropagation()
          onProfileClick?.()
        }}
      >
        <div className="h-10 w-10 overflow-hidden rounded-2xl ring-1 ring-white/10 transition-all group-hover:ring-[rgba(230,255,61,0.35)]">
          <Avatar
            src={post.profiles.avatar_url}
            username={post.profiles.username}
            displayName={post.profiles.display_name}
            size={40}
            className="rounded-2xl"
          />
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/profile/${post.profiles.username}`}
          data-no-swipe="true"
          className="transition-colors hover:text-[var(--accent)]"
          onClick={event => {
            event.stopPropagation()
            onProfileClick?.()
          }}
        >
          <p className="text-[15px] font-black leading-tight text-[var(--text-primary)]">
            <UserBadge badge={post.profiles.badge} displayName={post.profiles.display_name || post.profiles.username} />
          </p>
        </Link>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
          <p className="gk-mono text-[var(--text-muted)]">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
          </p>
        </div>
      </div>

      {currentUserId === post.user_id && onPostOptions && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={() => onPostOptions(post.id)}
          className="rounded-2xl p-2 text-[var(--text-muted)] transition-all hover:bg-[var(--bg-card-hover)] hover:text-white"
          aria-label={locale === 'en' ? 'Post options' : 'Opzioni post'}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
