"use client"
import { useState, useEffect } from 'react'
import { Heart, MessageCircle, Share2, MoreHorizontal } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { CommentSection } from './comment-section'

export function PostCard({ post }: { post: any }) {
  const [liked, setLiked] = useState(false)
  // Assicuriamoci che likesCount sia sempre un numero fin dall'inizio
  const [likesCount, setLikesCount] = useState<number>(Number(post.likes_count) || 0)
  const [showComments, setShowComments] = useState(false)
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Controllo iniziale dello stato del Like per l'utente loggato
  useEffect(() => {
    const checkLikeStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('likes')
        .select('*')
        .eq('post_id', post.id)
        .eq('user_id', user.id)
        .single()
        
      if (data) setLiked(true)
    }
    checkLikeStatus()
  }, [post.id, supabase])

  const handleLike = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      alert("Devi essere loggato per mettere like!")
      return
    }

    const willBeLiked = !liked
    const previousLiked = liked
    const previousCount = likesCount

    // Aggiornamento UI Ottimistico
    setLiked(willBeLiked)
    // Qui forziamo il tipo numero per evitare errori con prev
    setLikesCount((prev: number) => {
      const current = Number(prev) || 0
      return willBeLiked ? current + 1 : current - 1
    })

    try {
      if (previousLiked) {
        // Rimoziome Like
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id)
        
        if (error) throw error
      } else {
        // Inserimento Like
        const { error } = await supabase
          .from('likes')
          .insert({ post_id: post.id, user_id: user.id })
        
        if (error) throw error
      }
    } catch (err) {
      console.error("Errore database Like:", err)
      // Rollback in caso di fallimento
      setLiked(previousLiked)
      setLikesCount(previousCount)
    }
  }

  return (
    <>
      <article className="bg-[#16161e]/60 border border-white/5 rounded-[2.5rem] overflow-hidden mb-8 backdrop-blur-md transition-all hover:border-[#7c6af7]/20 shadow-xl">
        
        {/* HEADER: Profilo Utente */}
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7c6af7] to-[#b06ab3] p-[2px]">
              <div className="w-full h-full rounded-[14px] bg-[#0a0a0f] flex items-center justify-center text-white font-black text-sm uppercase">
                {post.profiles?.username?.[0] || 'G'}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white leading-none tracking-tight">
                {post.profiles?.username || 'Gamer'}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-[#7c6af7] uppercase font-black tracking-widest">
                  Level 42
                </span>
                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
              </div>
            </div>
          </div>
          <button className="p-2 text-gray-600 hover:text-white transition-colors">
            <MoreHorizontal size={20} />
          </button>
        </div>

        {/* MEDIA: Immagine */}
        {post.image_url && (
          <div className="px-4">
            <div 
              className="relative group cursor-pointer overflow-hidden rounded-[2rem] border border-white/5"
              onClick={() => setShowComments(true)}
            >
              <img 
                src={post.image_url} 
                alt="Post content" 
                className="w-full aspect-video object-cover transition-transform duration-700 group-hover:scale-105" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                <span className="text-white text-xs font-bold uppercase tracking-widest">Visualizza dettagli</span>
              </div>
            </div>
          </div>
        )}

        {/* TEXT: Descrizione */}
        <div className="p-6">
          <p className="text-gray-300 text-sm leading-relaxed font-medium">
            {post.content}
          </p>
        </div>

        {/* FOOTER: Bottoni Azione */}
        <div className="px-6 pb-6 flex items-center gap-8">
          {/* Like Button */}
          <button 
            onClick={handleLike} 
            className={`flex items-center gap-2.5 transition-all active:scale-75 ${liked ? 'text-red-500' : 'text-gray-500 hover:text-white'}`}
          >
            <Heart size={24} className={liked ? 'fill-current' : ''} />
            <span className="text-xs font-black tabular-nums">{likesCount}</span>
          </button>

          {/* Comment Button */}
          <button 
            onClick={() => setShowComments(true)}
            className="flex items-center gap-2.5 text-gray-500 hover:text-[#7c6af7] transition-all group active:scale-75"
          >
            <MessageCircle size={24} className="group-hover:rotate-12 transition-transform" />
            <span className="text-xs font-black tabular-nums">{post.comments_count || 0}</span>
          </button>

          {/* Share Button */}
          <button className="ml-auto text-gray-600 hover:text-white transition-all active:scale-75">
            <Share2 size={22} />
          </button>
        </div>
      </article>

      {/* RENDER MODALE COMMENTI */}
      {showComments && (
        <CommentSection 
          postId={post.id} 
          onClose={() => setShowComments(false)} 
        />
      )}
    </>
  )
}