"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useLocale } from '@/lib/locale'

export function SearchSection() {
  const { locale } = useLocale()
  const copy = locale === 'en' ? { placeholder: 'Search a user...', empty: (q: string) => `No user found for "${q}"` } : { placeholder: 'Cerca un utente...', empty: (q: string) => `Nessun utente trovato per "${q}"` }
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
        open && results.length > 0 ? 'border-zinc-600' : 'border-zinc-800 focus-within:border-zinc-600'
      }`}>
        <Search size={18} className={loading ? 'animate-pulse' : 'text-zinc-500'} style={loading ? { color: 'var(--accent)' } : {}} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.placeholder}
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
                  <Image src={res.avatar_url} alt="" fill className="object-cover" sizes="36px" />
                ) : (
                  <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-white font-bold text-sm">
                    {(res.display_name?.[0] || res.username?.[0] || '?').toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">
                  {res.display_name || res.username}
                </p>
                <p className="text-xs text-zinc-500">@{res.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-500 shadow-2xl">
          {copy.empty(query)}
        </div>
      )}
    </div>
  )
}