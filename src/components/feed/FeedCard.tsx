"use client"
// src/components/feed/FeedCard.tsx
// C5: Componente unificato — rimpiazza sia FeedCard.tsx che PostCard inline in feed/page.tsx
// M6: locale dinamica via useLocale() invece di { it } hardcoded
// A6: fix locale lazy import

import React, { useState, useEffect, memo } from 'react'
import { Flame, MessageSquare, Send, Loader2, Pin, Trash2 } from 'lucide-react'
import { UserBadge } from '@/components/ui/UserBadge'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ReportButton } from '@/components/ui/ReportButton'
import { Avatar } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'
import { optimizeImage } from '@/lib/imageOptimizer'

// PERF FIX #5: singleton — evita 20 dynamic import paralleli per 20 card
import type { Locale } from 'date-fns'
let _cachedLocale: { key: string; mod: Locale | null } = { key: '', mod: null }
async function getDateLocale(locale: string): Promise<Locale> {
  if (_cachedLocale.key === locale && _cachedLocale.mod) return _cachedLocale.mod
  const mod: Locale = locale === 'en'
    ? (await import('date-fns/locale/en-US')).enUS
    : (await import('date-fns/locale/it')).it
  _cachedLocale = { key: locale, mod }
  return mod
}

function haptic(duration: number | number[] = 30) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(duration)
  }
}

export interface PostProfile {
  username: string
  display_name?: string | null
  avatar_url?: string | null
  badge?: string | null
}

export interface PostComment {
  id: string
  content: string
  created_at: string
  user_id: string
  profiles?: PostProfile | null
}

export interface PostLike {
  id?: string
  user_id: string
}

export interface FeedPost {
  id: string
  content: string
  image_url?: string | null
  created_at: string
  user_id?: string
  pinned?: boolean
  liked_by_user?: boolean
  likes_count?: number
  profiles?: PostProfile | PostProfile[] | null
  likes?: PostLike[]
  comments?: PostComment[]
}

export interface FeedCardProps {
  post: FeedPost
  onLikeChange?: (postId: string, delta: number) => void
  /** PERF FIX #4: passa userId dal parent — evita getUser()+onAuthStateChange per ogni card */
  currentUserId?: string | null
}

