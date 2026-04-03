"use client"
import { useState, useEffect } from 'react'
import { Send, X } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

export function CommentSection({ postId, onClose }: { postId: string, onClose: () => void }) {
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  useEffect(() => {
    fetchComments()
  }, [postId])

  async function fetchComments() {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(username)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    if (data) setComments(data)
  }

  async function postComment() {
    if (!newComment.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    
    const { error } = await supabase.from('comments').insert({
      content: newComment,
      post_id: postId,
      user_id: user?.id
    })

    if (!error) {
      setNewComment('')
      fetchComments()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#16161e] w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] h-[80vh] flex flex-col border border-white/10 shadow-2xl overflow-hidden">
        {/* Header Modale */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-white font-black uppercase tracking-tighter italic">Discussione_</h3>
          <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* Lista Commenti */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {comments.length > 0 ? comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7c6af7] to-[#b06ab3] flex-shrink-0" />
              <div>
                <span className="text-[10px] font-black text-[#7c6af7] uppercase">{c.profiles?.username}</span>
                <p className="text-sm text-gray-300 leading-snug">{c.content}</p>
              </div>
            </div>
          )) : (
            <p className="text-center text-gray-600 text-xs py-10 uppercase font-bold tracking-widest">Ancora nessun commento...</p>
          )}
        </div>

        {/* Input Commento */}
        <div className="p-6 bg-[#0a0a0f]/50 border-t border-white/5 flex gap-3">
          <input 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Scrivi la tua..."
            className="flex-1 bg-[#1c1c27] border-none rounded-2xl text-sm text-white focus:ring-1 focus:ring-[#7c6af7] px-4"
          />
          <button onClick={postComment} className="p-4 bg-[#7c6af7] rounded-2xl text-white hover:scale-105 active:scale-95 transition-all">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}