"use client"
import { useState } from 'react'
import { Heart, MessageCircle, Share2, Trophy, Loader2 } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

export function PostCard({ post, currentUser }: { post: any, currentUser: any }) {
  const [isLiked, setIsLiked] = useState(post.is_liked_by_me)
  const [likesCount, setLikesCount] = useState(post.likes_count)
  const [loading, setLoading] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleLike = async () => {
    if (!currentUser || loading) return
    setLoading(true)

    try {
      if (isLiked) {
        // Rimuovi Like
        await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', currentUser.id)
        setIsLiked(false)
        setLikesCount((prev: number) => prev - 1)
      } else {
        // Aggiungi Like
        await supabase.from('likes').insert({ post_id: post.id, user_id: currentUser.id })
        setIsLiked(true)
        setLikesCount((prev: number) => prev + 1)

        // Invia Notifica (solo se il post non è mio)
        if (post.user_id !== currentUser.id) {
          await supabase.from('notifications').insert({
            receiver_id: post.user_id,
            sender_id: currentUser.id,
            type: 'like',
            post_id: post.id
          })
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#16161e]/50 border border-white/5 rounded-[2.5rem] overflow-hidden backdrop-blur-md">
      {/* User Header */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7c6af7] to-[#ff4d4d] p-[1px]">
          <div className="w-full h-full rounded-[11px] bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
            {post.profiles?.avatar_url ? (
              <img src={post.profiles.avatar_url} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-black text-white">{post.profiles?.username?.[0].toUpperCase()}</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-sm font-black text-white uppercase italic tracking-tighter">{post.profiles?.username}</p>
          <p className="text-[9px] text-[#7c6af7] font-black uppercase tracking-[0.2em]">Active Player</p>
        </div>
      </div>

      {/* Main Image */}
      <div className="aspect-square w-full bg-black relative">
        <img src={post.image_url} className="w-full h-full object-cover" alt="Drop" />
        <div className="absolute top-4 right-4 bg-black/60 p-2 rounded-xl border border-white/10 backdrop-blur-md">
          <Trophy size={16} className="text-[#7c6af7]" />
        </div>
      </div>

      {/* Actions */}
      <div className="p-6">
        <div className="flex gap-6 mb-4">
          <button 
            onClick={handleLike} 
            disabled={loading}
            className={`flex items-center gap-2 transition-all ${isLiked ? 'text-[#ff4d4d]' : 'text-gray-400 hover:text-white'}`}
          >
            {loading ? <Loader2 size={22} className="animate-spin" /> : <Heart size={24} fill={isLiked ? "currentColor" : "none"} />}
            <span className="text-xs font-black">{likesCount}</span>
          </button>
          <button className="flex items-center gap-2 text-gray-400 hover:text-[#7c6af7]">
            <MessageCircle size={24} />
            <span className="text-xs font-black">0</span>
          </button>
          <button className="ml-auto text-gray-600 hover:text-white">
            <Share2 size={22} />
          </button>
        </div>
        
        <p className="text-sm text-gray-300 leading-relaxed">
          <span className="font-black text-white mr-2 italic uppercase">{post.profiles?.username}</span>
          {post.content}
        </p>
      </div>
    </div>
  )
}