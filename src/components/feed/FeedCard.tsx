"use client"
import { useState, useEffect } from 'react'
import { Flame, MessageSquare, Send, MoreHorizontal, Loader2, User } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'

export function FeedCard({ post }: { post: any }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [likesCount, setLikesCount] = useState<number>(post.likes?.length || 0)
  const [hasLiked, setHasLiked] = useState(false)
  const [user, setUser] = useState<any>(null)
  
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>(post.comments || [])
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const initCard = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user && post.likes) {
        setHasLiked(post.likes.some((l: any) => l.user_id === user.id))
      }
    }
    initCard()
  }, [post.likes, supabase.auth])

  const handleLike = async () => {
    if (!user) return alert("Accedi per interagire")
    
    if (hasLiked) {
      setHasLiked(false)
      setLikesCount((prev: number) => prev - 1)
      await supabase.from('likes').delete().match({ user_id: user.id, post_id: post.id })
    } else {
      setHasLiked(true)
      setLikesCount((prev: number) => prev + 1)
      
      // Inserimento Like
      await supabase.from('likes').insert([{ user_id: user.id, post_id: post.id }])

      // Generazione Notifica (Solo se non è il proprio post)
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert([{
          type: 'like',
          sender_id: user.id,
          receiver_id: post.user_id,
          post_id: post.id
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
      .select('*, profiles(username)')
      .single()

    if (!error && data) {
      setComments((prev) => [...prev, data])
      
      // Generazione Notifica Commento
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert([{
          type: 'comment',
          sender_id: user.id,
          receiver_id: post.user_id,
          post_id: post.id
        }])
      }
      
      setNewComment('')
    }
    setIsSubmitting(false)
  }

  return (
    <div className="bg-[#16161e] border border-white/5 rounded-[2.5rem] overflow-hidden mb-6 shadow-xl hover:border-[#7c6af7]/20 transition-all duration-300">
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Link href={`/profile/${post.profiles?.username}`} className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#7c6af7] to-[#b4a9ff] p-[1.5px] group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-full bg-[#16161e] overflow-hidden flex items-center justify-center">
                {post.profiles?.avatar_url ? (
                  <img src={post.profiles.avatar_url} className="w-full h-full object-cover" alt="avatar" />
                ) : (
                  <User size={20} className="text-gray-600" />
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-black italic uppercase tracking-tight text-white group-hover:text-[#7c6af7] transition-colors">
                {post.profiles?.display_name || 'Gamer'}
              </h3>
              <p className="text-[9px] text-[#7c6af7] font-bold uppercase tracking-widest">
                @{post.profiles?.username || 'anon'}
              </p>
            </div>
          </Link>
          <button className="text-gray-600 hover:text-white transition-colors">
            <MoreHorizontal size={18}/>
          </button>
        </div>

        <p className="text-gray-300 text-sm leading-relaxed mb-4">{post.content}</p>
      </div>

      {post.image_url && (
        <div className="px-2 pb-2">
          <div className="rounded-[2rem] overflow-hidden border border-white/5 bg-black/20">
            <img src={post.image_url} alt="Post Content" className="w-full h-auto max-h-[500px] object-cover hover:scale-105 transition-transform duration-700" />
          </div>
        </div>
      )}

      <div className="p-6 pt-2 flex items-center gap-6">
        <button onClick={handleLike} className="flex items-center gap-2 group transition-all">
          <div className={`p-2 rounded-full transition-all ${hasLiked ? 'bg-orange-500/20' : 'group-hover:bg-orange-500/10'}`}>
            <Flame size={22} className={hasLiked ? 'text-orange-500 fill-orange-500 animate-pulse' : 'text-gray-500 group-hover:text-orange-500'} />
          </div>
          <span className={`text-[11px] font-black ${hasLiked ? 'text-orange-500' : 'text-gray-500'}`}>{likesCount}</span>
        </button>
        
        <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-2 group">
          <div className={`p-2 rounded-full transition-all ${showComments ? 'bg-blue-500/20' : 'group-hover:bg-blue-500/10'}`}>
            <MessageSquare size={22} className={showComments ? 'text-blue-500' : 'text-gray-500 group-hover:text-blue-500'} />
          </div>
          <span className={`text-[11px] font-black ${showComments ? 'text-blue-500' : 'text-gray-500'}`}>{comments.length}</span>
        </button>

        <button className="ml-auto p-2 text-gray-500 hover:text-[#7c6af7] transition-all">
          <Send size={22} />
        </button>
      </div>

      {showComments && (
        <div className="px-6 pb-6 border-t border-white/5 bg-black/10 pt-4">
          <div className="space-y-3 mb-6 max-h-[250px] overflow-y-auto custom-scrollbar">
            {comments.map((comment: any) => (
              <div key={comment.id} className="flex flex-col bg-white/5 p-3 rounded-2xl border border-white/5">
                <Link href={`/profile/${comment.profiles?.username}`} className="font-black text-[#7c6af7] text-[9px] uppercase tracking-tighter hover:underline">
                  @{comment.profiles?.username || 'user'}
                </Link>
                <span className="text-gray-300 text-xs mt-0.5">{comment.content}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendComment} className="relative">
            <input 
              type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)}
              placeholder="Scrivi un commento..."
              className="w-full bg-[#0a0a0f] border border-white/10 rounded-full py-3 px-5 text-xs focus:border-[#7c6af7] outline-none transition-all pr-12 text-white"
            />
            <button disabled={isSubmitting || !newComment.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#7c6af7]">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
