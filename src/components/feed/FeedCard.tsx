"use client"
// src/components/feed/FeedCard.tsx
// Geekore card — struttura a schermo pieno ispirata ai feed moderni,
// con identità visiva propria: avatar con ring viola, azioni compatte,
// caption inline, commenti leggeri, separatore sottile tra post.

import { useState, useEffect, memo } from 'react'
import { Heart, MessageCircle, Zap, Bookmark, MoreHorizontal, Loader2, Trash2, Pin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ReportButton } from '@/components/ui/ReportButton'
import { Avatar } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'

async function getDateLocale(locale: string) {
  if (locale === 'en') { const { enUS } = await import('date-fns/locale/en-US'); return enUS }
  const { it } = await import('date-fns/locale/it'); return it
}

function haptic(d: number | number[] = 30) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(d)
}

export interface PostProfile { username: string; display_name?: string | null; avatar_url?: string | null }
export interface PostComment { id: string; content: string; created_at: string; user_id: string; profiles?: PostProfile | null }
export interface PostLike { id?: string; user_id: string }
export interface FeedPost {
  id: string; content: string; image_url?: string | null; created_at: string
  user_id?: string; pinned?: boolean; liked_by_user?: boolean; likes_count?: number
  profiles?: PostProfile | PostProfile[] | null; likes?: PostLike[]; comments?: PostComment[]
}
export interface FeedCardProps { post: FeedPost; onLikeChange?: (postId: string, delta: number) => void }