export const FeedCard = memo(function FeedCard({ post, onLikeChange, currentUserId }: FeedCardProps): React.ReactElement {
  const supabase = createClient()
  const { locale } = useLocale()
  const copy = locale === 'en' ? {
    pinned: 'Pinned',
    userFallback: 'User',
    postImageAlt: (username: string) => `Post image by ${username}`,
    removeLike: 'Remove like',
    addLike: 'Like',
    hideComments: 'Hide comments',
    showComments: 'Show comments',
    deleteComment: 'Delete comment',
    commentPlaceholder: 'Write a comment...',
  } : {
    pinned: 'In evidenza',
    userFallback: 'Utente',
    postImageAlt: (username: string) => `Immagine del post di ${username}`,
    removeLike: 'Rimuovi like',
    addLike: 'Metti like',
    hideComments: 'Nascondi commenti',
    showComments: 'Mostra commenti',
    deleteComment: 'Elimina commento',
    commentPlaceholder: 'Scrivi un commento...',
  }

  const profile: PostProfile | null = Array.isArray(post.profiles)
    ? (post.profiles[0] ?? null)
    : (post.profiles ?? null)

  const [likesCount, setLikesCount] = useState<number>(post.likes_count ?? post.likes?.length ?? 0)
  const [hasLiked, setHasLiked] = useState(post.liked_by_user ?? false)
  const [likeAnimating, setLikeAnimating] = useState(false)
  // PERF FIX #4: user deriva da prop currentUserId — nessun auth listener per-card
  const [user, setUser] = useState<{ id: string } | null>(currentUserId ? { id: currentUserId } : null)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>((post.comments as PostComment[]) || [])
  const [commentsFetched, setCommentsFetched] = useState((post.comments?.length ?? 0) > 0)
  const [newComment, setNewComment] = useState('')
  const [commentCharCount, setCommentCharCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timeAgo, setTimeAgo] = useState('')

  const MAX_COMMENT_LENGTH = 500

  // PERF FIX #4: nessun auth listener per-card. currentUserId passato dal parent.
  // Fallback: se la prop non arriva (uso standalone), carica una sola volta senza listener.
  useEffect(() => {
    if (currentUserId !== undefined) return // già gestito dalla prop
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user && post.likes) {
        setHasLiked(post.likes.some((l) => l.user_id === user.id))
      }
    })
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!post.created_at) return
    let cancelled = false
    getDateLocale(locale).then(dateLocale => {
      if (cancelled) return
      setTimeAgo(formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: dateLocale }))
    })
    return () => { cancelled = true }
  }, [post.created_at, locale])

  const handleLike = async () => {
    if (!user) return

    setLikeAnimating(true)
    haptic(hasLiked ? 20 : [40, 20, 40])
    setTimeout(() => setLikeAnimating(false), 400)

    if (hasLiked) {
      setHasLiked(false)
      setLikesCount(prev => prev - 1)
      onLikeChange?.(post.id, -1)
      await fetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, action: 'unlike' }),
      }).catch(() => {})
    } else {
      setHasLiked(true)
      setLikesCount(prev => prev + 1)
      onLikeChange?.(post.id, 1)
      await fetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, action: 'like' }),
      }).catch(() => {})
    }
  }

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id, profiles(username, display_name, avatar_url, badge)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
    if (!error && data) {
      setComments(data as unknown as PostComment[])
      setCommentsFetched(true)
    }
  }

  const handleToggleComments = () => {
    const next = !showComments
    setShowComments(next)
    haptic(20)
    if (next && !commentsFetched) fetchComments()
  }

  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.length <= MAX_COMMENT_LENGTH) {
      setNewComment(val)
      setCommentCharCount(val.length)
    }
  }

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !user) return
    setIsSubmitting(true)
    haptic(30)

    const res = await fetch('/api/social/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: post.id, content: newComment.trim() }),
    }).catch(() => null)

    if (res?.ok) {
      const data = await res.json()
      if (data?.comment) {
        setComments(prev => [...prev, data.comment])
      }
      setNewComment('')
      setCommentCharCount(0)
    }
    setIsSubmitting(false)
  }

  const handleDeleteComment = async (commentId: string) => {
    const res = await fetch('/api/social/comment', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId }),
    }).catch(() => null)
    if (res?.ok) setComments(prev => prev.filter(c => c.id !== commentId))
  }

  const showReport = user && user.id !== post.user_id

  return (
    <article className={`gk-feed-card overflow-hidden transition-all duration-300 ${
      post.pinned
        ? 'ring-1 ring-[rgba(230,255,61,0.20)]'
        : 'hover:border-[var(--border)]'
    }`}>

      {post.pinned && (
        <div className="flex items-center gap-1.5 px-4 md:px-6 pt-3.5" style={{ color: 'var(--accent)' }}>
          <Pin size={12} className="rotate-45" />
          <span className="gk-label text-[var(--accent)]">{copy.pinned}</span>
        </div>
      )}

      {/* Header: avatar + nome + timestamp */}
      <div className="p-4 md:p-6 pb-3 md:pb-4 flex items-center gap-3">
        <Link href={`/profile/${profile?.username}`} className="group shrink-0">
          <div className="gk-avatar-ring w-10 h-10 md:w-11 md:h-11 rounded-full overflow-hidden transition-all">
            <div className="gk-avatar-ring-inner h-full w-full">
              <Avatar
                src={profile?.avatar_url}
                username={profile?.username || 'user'}
                displayName={profile?.display_name}
                size={44}
                className="rounded-full"
              />
            </div>
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${profile?.username}`} className="hover:text-[var(--accent)] transition-colors">
            <p className="gk-headline truncate text-[var(--text-primary)]">
              <UserBadge badge={profile?.badge} displayName={profile?.display_name || profile?.username || copy.userFallback} />
            </p>
          </Link>
          <p className="gk-mono mt-0.5 text-[var(--text-muted)]">
            @{profile?.username || 'anon'} · {timeAgo}
          </p>
        </div>
        {showReport && (
          <ReportButton
            targetType="post"
            targetId={post.id}
            iconOnly
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}
      </div>

      {/* Contenuto testo */}
      <div className="px-4 md:px-6 pb-3.5 md:pb-4">
        <p className="gk-body whitespace-pre-wrap text-[var(--text-primary)]">{post.content}</p>
      </div>

      {/* Immagine allegata */}
      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="mx-3 md:mx-4 mb-3.5 md:mb-4 rounded-xl md:rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg-card-hover)]">
          <img
            src={optimizeImage(post.image_url, 'feed-post')}
            alt={copy.postImageAlt(profile?.username || 'user')}
            className="w-full max-h-[340px] md:max-h-[420px] object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      )}

      {/* Azioni: like + commenti */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-t border-[var(--border)] flex items-center gap-5 md:gap-6">
        <button
          onClick={handleLike}
          aria-label={hasLiked ? copy.removeLike : copy.addLike}
          className={`flex items-center gap-2 group transition-all ${hasLiked ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--accent)]'}`}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${hasLiked ? 'bg-[rgba(230,255,61,0.12)]' : 'group-hover:bg-[rgba(230,255,61,0.08)]'}`}>
            <Flame
              size={20}
              className={`transition-transform ${hasLiked ? 'fill-[var(--accent)]' : ''} ${likeAnimating ? 'animate-heart-burst' : ''}`}
            />
          </div>
          <span className="gk-mono font-bold">{likesCount}</span>
        </button>

        <button
          onClick={handleToggleComments}
          aria-label={showComments ? copy.hideComments : copy.showComments}
          className={`flex items-center gap-2 group transition-all ${showComments ? '' : 'text-[var(--text-muted)]'}`}
          style={showComments ? { color: 'var(--accent)' } : {}}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${showComments ? 'bg-[rgba(230,255,61,0.10)]' : 'group-hover:bg-[var(--bg-card-hover)]'}`}>
            <MessageSquare size={20} />
          </div>
          <span className="gk-mono font-bold">{comments.length}</span>
        </button>

        {showReport && (
          <div className="ml-auto">
            <ReportButton targetType="post" targetId={post.id} iconOnly />
          </div>
        )}
      </div>

      {/* Sezione commenti espandibile */}
      {showComments && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 border-t border-[var(--border)] pt-3.5 bg-black/20">
          {comments.length > 0 && (
            <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2.5">
                  <Link href={`/profile/${comment.profiles?.username}`} className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-[var(--accent)]/40 transition-all">
                    <Avatar
                      src={comment.profiles?.avatar_url}
                      username={comment.profiles?.username || 'user'}
                      displayName={comment.profiles?.display_name}
                      size={28}
                      className="rounded-full"
                    />
                  </Link>
                  <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl px-3.5 py-2 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/profile/${comment.profiles?.username}`} className="gk-mono truncate hover:opacity-80 transition-opacity" style={{ color: 'var(--accent)' }}>
                        @{comment.profiles?.username || 'user'}
                      </Link>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {user?.id === comment.user_id ? (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            aria-label={copy.deleteComment}
                            className="text-[var(--text-muted)] hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        ) : user ? (
                          <ReportButton targetType="comment" targetId={comment.id} iconOnly />
                        ) : null}
                      </div>
                    </div>
                    <p className="text-[var(--text-secondary)] text-xs mt-0.5 break-words">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSendComment} className="relative">
            <input
              type="text"
              value={newComment}
              onChange={handleCommentChange}
              placeholder={copy.commentPlaceholder}
              maxLength={MAX_COMMENT_LENGTH}
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] focus:border-[rgba(230,255,61,0.45)] rounded-2xl py-3 px-4 pr-20 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none transition-colors"
            />
            {commentCharCount > 0 && (
              <span className={`absolute right-11 top-1/2 -translate-y-1/2 text-[10px] font-medium transition-colors ${
                commentCharCount > MAX_COMMENT_LENGTH * 0.9
                  ? commentCharCount >= MAX_COMMENT_LENGTH ? 'text-red-400' : 'text-yellow-400'
                  : 'text-[var(--text-muted)]'
              }`}>
                {MAX_COMMENT_LENGTH - commentCharCount}
              </span>
            )}
            <button
              type="submit"
              disabled={isSubmitting || !newComment.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 disabled:opacity-40 transition-colors hover:opacity-80"
              style={{ color: 'var(--accent)' }}
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}
    </article>
  )
})
