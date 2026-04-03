"use client"
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export function CreatePost() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleSubmit = async () => {
    if (!content.trim()) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      const { error } = await supabase
        .from('posts')
        .insert([{ content, user_id: user.id }])

      if (!error) {
        setContent('')
        window.location.reload()
      } else {
        alert("Errore: " + error.message)
      }
    }
    setLoading(false)
  }

  return (
    <div className="bg-[#16161e] border border-white/5 rounded-3xl p-5 mb-8 shadow-2xl">
      <textarea 
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Cosa stai guardando o giocando?"
        className="w-full bg-transparent border-none text-white placeholder-gray-600 resize-none focus:ring-0 text-sm p-0 mb-4"
        rows={3}
      />
      <div className="flex justify-end border-t border-white/5 pt-4">
        <button 
          onClick={handleSubmit}
          disabled={loading || !content.trim()}
          className="bg-[#7c6af7] text-white px-8 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
        >
          {loading ? 'INVIO...' : 'PUBBLICA'}
        </button>
      </div>
    </div>
  )
}
