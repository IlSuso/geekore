"use client"

import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X } from 'lucide-react'
import Link from 'next/link'

interface UserResult {
  username: string
  display_name?: string
  avatar_url?: string
}

export function SearchSection() {
  const uid = useId()
  const listboxId = `${uid}-listbox`

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (val: string) => {
    if (val.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .or(`username.ilike.%${val}%,display_name.ilike.%${val}%`)
      .limit(6)
    setResults(data || [])
    setOpen(true)
    setActiveIndex(-1)
    setLoading(false)
  }, [])

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const clear = () => { setQuery(''); setResults([]); setOpen(false); setActiveIndex(-1) }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      inputRef.current?.blur()
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      const result = results[activeIndex]
      if (result) window.location.href = `/profile/${result.username}`
    }
  }

  const hasResults = open && results.length > 0
  const isEmpty = open && query.trim().length >= 2 && results.length === 0 && !loading

  return (
    <div ref={containerRef} className="relative z-50">
      <div
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={hasResults}
        aria-owns={listboxId}
        className={`flex items-center gap-3 bg-zinc-900 border rounded-2xl px-5 py-3.5 transition-colors ${
          hasResults ? 'border-violet-500/50' : 'border-zinc-800 focus-within:border-violet-500/50'
        }`}
      >
        <Search size={18} className={loading ? 'text-violet-400 animate-pulse' : 'text-zinc-500'} aria-hidden="true" />
        <input
          ref={inputRef}
          role="searchbox"
          aria-label="Cerca un utente"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${uid}-option-${activeIndex}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Cerca un utente..."
          className="bg-transparent outline-none text-sm w-full placeholder-zinc-600 text-white"
        />
        {query && (
          <button
            onClick={clear}
            aria-label="Cancella ricerca"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {hasResults && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Risultati ricerca utenti"
          className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 max-h-80 overflow-y-auto"
        >
          {results.map((res, i) => (
            <li
              key={res.username}
              id={`${uid}-option-${i}`}
              role="option"
              aria-selected={activeIndex === i}
            >
              <Link
                href={`/profile/${res.username}`}
                onClick={() => { setOpen(false); setQuery('') }}
                className={`flex items-center gap-3 px-5 py-3.5 transition-colors border-b border-zinc-800 last:border-0 ${
                  activeIndex === i ? 'bg-zinc-800' : 'hover:bg-zinc-800'
                }`}
              >
                <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
                  {res.avatar_url ? (
                    <img src={res.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm" aria-hidden="true">
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
            </li>
          ))}
        </ul>
      )}

      {isEmpty && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-500 shadow-2xl"
        >
          Nessun utente trovato per &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  )
}
