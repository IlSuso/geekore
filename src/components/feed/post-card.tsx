"use client"
import { useState, useEffect } from 'react'
import { Heart, MessageCircle, Share2, Trophy, Star, Gamepad2, Film, BookOpen, Tv } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

export function PostCard({ post, currentUser }: { post: any, currentUser: any }) {
  const [isLiked, setIsLiked] = useState(post.is_liked_by_me)
  const [likesCount, setLikesCount] = useState(post.likes_count || 0)
  const [showComments, setShowComments] = useState(false)
  
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const getCategoryIcon = (cat: string) => {
    switch(cat) {
      case 'videogame': return <Gamepad2 size={14} />;
      case 'movie': return <Film size={14} />;
      case 'manga': return <BookOpen size={14} />;
      case 'anime': return <Tv size={14} />;
      default: return <Trophy size={14} />;
    }
  }

  return (
    <div className="bg-[#16161e]/60 border border-white/5 rounded-[2.5rem] overflow-hidden backdrop-blur-xl shadow-2xl relative group">
      
      {/* BADGE CATEGORIA (Hub Nerd) */}
      {post.nerd_items && (
        <div className="absolute top-6 right-6 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-xl">
          <span className="text-[#7c6af7]">{getCategoryIcon(post.nerd_items.category)}</span>
          <span className="text-[9px] font-black uppercase text-white tracking-widest">{post.nerd_items.category}</span>
        </div>
      )}

      {/* HEADER */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7c6af7] to-[#ff4d4d] p-[1.5px]">
          <div className="w-full h-full rounded-[14px] bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
            <img src={post.profiles?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Gamer'} className="w-full h-full object-cover" />
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-white tracking-tight">{post.profiles?.username}</p>
          <p className="text-[9px] text-[#7c6af7] font-black uppercase tracking-widest">Level 12 Explorer</p>
        </div>
      </div>

      {/* MEDIA */}
      <div className="aspect-square w-full bg-black relative">
        <img src={post.image_url} className="w-full h-full object-cover" alt="Nerd Drop" />
        {/* Se c'è un voto, lo mostriamo sopra l'immagine */}
        {post.rating && (
          <div className="absolute bottom-4 left-4 bg-[#7c6af7] px-3 py-1 rounded-lg flex items-center gap-1 shadow-lg">
            <Star size={12} fill="white" className="text-white" />
            <span className="text-xs font-bold text-white">{post.rating}/5</span>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="p-6">
        <div className="flex gap-6 mb-5 items-center">
          <button onClick={() => {/* Logica Like */}} className={`flex items-center gap-2 ${isLiked ? 'text-[#ff4d4d]' : 'text-gray-400'}`}>
            <Heart size={24} fill={isLiked ? "currentColor" : "none"} />
            <span className="text-xs font-bold">{likesCount}</span>
          </button>
          <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-2 text-gray-400">
            <MessageCircle size={24} />
            <span className="text-xs font-bold italic">Review</span>
          </button>
          <button className="ml-auto text-gray-600"><Share2 size={22} /></button>
        </div>

        <div className="space-y-2">
          {post.nerd_items && (
            <h3 className="text-[#7c6af7] text-[10px] font-black uppercase tracking-[0.2em]">Recensione: {post.nerd_items.title}</h3>
          )}
          <p className="text-sm text-gray-200">
            <span className="font-bold text-white mr-2">{post.profiles?.username}</span>
            {post.content}
          </p>
        </div>
      </div>
    </div>
  )
}