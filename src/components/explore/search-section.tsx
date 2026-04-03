"use client"
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Search } from 'lucide-react'
import Link from 'next/link'

export function SearchSection() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleSearch = async (val: string) => {
    setQuery(val)
    if (val.length < 2) {
      setResults([])
      return
    }

    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .ilike('username', `%${val}%`)
      .limit(5)

    setResults(data || [])
  }

  return (
    <div className="relative z-50">
      <div className="flex gap-3 bg-[#16161e] border border-white/5 rounded-2xl px-5 py-4 focus-within:border-[#7c6af7]/50 transition-all">
        <Search className="text-gray-500" size={20} />
        <input 
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Cerca un gamer..."
          className="bg-transparent outline-none text-sm w-full placeholder:text-gray-700 text-white"
        />
      </div>

      {results.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-2 bg-[#16161e] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          {results.map((res) => (
            <Link 
              key={res.username} 
              href={`/profile/${res.username}`}
              className="flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
            >
              <img 
                src={res.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${res.username}`} 
                className="w-8 h-8 rounded-full border border-white/10" 
                alt=""
              />
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-tight">{res.display_name || res.username}</p>
                <p className="text-[10px] text-[#7c6af7] font-medium tracking-widest italic">@{res.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
