"use client"

import { useState, useEffect } from 'react'
import { Flame, MessageSquare, Send, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale'

export function FeedCard({ post }: { post: any }) {
  const supabase = createClient()

  const [likesCount, setLikesCount] = useState<number>(post.likes?.length || 0)
  const [hasLiked, setHasLiked] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>(post.comments || [])
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user && post.likes) {
        setHasLiked(post.likes.some((l: any) => l.user_id === user.id))
      }
    })
  }, [])

  const handleLike = async () => {
    if (!user) return
    if (hasLiked) {
      setHasLiked(false)
      setLikesCount(prev => prev - 1)
      await supabase.from('likes').delete().match({ user_id: user.id, post_id: post.id })
    } else {
      setHasLiked(true)
      setLikesCount(prev => prev + 1)
      await supabase.from('likes').insert([{ user_id: user.id, post_id: post.id }])
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert([{
          type: 'like', sender_id: user.id, receiver_id: post.user_id, post_id: post.id,
        }])
      }
    }
  }

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !user) return
    setIsSubmitting(true)
    const { data, error } = await supabase
      .from('comments')
      .insert([{ content: newComment, post_id: post.id, user_id: user.id }])
      .select('*, profiles(username, display_name)')
      .single()
    if (!error && data) {
      setComments(prev => [...prev, data])
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert([{
          type: 'comment', sender_id: user.id, receiver_id: post.user_id, post_id: post.id,
        }])
      }
      setNewComment('')
    }
    setIsSubmitting(false)
  }

  const avatarInitial = (
    post.profiles?.display_name?.[0] || post.profiles?.username?.[0] || '?'
  ).toUpperCase()

  const timeAgo = post.created_at
    ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: it })
    : ''

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/30 transition-all duration-300">
      {/* Header */}
      <div className="p-6 pb-4 flex items-center gap-3">
        <Link href={`/profile/${post.profiles?.username}`} className="group shrink-0">
          <div className="w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-violet-500/20 group-hover:ring-violet-500/50 transition-all">
            {post.profiles?.avatar_url ? (
              <img src={post.profiles.avatar_url} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-lg">
                {avatarInitial}
              </div>
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${post.profiles?.username}`} className="hover:text-violet-400 transition-colors">
            <p className="font-semibold text-white text-sm leading-tight truncate">
              {post.profiles?.display_name || post.profiles?.username || 'Utente'}
            </p>
          </Link>
          <p className="text-xs text-zinc-500 mt-0.5">
            @{post.profiles?.username || 'anon'} · {timeAgo}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pb-4">
        <p className="text-zinc-200 text-sm leading-relaxed">{post.content}</p>
      </div>

      {/* Image */}
      {post.image_url && (
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-zinc-800">
          <img
            src={post.image_url}
            alt=""
            className="w-full max-h-[420px] object-cover hover:scale-[1.02] transition-transform duration-500"
          />
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 border-t border-zinc-800/60 flex items-center gap-6">
        <button
          onClick={handleLike}
          className={`flex items-center gap-2 group transition-all ${hasLiked ? 'text-orange-500' : 'text-zinc-500 hover:text-orange-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${hasLiked ? 'bg-orange-500/15' : 'group-hover:bg-orange-500/10'}`}>
            <Flame size={20} className={hasLiked ? 'fill-orange-500' : ''} />
          </div>
          <span className="text-xs font-bold">{likesCount}</span>
        </button>

        <button
          onClick={() => setShowComments(!showComments)}
          className={`flex items-center gap-2 group transition-all ${showComments ? 'text-violet-400' : 'text-zinc-500 hover:text-violet-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${showComments ? 'bg-violet-500/15' : 'group-hover:bg-violet-500/10'}`}>
            <MessageSquare size={20} />
          </div>
          <span className="text-xs font-bold">{comments.length}</span>
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="px-6 pb-6 border-t border-zinc-800/60 pt-4 bg-black/20">
          {comments.length > 0 && (
            <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
              {comments.map((comment: any) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0">
                    {(comment.profiles?.display_name?.[0] || comment.profiles?.username?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2 flex-1">
                    <Link href={`/profile/${comment.profiles?.username}`} className="text-[10px] font-bold text-violet-400 uppercase tracking-wider hover:text-violet-300">
                      @{comment.profiles?.username || 'user'}
                    </Link>
                    <p className="text-zinc-300 text-xs mt-0.5">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSendComment} className="relative">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Scrivi un commento..."
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl py-3 px-5 pr-12 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
            />
            <button
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
}
