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
        className="group shrink-0"
        onClick={event => {
          event.stopPropagation()
          onProfileClick?.()
        }}
      >
        <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-zinc-600/20 group-hover:ring-zinc-600/50 transition-all">
          <Avatar
            src={post.profiles.avatar_url}
            username={post.profiles.username}
            displayName={post.profiles.display_name}
            size={40}
            className="rounded-full"
          />
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/profile/${post.profiles.username}`}
          className="hover:text-[var(--accent)] transition-colors"
          onClick={event => {
            event.stopPropagation()
            onProfileClick?.()
          }}
        >
          <p className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            <UserBadge badge={post.profiles.badge} displayName={post.profiles.display_name || post.profiles.username} />
          </p>
        </Link>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-xs text-[var(--text-muted)]">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
          </p>
          {showPostType && <PostTypeBadge type={postType} />}
        </div>
      </div>

      {currentUserId === post.user_id && onPostOptions && (
        <button
          onClick={() => onPostOptions(post.id)}
          className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
          aria-label="Opzioni post"
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
