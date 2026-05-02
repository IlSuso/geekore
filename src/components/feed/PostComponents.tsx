'use client'

import { useEffect, useRef, useState, memo } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { ImageIcon, Star, X } from 'lucide-react'
import { ReportButton } from '@/components/ui/ReportButton'
import { FeedActionBar } from '@/components/ui/FeedActionBar'
import { PostSignalBadge } from '@/components/ui/PostSignalBadge'
import { FeedPostHeader } from '@/components/feed/FeedPostHeader'
import { FeedCommentRow } from '@/components/feed/FeedCommentRow'
import { FeedCommentComposer } from '@/components/feed/FeedCommentComposer'
import { FeedEngagementSummary } from '@/components/feed/FeedEngagementSummary'
import { androidBack } from '@/hooks/androidBack'
import { CategoryBadge, CategoryIcon, parseCategoryString } from '@/components/feed/CategoryBasics'
import type { FeedMediaPreview, Post } from '@/components/feed/feedTypes'

const VIRTUAL_MARGIN = '600px'

export const VirtualPostCard = memo(function VirtualPostCard({
  index, alwaysMounted, children,
}: { index: number; alwaysMounted: boolean; children: React.ReactNode }) {
  const wrapRef   = useRef<HTMLDivElement>(null)
  const heightRef = useRef<number>(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (alwaysMounted) return
    const el = wrapRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
        } else {
          heightRef.current = el.getBoundingClientRect().height || heightRef.current
          setVisible(false)
        }
      },
      { rootMargin: VIRTUAL_MARGIN, threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [alwaysMounted])

  return (
    <div ref={wrapRef} style={!visible && heightRef.current ? { height: heightRef.current } : undefined}>
      {(visible || alwaysMounted) ? children : null}
    </div>
  )
})

export type BottomSheetAction = {
  label: string
  onClick: () => void
  danger?: boolean
}

