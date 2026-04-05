"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X } from 'lucide-react'
import Link from 'next/link'

export function SearchSection() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (val: string) => {
    if (val.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .or(`username.ilike.%${val}%,display_name.ilike.%${val}%`)
      .limit(6)
    setResults(data || [])
    setOpen(true)
    setLoading(false)
  }, [])

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const clear = () => { setQuery(''); setResults([]); setOpen(false) }

  return (
    <div ref={containerRef} className="relative z-50">
      <div className={`flex items-center gap-3 bg-zinc-900 border rounded-2xl px-5 py-3.5 transition-colors ${
        open && results.length > 0 ? 'border-violet-500/50' : 'border-zinc-800 focus-within:border-violet-500/50'
      }`}>
        <Search size={18} className={loading ? 'text-violet-400 animate-pulse' : 'text-zinc-500'} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un utente..."
          className="bg-transparent outline-none text-sm w-full placeholder-zinc-600 text-white"
        />
        {query && (
          <button onClick={clear} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
          {results.map((res) => (
            <Link
              key={res.username}
              href={`/profile/${res.username}`}
              onClick={() => { setOpen(false); setQuery('') }}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0"
            >
              <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
                {res.avatar_url ? (
                  <img src={res.avatar_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
                    {(res.display_name?.[0] || res.username?.[0] || '?').toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">
                  {res.display_name || res.username}
                </p>
                <p className="text-xs text-violet-400">@{res.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-500 shadow-2xl">
          Nessun utente trovato per "{query}"
        </div>
      )}
    </div>
  )
}