export const FeedCard = memo(function FeedCard({ post, onLikeChange }: FeedCardProps): JSX.Element {
  const supabase = createClient()
  const { locale } = useLocale()

  const profile: PostProfile | null = Array.isArray(post.profiles) ? (post.profiles[0] ?? null) : (post.profiles ?? null)
  const [likesCount, setLikesCount] = useState<number>(post.likes_count ?? post.likes?.length ?? 0)
  const [hasLiked, setHasLiked] = useState(post.liked_by_user ?? false)
  const [likeAnimating, setLikeAnimating] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>((post.comments as PostComment[]) || [])
  const [commentsFetched, setCommentsFetched] = useState((post.comments?.length ?? 0) > 0)
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timeAgo, setTimeAgo] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user && post.likes) setHasLiked(post.likes.some(l => l.user_id === user.id))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!post.created_at) return
    let cancelled = false
    getDateLocale(locale).then(dl => {
      if (!cancelled) setTimeAgo(formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: dl }))
    })
    return () => { cancelled = true }
  }, [post.created_at, locale])

  const handleLike = async () => {
    if (!user) return
    setLikeAnimating(true)
    haptic(hasLiked ? 18 : [35, 15, 35])
    setTimeout(() => setLikeAnimating(false), 480)
    if (hasLiked) {
      setHasLiked(false); setLikesCount(p => p - 1); onLikeChange?.(post.id, -1)
      await supabase.from('likes').delete().match({ user_id: user.id, post_id: post.id })
    } else {
      setHasLiked(true); setLikesCount(p => p + 1); onLikeChange?.(post.id, 1)
      await supabase.from('likes').insert([{ user_id: user.id, post_id: post.id }])
      if (user.id !== post.user_id)
        await supabase.from('notifications').insert([{ type: 'like', sender_id: user.id, receiver_id: post.user_id, post_id: post.id }])
    }
  }

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('comments').select('id, content, created_at, user_id, profiles(username, display_name, avatar_url)')
      .eq('post_id', post.id).order('created_at', { ascending: true })
    if (!error && data) { setComments(data as unknown as PostComment[]); setCommentsFetched(true) }
  }

  const handleToggleComments = () => {
    const next = !showComments; setShowComments(next); haptic(18)
    if (next && !commentsFetched) fetchComments()
  }

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !user) return
    setIsSubmitting(true); haptic(25)
    const { data, error } = await supabase
      .from('comments').insert([{ content: newComment, post_id: post.id, user_id: user.id }])
      .select('*, profiles(username, display_name, avatar_url)').single()
    if (!error && data) {
      setComments(prev => [...prev, data])
      if (user.id !== post.user_id)
        await supabase.from('notifications').insert([{ type: 'comment', sender_id: user.id, receiver_id: post.user_id, post_id: post.id }])
      setNewComment('')
    }
    setIsSubmitting(false)
  }

  const handleDeleteComment = async (id: string) => {
    await supabase.from('comments').delete().eq('id', id)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="gk-separator">

      {/* Pinned badge */}
      {post.pinned && (
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
          <Pin size={11} className="text-violet-400 rotate-45" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-violet-400">In evidenza</span>
        </div>
      )}

      {/* Header — avatar con ring viola Geekore, non rainbow */}
      <div className="flex items-center justify-between px-4 py-3">
        <Link href={`/profile/${profile?.username}`} className="flex items-center gap-3 min-w-0 group">
          {/* Ring viola se il post ha un like, grigio altrimenti */}
          <div className={`flex-shrink-0 rounded-full p-[2.5px] transition-all ${hasLiked ? 'gk-avatar-ring' : 'gk-avatar-ring-muted'}`}>
            <div className="gk-avatar-ring-inner rounded-full overflow-hidden p-[2px]">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <Avatar src={profile?.avatar_url} username={profile?.username || 'user'} displayName={profile?.display_name} size={32} />
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="gk-username truncate group-hover:text-violet-400 transition-colors">
              {profile?.username || 'utente'}
            </p>
            {profile?.display_name && profile.display_name !== profile.username && (
              <p className="text-[11px] text-[var(--text-secondary)] truncate">{profile.display_name}</p>
            )}
          </div>
        </Link>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {user && user.id !== post.user_id && <ReportButton targetType="post" targetId={post.id} iconOnly />}
          <button className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <MoreHorizontal size={19} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* Image — full width, angoli top arrotondati sul mobile */}
      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="w-full overflow-hidden bg-zinc-950 md:mx-4 md:w-auto md:rounded-2xl md:border md:border-[var(--border)]">
          <img
            src={post.image_url}
            alt={`Post di ${profile?.username}`}
            className="w-full max-h-[520px] object-cover select-none"
            loading="lazy"
            draggable={false}
          />
        </div>
      )}

      {/* Action bar — Geekore: Heart + Reply + Zap (share) + Bookmark */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-5">
            {/* Like */}
            <button onClick={handleLike} aria-label={hasLiked ? 'Rimuovi like' : 'Metti like'}>
              <Heart
                size={24}
                strokeWidth={1.8}
                className={`transition-all duration-200 ${likeAnimating ? 'animate-heart-burst' : ''} ${hasLiked ? 'fill-red-500 text-red-500' : 'text-[var(--text-primary)] hover:text-red-400'}`}
              />
            </button>
            {/* Comment */}
            <button onClick={handleToggleComments} aria-label="Commenti">
              <MessageCircle
                size={24}
                strokeWidth={1.8}
                className={`transition-colors ${showComments ? 'text-violet-400' : 'text-[var(--text-primary)] hover:text-violet-400'}`}
              />
            </button>
            {/* Share / Zap — Geekore's own icon, not IG's paper plane */}
            <button aria-label="Condividi">
              <Zap size={22} strokeWidth={1.8} className="text-[var(--text-primary)] hover:text-yellow-400 transition-colors" />
            </button>
          </div>
          {/* Bookmark */}
          <button onClick={() => { setIsSaved(v => !v); haptic(18) }} aria-label={isSaved ? 'Rimuovi' : 'Salva'}>
            <Bookmark
              size={22}
              strokeWidth={1.8}
              className={`transition-all ${isSaved ? 'fill-violet-500 text-violet-500' : 'text-[var(--text-primary)] hover:text-violet-400'}`}
            />
          </button>
        </div>

        {/* Like count */}
        {likesCount > 0 && (
          <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-1.5 leading-tight">
            {likesCount.toLocaleString()} {likesCount === 1 ? 'apprezzamento' : 'apprezzamenti'}
          </p>
        )}

        {/* Caption — username + testo sulla stessa riga */}
        {post.content && (
          <p className="gk-body mb-1.5">
            <Link href={`/profile/${profile?.username}`} className="font-semibold mr-1.5 hover:text-violet-400 transition-colors">
              {profile?.username}
            </Link>
            {post.content}
          </p>
        )}

        {/* Comments preview toggle */}
        {comments.length > 0 && !showComments && (
          <button onClick={handleToggleComments} className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors block mb-1">
            Leggi {comments.length === 1 ? 'il commento' : `tutti i ${comments.length} commenti`}
          </button>
        )}

        {/* Timestamp */}
        <p className="gk-meta mt-1">{timeAgo}</p>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-3">
          {comments.length > 0 && (
            <div className="space-y-2.5 mb-3 max-h-52 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id} className="flex gap-2.5 items-start group">
                  <Link href={`/profile/${c.profiles?.username}`} className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden mt-0.5">
                    <Avatar src={c.profiles?.avatar_url} username={c.profiles?.username || 'user'} displayName={c.profiles?.display_name} size={28} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[var(--text-primary)] leading-snug">
                      <Link href={`/profile/${c.profiles?.username}`} className="font-semibold mr-1 hover:text-violet-400 transition-colors">
                        {c.profiles?.username}
                      </Link>
                      {c.content}
                    </p>
                  </div>
                  {user?.id === c.user_id && (
                    <button onClick={() => handleDeleteComment(c.id)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all flex-shrink-0 mt-0.5">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleSendComment} className="flex items-center gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <input
              type="text" value={newComment}
              onChange={e => setNewComment(e.target.value.slice(0, 500))}
              placeholder="Scrivi un commento…"
              className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
            />
            {newComment.trim() && (
              <button type="submit" disabled={isSubmitting}
                className="text-[13px] font-semibold text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50 flex-shrink-0">
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : 'Pubblica'}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  )
})