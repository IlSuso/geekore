"use client"
// src/components/feed/FeedCard.tsx
// Instagram-style redesign: edge-to-edge images, clean action bar, story-ring avatar

import { useState, useEffect, memo } from 'react'
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Loader2, Trash2, Pin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ReportButton } from '@/components/ui/ReportButton'
import { Avatar } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'

async function getDateLocale(locale: string) {
  if (locale === 'en') {
    const { enUS } = await import('date-fns/locale/en-US')
    return enUS
  }
  const { it } = await import('date-fns/locale/it')
  return it
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
}

export const FeedCard = memo(function FeedCard({ post, onLikeChange }: FeedCardProps): JSX.Element {
  const supabase = createClient()
  const { locale } = useLocale()

  const profile: PostProfile | null = Array.isArray(post.profiles)
    ? (post.profiles[0] ?? null)
    : (post.profiles ?? null)

  const [likesCount, setLikesCount] = useState<number>(
    post.likes_count ?? post.likes?.length ?? 0
  )
  const [hasLiked, setHasLiked] = useState(post.liked_by_user ?? false)
  const [likeAnimating, setLikeAnimating] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>((post.comments as PostComment[]) || [])
  const [commentsFetched, setCommentsFetched] = useState((post.comments?.length ?? 0) > 0)
  const [newComment, setNewComment] = useState('')
  const [commentCharCount, setCommentCharCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timeAgo, setTimeAgo] = useState('')

  const MAX_COMMENT_LENGTH = 500

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user && post.likes) {
        setHasLiked(post.likes.some((l) => l.user_id === user.id))
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

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
    setTimeout(() => setLikeAnimating(false), 500)

    if (hasLiked) {
      setHasLiked(false)
      setLikesCount(prev => prev - 1)
      onLikeChange?.(post.id, -1)
      await supabase.from('likes').delete().match({ user_id: user.id, post_id: post.id })
    } else {
      setHasLiked(true)
      setLikesCount(prev => prev + 1)
      onLikeChange?.(post.id, 1)
      await supabase.from('likes').insert([{ user_id: user.id, post_id: post.id }])
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert([{
          type: 'like', sender_id: user.id, receiver_id: post.user_id, post_id: post.id,
        }])
      }
    }
  }

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id, profiles(username, display_name, avatar_url)')
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
    const { data, error } = await supabase
      .from('comments')
      .insert([{ content: newComment, post_id: post.id, user_id: user.id }])
      .select('*, profiles(username, display_name, avatar_url)')
      .single()
    if (!error && data) {
      setComments(prev => [...prev, data])
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert([{
          type: 'comment', sender_id: user.id, receiver_id: post.user_id, post_id: post.id,
        }])
      }
      setNewComment('')
      setCommentCharCount(0)
    }
    setIsSubmitting(false)
  }

  const handleDeleteComment = async (commentId: string) => {
    await supabase.from('comments').delete().eq('id', commentId)
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  const showReport = user && user.id !== post.user_id

  return (
    <article className="bg-[var(--bg-primary)] border-b border-[var(--border)] last:border-b-0">

      {/* Pinned indicator */}
      {post.pinned && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <Pin size={11} className="text-[var(--text-muted)] rotate-45" />
          <span className="text-[11px] text-[var(--text-muted)] font-medium tracking-wide">In evidenza</span>
        </div>
      )}

      {/* Header — Instagram style: avatar + username + more */}
      <div className="flex items-center justify-between px-4 py-3">
        <Link href={`/profile/${profile?.username}`} className="flex items-center gap-3 min-w-0">
          {/* Story-ring avatar */}
          <div className={`flex-shrink-0 rounded-full p-[2px] ${hasLiked ? 'story-ring' : 'bg-[var(--border)]'}`}>
            <div className="rounded-full overflow-hidden bg-[var(--bg-primary)] p-[2px]">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <Avatar
                  src={profile?.avatar_url}
                  username={profile?.username || 'user'}
                  displayName={profile?.display_name}
                  size={32}
                />
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[13px] text-[var(--text-primary)] leading-tight truncate">
              {profile?.username || 'utente'}
            </p>
            {profile?.display_name && profile.display_name !== profile.username && (
              <p className="text-[11px] text-[var(--text-secondary)] leading-tight truncate">{profile.display_name}</p>
            )}
          </div>
        </Link>

        <div className="flex items-center gap-1 flex-shrink-0">
          {showReport && (
            <ReportButton targetType="post" targetId={post.id} iconOnly />
          )}
          <button className="w-9 h-9 flex items-center justify-center text-[var(--text-primary)]">
            <MoreHorizontal size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Image — full width, no border-radius */}
      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="relative w-full bg-[var(--bg-secondary)] overflow-hidden">
          <img
            src={post.image_url}
            alt={`Post di ${profile?.username || 'utente'}`}
            className="w-full max-h-[500px] object-cover select-none"
            draggable={false}
          />
        </div>
      )}

      {/* Action bar — Instagram icons */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Like */}
            <button
              onClick={handleLike}
              aria-label={hasLiked ? 'Rimuovi like' : 'Metti like'}
              className="flex items-center justify-center -ml-1 p-1"
            >
              <Heart
                size={26}
                strokeWidth={1.8}
                className={`transition-all duration-200 ${
                  likeAnimating ? 'animate-heart-burst' : ''
                } ${hasLiked ? 'fill-red-500 text-red-500 scale-110' : 'text-[var(--text-primary)]'}`}
              />
            </button>

            {/* Comment */}
            <button
              onClick={handleToggleComments}
              aria-label="Commenta"
              className="flex items-center justify-center p-1"
            >
              <MessageCircle
                size={26}
                strokeWidth={1.8}
                className={`transition-colors ${showComments ? 'fill-[var(--text-primary)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}
              />
            </button>

            {/* Share */}
            <button aria-label="Condividi" className="flex items-center justify-center p-1">
              <Send size={24} strokeWidth={1.8} className="text-[var(--text-primary)] -rotate-12" />
            </button>
          </div>

          {/* Save */}
          <button
            onClick={() => { setIsSaved(v => !v); haptic(20) }}
            aria-label={isSaved ? 'Rimuovi dai salvati' : 'Salva'}
            className="flex items-center justify-center p-1"
          >
            <Bookmark
              size={24}
              strokeWidth={1.8}
              className={`transition-all ${isSaved ? 'fill-[var(--text-primary)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}
            />
          </button>
        </div>

        {/* Like count */}
        {likesCount > 0 && (
          <p className="font-semibold text-[13px] text-[var(--text-primary)] mt-2 leading-tight">
            {likesCount.toLocaleString()} {likesCount === 1 ? 'Mi piace' : 'Mi piace'}
          </p>
        )}

        {/* Caption */}
        {post.content && (
          <div className="mt-1.5">
            <p className="text-[14px] text-[var(--text-primary)] leading-snug">
              <Link
                href={`/profile/${profile?.username}`}
                className="font-semibold hover:opacity-70 transition-opacity mr-1.5"
              >
                {profile?.username || 'utente'}
              </Link>
              <span className="font-normal">{post.content}</span>
            </p>
          </div>
        )}

        {/* Comments count link */}
        {comments.length > 0 && !showComments && (
          <button
            onClick={handleToggleComments}
            className="mt-1.5 text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors block"
          >
            Visualizza tutti i {comments.length} commenti
          </button>
        )}
        {comments.length === 0 && (
          <button
            onClick={handleToggleComments}
            className="mt-1 text-[14px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors block"
          >
            Aggiungi un commento...
          </button>
        )}

        {/* Timestamp */}
        <p className="mt-2 text-[11px] text-[var(--text-muted)] uppercase tracking-[0.04em] leading-tight">
          {timeAgo}
        </p>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-[var(--border-subtle)] px-4 pt-3 pb-4">
          {/* Comments list */}
          {comments.length > 0 && (
            <div className="space-y-3 mb-3 max-h-56 overflow-y-auto">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 items-start">
                  <Link href={`/profile/${comment.profiles?.username}`} className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden mt-0.5">
                    <Avatar
                      src={comment.profiles?.avatar_url}
                      username={comment.profiles?.username || 'user'}
                      displayName={comment.profiles?.display_name}
                      size={32}
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[var(--text-primary)] leading-snug">
                      <Link href={`/profile/${comment.profiles?.username}`} className="font-semibold mr-1.5 hover:opacity-70 transition-opacity">
                        {comment.profiles?.username || 'user'}
                      </Link>
                      <span className="font-normal">{comment.content}</span>
                    </p>
                  </div>
                  {(user?.id === comment.user_id || user) && (
                    <div className="flex-shrink-0 mt-0.5">
                      {user?.id === comment.user_id ? (
                        <button onClick={() => handleDeleteComment(comment.id)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <ReportButton targetType="comment" targetId={comment.id} iconOnly />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Comment input */}
          <form onSubmit={handleSendComment} className="flex items-center gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-[var(--bg-card)]">
              {user && (
                <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white">TU</span>
                </div>
              )}
            </div>
            <div className="flex-1 relative">
              <input
                type="text"
                value={newComment}
                onChange={handleCommentChange}
                placeholder="Aggiungi un commento..."
                maxLength={MAX_COMMENT_LENGTH}
                className="w-full bg-transparent text-[14px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              />
            </div>
            {newComment.trim() && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-shrink-0 text-[13px] font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Pubblica'}
              </button>
            )}
          </form>
        </div>
      )}
    </article>
  )
})