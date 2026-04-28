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
}

export const FeedCard = memo(function FeedCard({ post, onLikeChange }: FeedCardProps): React.ReactElement {
  const supabase = createClient()
  const { locale } = useLocale()

  const profile: PostProfile | null = Array.isArray(post.profiles)
    ? (post.profiles[0] ?? null)
    : (post.profiles ?? null)

  const [likesCount, setLikesCount] = useState<number>(post.likes_count ?? post.likes?.length ?? 0)
  const [hasLiked, setHasLiked] = useState(post.liked_by_user ?? false)
  const [likeAnimating, setLikeAnimating] = useState(false)
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
    setTimeout(() => setLikeAnimating(false), 400)

    if (hasLiked) {
      setHasLiked(false)
      setLikesCount(prev => prev - 1)
      onLikeChange?.(post.id, -1)
      await supabase.from('likes').delete().match({ user_id: user.id, post_id: post.id })
    } else {
      setHasLiked(true)
      setLikesCount(prev => prev + 1)
      onLikeChange?.(post.id, 1)
      // Inserisce like e notifica in-app direttamente (come ProfileComments)
      await supabase.from('likes').insert([{ user_id: user.id, post_id: post.id }])
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert([{
          type: 'like', sender_id: user.id, receiver_id: post.user_id, post_id: post.id,
        }])
        // Trigger push server-side (fire and forget)
        fetch('/api/social/like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: post.id, action: 'push_only' }),
        }).catch(() => {})
      }
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

    const { data, error } = await supabase
      .from('comments')
      .insert([{ content: newComment.trim(), post_id: post.id, user_id: user.id }])
      .select('*, profiles(username, display_name, avatar_url, badge)')
      .single()

    if (!error && data) {
      setComments(prev => [...prev, data])
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert([{
          type: 'comment', sender_id: user.id, receiver_id: post.user_id, post_id: post.id,
        }])
        // Trigger push server-side (fire and forget)
        fetch('/api/social/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: post.id, action: 'push_only' }),
        }).catch(() => {})
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
    <div className={`bg-zinc-900 border rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-300 ${
      post.pinned
        ? 'border-violet-500/40 ring-1 ring-violet-500/20'
        : 'border-zinc-800 hover:border-violet-500/30'
    }`}>

      {post.pinned && (
        <div className="flex items-center gap-1.5 px-4 md:px-6 pt-3.5 text-violet-400">
          <Pin size={12} className="rotate-45" />
          <span className="text-[10px] font-bold uppercase tracking-widest">In evidenza</span>
        </div>
      )}

      {/* Header: avatar + nome + timestamp */}
      <div className="p-4 md:p-6 pb-3 md:pb-4 flex items-center gap-3">
        <Link href={`/profile/${profile?.username}`} className="group shrink-0">
          <div className="w-10 h-10 md:w-11 md:h-11 rounded-full overflow-hidden ring-2 ring-violet-500/20 group-hover:ring-violet-500/50 transition-all">
            <Avatar
              src={profile?.avatar_url}
              username={profile?.username || 'user'}
              displayName={profile?.display_name}
              size={44}
              className="rounded-full"
            />
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${profile?.username}`} className="hover:text-violet-400 transition-colors">
            <p className="font-semibold text-white text-sm leading-tight truncate">
              <UserBadge badge={profile?.badge} displayName={profile?.display_name || profile?.username || 'Utente'} />
            </p>
          </Link>
          <p className="text-xs text-zinc-500 mt-0.5">
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
        <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Immagine allegata */}
      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="mx-3 md:mx-4 mb-3.5 md:mb-4 rounded-xl md:rounded-2xl overflow-hidden border border-zinc-800">
          <img
            src={post.image_url}
            alt={`Immagine del post di ${profile?.username || 'utente'}`}
            className="w-full max-h-[340px] md:max-h-[420px] object-cover"
          />
        </div>
      )}

      {/* Azioni: like + commenti */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-t border-zinc-800/60 flex items-center gap-5 md:gap-6">
        <button
          onClick={handleLike}
          aria-label={hasLiked ? 'Rimuovi like' : 'Metti like'}
          className={`flex items-center gap-2 group transition-all ${hasLiked ? 'text-orange-500' : 'text-zinc-500 hover:text-orange-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${hasLiked ? 'bg-orange-500/15' : 'group-hover:bg-orange-500/10'}`}>
            <Flame
              size={20}
              className={`transition-transform ${hasLiked ? 'fill-orange-500' : ''} ${likeAnimating ? 'animate-heart-burst' : ''}`}
            />
          </div>
          <span className="text-xs font-bold">{likesCount}</span>
        </button>

        <button
          onClick={handleToggleComments}
          aria-label={showComments ? 'Nascondi commenti' : 'Mostra commenti'}
          className={`flex items-center gap-2 group transition-all ${showComments ? 'text-violet-400' : 'text-zinc-500 hover:text-violet-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${showComments ? 'bg-violet-500/15' : 'group-hover:bg-violet-500/10'}`}>
            <MessageSquare size={20} />
          </div>
          <span className="text-xs font-bold">{comments.length}</span>
        </button>

        {showReport && (
          <div className="ml-auto">
            <ReportButton targetType="post" targetId={post.id} iconOnly />
          </div>
        )}
      </div>

      {/* Sezione commenti espandibile */}
      {showComments && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 border-t border-zinc-800/60 pt-3.5 bg-black/20">
          {comments.length > 0 && (
            <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2.5">
                  <Link href={`/profile/${comment.profiles?.username}`} className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-violet-500/50 transition-all">
                    <Avatar
                      src={comment.profiles?.avatar_url}
                      username={comment.profiles?.username || 'user'}
                      displayName={comment.profiles?.display_name}
                      size={28}
                      className="rounded-full"
                    />
                  </Link>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-2 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/profile/${comment.profiles?.username}`} className="text-[10px] font-bold text-violet-400 uppercase tracking-wider hover:text-violet-300 truncate">
                        @{comment.profiles?.username || 'user'}
                      </Link>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {user?.id === comment.user_id ? (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        ) : user ? (
                          <ReportButton targetType="comment" targetId={comment.id} iconOnly />
                        ) : null}
                      </div>
                    </div>
                    <p className="text-zinc-300 text-xs mt-0.5 break-words">{comment.content}</p>
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
              placeholder="Scrivi un commento..."
              maxLength={MAX_COMMENT_LENGTH}
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl py-3 px-4 pr-20 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
            />
            {commentCharCount > 0 && (
              <span className={`absolute right-11 top-1/2 -translate-y-1/2 text-[10px] font-medium transition-colors ${
                commentCharCount > MAX_COMMENT_LENGTH * 0.9
                  ? commentCharCount >= MAX_COMMENT_LENGTH ? 'text-red-400' : 'text-yellow-400'
                  : 'text-zinc-600'
              }`}>
                {MAX_COMMENT_LENGTH - commentCharCount}
              </span>
            )}
            <button
              type="submit"
              disabled={isSubmitting || !newComment.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-violet-400 hover:text-violet-300 disabled:opacity-40 transition-colors"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}
    </div>
  )
})