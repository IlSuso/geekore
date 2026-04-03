"use client"
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Header } from "@/components/feed/header"
import { Nav } from "@/components/feed/nav"
import { Search as SearchIcon, UserPlus, Loader2, Zap } from 'lucide-react'
import Link from 'next/link'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const searchUsers = async () => {
      if (query.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${query}%`) // Cerca corrispondenze parziali (case-insensitive)
        .limit(10)

      if (!error && data) setResults(data)
      setLoading(false)
    }

    const timer = setTimeout(searchUsers, 300) // Debounce per non intasare il DB
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Header />
      
      <main className="max-w-xl mx-auto pt-24 pb-32 px-4">
        {/* Barra di Ricerca */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
            <SearchIcon size={18} className="text-[#7c6af7]" />
          </div>
          <input 
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un gamer nell'arena..."
            className="w-full bg-[#16161e] border border-white/5 rounded-full py-5 pl-14 pr-6 text-sm focus:border-[#7c6af7]/50 outline-none transition-all shadow-2xl placeholder:text-gray-600"
          />
          {loading && (
            <div className="absolute inset-y-0 right-6 flex items-center">
              <Loader2 size={18} className="animate-spin text-[#7c6af7]" />
            </div>
          )}
        </div>

        {/* Risultati */}
        <div className="space-y-3">
          {results.map((user) => (
            <div 
              key={user.id}
              className="bg-[#16161e] border border-white/5 p-4 rounded-[2rem] flex items-center justify-between hover:border-[#7c6af7]/30 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#0a0a0f] overflow-hidden p-1 border border-white/5">
                  <img 
                    src={user.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.id}`} 
                    className="w-full h-full object-cover rounded-xl"
                    alt="avatar"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-black italic uppercase tracking-tight">{user.display_name || 'Gamer'}</h3>
                  <p className="text-[10px] text-[#7c6af7] font-bold uppercase tracking-widest">@{user.username}</p>
                </div>
              </div>
              
              <Link 
                href={`/profile/${user.username}`} 
                className="bg-white/5 hover:bg-[#7c6af7] p-3 rounded-2xl transition-all group-hover:scale-110"
              >
                <Zap size={18} className="text-[#7c6af7] group-hover:text-white transition-colors" />
              </Link>
            </div>
          ))}

          {query.length >= 2 && results.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-600 font-black uppercase text-[10px] tracking-[0.2em]">Nessun gamer trovato con questo nome</p>
            </div>
          )}

          {query.length < 2 && (
            <div className="text-center py-20 opacity-20">
              <SearchIcon size={48} className="mx-auto mb-4" />
              <p className="font-black uppercase text-[10px] tracking-[0.3em]">Digita per scansionare l'arena</p>
            </div>
          )}
        </div>
      </main>

      <Nav />
    </div>
  )
}
