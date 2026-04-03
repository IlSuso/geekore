"use client"
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Send, Loader2 } from 'lucide-react'

export function CommentSection({ postId, currentUser }: { postId: string, currentUser: any }) {
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  useEffect(() => {
    fetchComments()
  }, [postId])

  async function fetchComments() {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(username, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    if (data) setComments(data)
  }

  async function handleSend() {
    if (!newComment.trim() || !currentUser || loading) return
    setLoading(true)
    
    const { error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: currentUser.id, content: newComment })

    if (!error) {
      setNewComment('')
      fetchComments()
      // Opzionale: Invia notifica al proprietario del post qui
    }
    setLoading(false)
  }

  return (
    <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
      <div className="max-h-40 overflow-y-auto space-y-3 px-2">
        {comments.map((c) => (
          <div key={c.id} className="text-sm">
            <span className="font-black text-[#7c6af7] mr-2 uppercase italic text-[10px]">{c.profiles?.username}</span>
            <span className="text-gray-300">{c.content}</span>
          </div>
        ))}
      </div>

      {currentUser && (
        <div className="flex gap-2 items-center bg-[#0a0a0f] p-2 rounded-2xl border border-white/5">
          <input 
            type="text" 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Scrivi un commento..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-white px-2"
          />
          <button onClick={handleSend} disabled={loading} className="p-2 text-[#7c6af7] hover:scale-110 transition-transform">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      )}
    </div>
  )
}