export function BottomSheet({
  open, title, actions, onClose,
}: {
  open: boolean
  title?: string
  actions: BottomSheetAction[]
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    androidBack.push(onClose)
    return () => androidBack.pop(onClose)
  }, [open, onClose])

  if (!open || !mounted) return null

  const content = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div className="hidden md:flex items-center justify-center h-full">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
          {title && <div className="px-6 py-4 border-b border-[var(--border)]"><p className="text-[var(--text-muted)] text-xs text-center leading-relaxed">{title}</p></div>}
          {actions.map((action, i) => (
            <button key={i} onClick={() => { action.onClick() }}
              className={`w-full py-4 font-semibold text-[15px] transition-colors border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)] ${action.danger ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
              {action.label}
            </button>
          ))}
          <button onClick={onClose} className="w-full py-4 text-[var(--text-primary)] text-[15px] font-normal hover:bg-[var(--bg-card-hover)] transition-colors border-t border-[var(--border)]">Annulla</button>
        </div>
      </div>

      <div className="md:hidden flex items-end justify-center h-full">
        <div className="w-full max-w-sm mb-4 mx-4" onClick={e => e.stopPropagation()}>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden mb-2">
            {title && <div className="px-4 py-3 border-b border-[var(--border)]"><p className="text-[var(--text-muted)] text-xs text-center leading-relaxed">{title}</p></div>}
            {actions.map((action, i) => (
              <button key={i} onClick={() => { action.onClick() }}
                className={`w-full py-4 font-semibold text-[15px] border-b border-[var(--border-subtle)] last:border-0 active:bg-[var(--bg-card-hover)] ${action.danger ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
                {action.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl py-4 text-[var(--text-primary)] font-semibold text-[15px] active:bg-[var(--bg-card-hover)]">Annulla</button>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

function FeedActivityContext({
  category,
  media,
  onCategoryClick,
}: {
  category: string
  media?: FeedMediaPreview | null
  onCategoryClick?: (category: string) => void
}) {
  const parsed = parseCategoryString(category)
  if (!parsed) return null

  const mediaTitle = media?.title || parsed.subcategory?.trim() || parsed.category
  const progressLabel = media?.current_episode != null && media?.episodes
    ? `${media.current_episode}/${media.episodes}`
    : media?.current_episode != null
    ? `${media.current_episode}`
    : null

  return (
    <button
      type="button"
      onClick={onCategoryClick ? () => onCategoryClick(category) : undefined}
      className="mx-5 mb-3 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.012))] p-3 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
    >
      <div className="h-[74px] w-[50px] flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
        {media?.cover_image ? (
          <img src={media.cover_image} alt={`Copertina di ${mediaTitle}`} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
            <ImageIcon size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="gk-label text-[var(--text-muted)]">Activity</span>
          <CategoryBadge category={parsed.category} />
        </div>
        <p className="line-clamp-1 text-[15px] font-bold leading-tight text-[var(--text-primary)]">
          {mediaTitle}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          {media?.status && <span className="gk-mono rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--text-secondary)]">{media.status}</span>}
          {progressLabel && <span className="gk-mono text-[var(--text-muted)]">{progressLabel}</span>}
          {media?.rating != null && (
            <span className="inline-flex items-center gap-1 font-mono-data text-[11px] font-bold text-[var(--text-primary)]">
              <Star size={11} className="text-[var(--accent)]" fill="var(--accent)" />
              {media.rating}
            </span>
          )}
        </div>
      </div>
      <div className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] sm:flex">
        <CategoryIcon category={parsed.category} size={18} className="text-[var(--accent)]" />
      </div>
    </button>
  )
}

export const PostCard = memo(function PostCard({
  post, currentUser, isLiking, locale,
  onLike, onOpenModal, onPostOptions, onCategoryClick,
}: {
  post: Post
  currentUser: User | null
  isLiking: boolean
  locale: string
  onLike: (id: string) => void
  onOpenModal: (id: string) => void
  onPostOptions: (postId: string) => void
  onCategoryClick?: (category: string) => void
}) {
  const sharePost = async () => {
    const url = `${window.location.origin}/home?post=${post.id}`
    if (navigator.share) {
      await navigator.share({ title: 'Geekore', text: post.content.slice(0, 80), url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(url).catch(() => {})
    }
  }

  return (
    <div className={`rounded-2xl transition-all duration-300 animate-fade-in ${
      post.pinned ? 'bg-[var(--bg-card)] border border-[var(--border)] ring-1 ring-[rgba(230,255,61,0.16)]'
      : post.isDiscovery ? 'bg-[var(--bg-card)] border border-[rgba(167,139,250,0.28)] ring-1 ring-[rgba(167,139,250,0.10)]'
      : 'bg-[var(--bg-card)] border border-[var(--border)]'
    }`}>

      {post.pinned && (
        <div className="px-5 pt-4 pb-1">
          <PostSignalBadge type="pinned" />
        </div>
      )}
      {post.isDiscovery && !post.pinned && (
        <div className="px-5 pt-4 pb-1">
          <PostSignalBadge type="discovery" />
        </div>
      )}

      <div className="px-5 pt-4 pb-2.5">
        <FeedPostHeader
          post={post}
          locale={locale}
          currentUserId={currentUser?.id}
          onPostOptions={onPostOptions}
        />
      </div>

      <div className="px-5 pb-3">
        <p className="text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap">{post.content.replace(/\n{3,}/g, '\n\n')}</p>
        {post.is_edited && (
          <p className="text-[11px] text-[var(--text-muted)] mt-1">modificato</p>
        )}
      </div>

      {post.category && (
        <FeedActivityContext category={post.category} media={post.media_preview} onCategoryClick={onCategoryClick} />
      )}

      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="mx-5 mb-4 rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
          <img src={post.image_url} alt={`Post di ${post.profiles.username}`}
            className="w-full max-h-[420px] object-cover hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
            decoding="async" />
        </div>
      )}

      <FeedActionBar
        liked={post.liked_by_user}
        likesCount={post.likes_count}
        commentsCount={post.comments_count}
        isLiking={isLiking}
        onLike={() => onLike(post.id)}
        onComments={() => onOpenModal(post.id)}
        onShare={sharePost}
        reportSlot={currentUser && currentUser.id !== post.user_id ? (
          <ReportButton targetType="post" targetId={post.id} iconOnly />
        ) : undefined}
      />
    </div>
  )
})

export function PostModal({
  post, currentUser, currentProfile, onClose, onLike, onAddComment, onCommentOptions, isLiking, locale,
}: {
  post: Post
  currentUser: User | null
  currentProfile: any
  onClose: () => void
  onLike: (id: string) => void
  onAddComment: (postId: string, content: string) => void
  onCommentOptions: (commentId: string, postId: string) => void
  isLiking: boolean
  locale: string
}) {
  const [commentText, setCommentText] = useState('')

  const submitComment = () => {
    if (!commentText.trim()) return
    onAddComment(post.id, commentText.trim())
    setCommentText('')
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      data-no-swipe
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] flex-shrink-0">
          <h3 className="font-semibold text-[var(--text-primary)] text-[15px]">Post</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--bg-card-hover)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {post.pinned && (
            <div className="px-5 pt-4 pb-1">
              <PostSignalBadge type="pinned" />
            </div>
          )}
          {post.isDiscovery && !post.pinned && (
            <div className="px-5 pt-4 pb-1">
              <PostSignalBadge type="discovery" />
            </div>
          )}

          <div className="px-5 pt-4 pb-2.5">
            <FeedPostHeader
              post={post}
              locale={locale}
              currentUserId={currentUser?.id}
              onProfileClick={onClose}
              showPostType
            />
          </div>

          <div className="px-5 pb-3">
            <p className="text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap">{post.content.replace(/\n{3,}/g, '\n\n')}</p>
            {post.is_edited && <p className="text-[11px] text-[var(--text-muted)] mt-1">modificato</p>}
          </div>

          {post.category && (
            <FeedActivityContext category={post.category} media={post.media_preview} />
          )}

          {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
            <div className="mx-5 mb-4 rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
              <img src={post.image_url} alt={`Post di ${post.profiles.username}`}
                className="w-full max-h-[320px] object-cover" loading="lazy"
                decoding="async" />
            </div>
          )}

          <FeedEngagementSummary
            liked={post.liked_by_user}
            likesCount={post.likes_count}
            commentsCount={post.comments_count}
            isLiking={isLiking}
            onLike={() => onLike(post.id)}
          />

          {post.comments.length > 0 ? (
            <>
              <div className="h-px bg-[var(--border-subtle)] mx-5" />
              <div className="px-5 py-3 space-y-4">
                {post.comments.map(comment => (
                  <FeedCommentRow
                    key={comment.id}
                    comment={comment}
                    locale={locale}
                    currentUserId={currentUser?.id}
                    onClose={onClose}
                    onOptions={(commentId) => onCommentOptions(commentId, post.id)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">Nessun commento ancora. Sii il primo!</p>
            </div>
          )}
        </div>

        {currentUser && (
          <FeedCommentComposer
            value={commentText}
            onChange={setCommentText}
            onSubmit={submitComment}
            profile={currentProfile}
          />
        )}
      </div>
    </div>
  )
}
