"use client"
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Gamepad2, Film, BookOpen, CheckCircle2, Clock, Star } from 'lucide-react'

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<'posts' | 'library'>('posts')
  const [library, setLibrary] = useState<any[]>([])
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  useEffect(() => {
    fetchLibrary()
  }, [])

  async function fetchLibrary() {
    const { data } = await supabase.from('user_nerd_lists').select('*').order('created_at', { ascending: false })
    if (data) setLibrary(data)
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-24 pb-32 px-4 text-white">
      <div className="max-w-2xl mx-auto">
        {/* Header Profilo semplificato */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-[#7c6af7] to-[#ff4d4d] p-1 mb-4 shadow-2xl shadow-[#7c6af7]/20">
             <div className="w-full h-full rounded-[22px] bg-[#16161e] overflow-hidden">
                <img src="https://api.dicebear.com/7.x/pixel-art/svg?seed=Geekore" className="w-full h-full" />
             </div>
          </div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">Master Nerd</h1>
          <p className="text-[#7c6af7] text-[10px] font-black uppercase tracking-[0.3em]">Livello 42 • Sincronizzato</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#16161e] rounded-2xl p-1 mb-8">
          <button 
            onClick={() => setActiveTab('posts')}
            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'posts' ? 'bg-[#7c6af7] text-white shadow-lg' : 'text-gray-500'}`}
          >
            I miei Drop
          </button>
          <button 
            onClick={() => setActiveTab('library')}
            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'library' ? 'bg-[#7c6af7] text-white shadow-lg' : 'text-gray-500'}`}
          >
            Libreria Nerd
          </button>
        </div>

        {/* Sezione Libreria Nerd */}
        {activeTab === 'library' ? (
          <div className="grid gap-4">
            {library.map((item) => (
              <div key={item.id} className="bg-[#16161e]/40 border border-white/5 p-4 rounded-[1.5rem] flex items-center justify-between group hover:border-[#7c6af7]/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/5 rounded-xl text-[#7c6af7]">
                    {item.category === 'Game' && <Gamepad2 size={20} />}
                    {item.category === 'Movie' && <Film size={20} />}
                    {item.category === 'Anime' && <BookOpen size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm uppercase tracking-tight">{item.item_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-md text-gray-400 font-bold uppercase">{item.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1 text-[#ffb800]">
                    <Star size={12} fill="currentColor" />
                    <span className="text-xs font-black">{item.score}/10</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-600 py-20 uppercase font-black text-xs tracking-widest">Nessun drop ancora...</div>
        )}
      </div>
    </main>
  )
}