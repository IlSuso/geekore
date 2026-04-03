"use client"
import { useState } from 'react'
import { Heart, MessageCircle, Share2, MoreHorizontal } from 'lucide-react'

export function PostCard({ post }: { post: any }) {
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(post.likes_count || 0)

  const handleLike = () => {
    setLiked(!liked)
    setLikesCount(prev => liked ? prev - 1 : prev + 1)
    // Qui andrà la chiamata a Supabase
  }

  return (
    <article className="bg-[#16161e]/40 border border-white/5 rounded-[2rem] overflow-hidden mb-6 transition-all hover:border-[#7c6af7]/30">
      {/* Header Post */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#7c6af7] to-[#b06ab3]" />
          <div>
            <h4 className="text-sm font-bold text-white leading-none">{post.profiles?.username || 'Gamer'}</h4>
            <span className="text-[10px] text-gray-500 uppercase tracking-tighter">2h fa • Arena</span>
          </div>
        </div>
        <button className="text-gray-500 hover:text-white"><MoreHorizontal size={20} /></button>
      </div>

      {/* Media Content */}
      {post.image_url && (
        <div className="px-2">
           <img src={post.image_url} alt="Post content" className="w-full aspect-video object-cover rounded-[1.5rem]" />
        </div>
      )}

      {/* Caption */}
      <div className="p-5">
        <p className="text-gray-300 text-sm leading-relaxed">{post.content}</p>
      </div>

      {/* Actions Bar */}
      <div className="px-5 pb-5 flex items-center gap-6">
        <button 
          onClick={handleLike}
          className={`flex items-center gap-2 group transition-all ${liked ? 'text-red-500' : 'text-gray-500 hover:text-white'}`}
        >
          <Heart size={22} className={`${liked ? 'fill-current scale-110' : 'group-hover:scale-110'} transition-transform`} />
          <span className="text-xs font-black">{likesCount}</span>
        </button>
        
        <button className="flex items-center gap-2 text-gray-500 hover:text-[#7c6af7] transition-all group">
          <MessageCircle size={22} className="group-hover:scale-110 transition-transform" />
          <span className="text-xs font-black">{post.comments_count || 0}</span>
        </button>

        <button className="ml-auto text-gray-500 hover:text-white">
          <Share2 size={20} />
        </button>
      </div>
    </article>
  )
}
