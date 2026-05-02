'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, Filter, Loader2, Search, Tag, X } from 'lucide-react'
import { gestureState } from '@/hooks/gestureState'
import { CategoryIcon, MACRO_CATEGORIES, parseCategoryString } from '@/components/feed/CategoryBasics'

const QUICK_SUBS: Record<string, string[]> = {
  'Film': ['Azione', 'Commedia', 'Horror', 'Fantascienza', 'Animazione'],
  'Serie TV': ['Drama', 'Commedia', 'Thriller', 'Fantascienza', 'Reality'],
  'Videogiochi': ['RPG', 'FPS', 'Battle Royale', 'Strategia', 'Indie'],
  'Anime': ['Shonen', 'Shojo', 'Seinen', 'Isekai', 'Slice of Life'],
  'Manga': ['Shonen', 'Shojo', 'Seinen', 'Josei', 'Webtoon'],
  'Giochi da tavolo': ['Eurogame', 'Cooperativo', 'Astratto', 'Family', 'Deck Building'],
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function rankByQuery(items: SearchResult[], query: string): SearchResult[] {
  if (query.length < 2) return items
  const q = normalize(query)
  const starts: SearchResult[] = []
  const contains: SearchResult[] = []
  for (const item of items) {
    const t = normalize(item.title)
    if (t.startsWith(q)) starts.push(item)
    else if (t.includes(q)) contains.push(item)
  }
  return [...starts, ...contains]
}

type SearchResult = { id: string; title: string; subtitle?: string; image?: string }

async function searchByCategory(category: string, query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return []
  const q = encodeURIComponent(query.trim())

  try {
    if (category === 'Film') {
      const res = await fetch(`/api/tmdb?q=${q}&type=movie`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : []
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.title),
        title: item.title || item.name || '',
        subtitle: item.year ? String(item.year) : item.releaseDate?.slice(0, 4),
        image: item.coverImage || item.poster || item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Serie TV') {
      const res = await fetch(`/api/tmdb?q=${q}&type=tv`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : []
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.title),
        title: item.title || item.name || '',
        subtitle: item.year ? String(item.year) : item.releaseDate?.slice(0, 4),
        image: item.coverImage || item.poster || item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Videogiochi') {
      const res = await fetch(`/api/igdb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: query.trim(), limit: 8 }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.games || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.name),
        title: item.name || item.title || '',
        subtitle: item.first_release_date ? new Date(item.first_release_date * 1000).getFullYear().toString()
          : item.year ? String(item.year) : undefined,
        image: item.cover?.url ? `https:${item.cover.url.replace('t_thumb', 't_cover_small')}` : item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Anime' || category === 'Manga') {
      const type = category === 'Anime' ? 'anime' : 'manga'
      const res = await fetch(`/api/anilist?search=${q}&type=${type}&lang=it`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.media || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id),
        title: item.title || item.title?.english || item.title?.romaji || '',
        subtitle: item.year ? String(item.year) : item.seasonYear ? String(item.seasonYear) : undefined,
        image: item.coverImage || item.coverImage?.large || item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Giochi da tavolo') {
      const res = await fetch(`/api/bgg?q=${q}`, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : []
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id),
        title: item.title || '',
        subtitle: item.year ? String(item.year) : undefined,
        image: item.coverImage,
      })).filter((i: SearchResult) => i.title)
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.warn('[CategorySearch] fetch error:', err)
  }
  return []
}

export function CategorySelector({ value, onChange, alwaysExpanded = false }: {
  value: string; onChange: (val: string) => void; alwaysExpanded?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'macro' | 'search'>('macro')
  const [selectedCat, setSelectedCat] = useState('')
  const [subInput, setSubInput] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openAboveRef = useRef(false)
  const [openAbove, setOpenAbove] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return
    if (open) {
      document.body.style.overflow = 'hidden'
      gestureState.drawerActive = true
    } else {
      document.body.style.overflow = ''
      gestureState.drawerActive = false
    }
    return () => { document.body.style.overflow = ''; gestureState.drawerActive = false }
  }, [open])

  const API_CATEGORIES = new Set(['Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Giochi da tavolo'])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        const portalPanel = document.getElementById('category-portal-panel')
        if (!portalPanel || !portalPanel.contains(target)) setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && step === 'search') setTimeout(() => inputRef.current?.focus(), 60)
  }, [open, step])

  useEffect(() => {
    if (!selectedCat || !API_CATEGORIES.has(selectedCat) || step !== 'search') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!subInput.trim() || subInput.trim().length < 2) { setSuggestions([]); setIsSearching(false); return }
    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      const results = await searchByCategory(selectedCat, subInput)
      setSuggestions(rankByQuery(results, subInput.trim())); setIsSearching(false); setActiveSuggestion(-1)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [subInput, selectedCat, step])

  const openDropup = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const isMobile = window.innerWidth < 768

    if (isMobile) {
      const above = rect.top + rect.height / 2 > window.innerHeight / 2
      openAboveRef.current = above
      setOpenAbove(above)
      setPanelPos({ top: rect.bottom + (above ? 0 : 8), left: 12 })
    } else {
      const left = rect.right + 6
      const triggerMidY = rect.top + rect.height / 2
      const above = triggerMidY > window.innerHeight / 2
      const top = above ? rect.bottom : rect.top
      openAboveRef.current = above
      setOpenAbove(above)
      setPanelPos({ top, left })
    }
    setOpen(true)
    setStep('macro')
  }
  const close = () => { setOpen(false); setSubInput(''); setSuggestions([]) }

  const selectMacro = (cat: string) => {
    setSelectedCat(cat); setSubInput(''); setSuggestions([]); setStep('search')
  }

  const selectSuggestion = (result: SearchResult) => {
    onChange(`${selectedCat}:${result.title}`); close()
  }

  const clearValue = () => { setSelectedCat(''); setSubInput(''); setSuggestions([]); onChange(''); close() }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeSuggestion >= 0) selectSuggestion(suggestions[activeSuggestion]) }
    else if (e.key === 'Escape') close()
  }

  const parsed = parseCategoryString(value)
  const hasApiSupport = API_CATEGORIES.has(selectedCat)

  const searchPlaceholder = selectedCat === 'Film' ? 'Cerca un film...'
    : selectedCat === 'Serie TV' ? 'Cerca una serie...'
    : selectedCat === 'Videogiochi' ? 'Cerca un videogioco...'
    : selectedCat === 'Anime' ? 'Cerca un anime...'
    : selectedCat === 'Manga' ? 'Cerca un manga...'
    : selectedCat === 'Giochi da tavolo' ? 'Cerca un boardgame...'
    : 'Cerca un titolo...'

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={value ? clearValue : openDropup}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium border transition-all ${
          value
            ? 'bg-zinc-800 border-zinc-600 hover:border-red-500/40 hover:text-red-400'
            : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'
        }`}
        style={value ? { color: 'var(--accent)' } : {}}
      >
        <Tag size={14} strokeWidth={1.6} />
        {value ? (
          <span className="flex items-center gap-1 min-w-0 max-w-[130px]">
            <CategoryIcon category={parsed?.category || ''} size={12} className="flex-shrink-0" />
            <span className="truncate">{parsed?.subcategory ? parsed.subcategory.trim() : parsed?.category}</span>
            <X size={11} className="flex-shrink-0 ml-0.5" />
          </span>
        ) : (
          <span>Medium / titolo</span>
        )}
      </button>

      {open && mounted && typeof document !== 'undefined' && createPortal(
        <div
          id="category-portal-panel"
          data-no-swipe
          className="fixed z-[10000] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden"
          style={{ top: panelPos.top, left: panelPos.left, width: '300px', transform: openAboveRef.current ? 'translateY(-100%)' : 'none' }}
        >
          {step === 'macro' && (
            <div className={`p-3 flex flex-col ${openAboveRef.current ? 'flex-col-reverse' : ''}`}>
              <div className={`flex items-center justify-between ${openAboveRef.current ? 'mb-1' : 'mb-2.5'}`}>
                <span className={`text-[11px] font-semibold text-zinc-500 uppercase tracking-wider ${openAboveRef.current ? 'mt-3' : ''}`}>Scegli medium</span>
                <button type="button" onClick={close} className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"><X size={13} /></button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                {MACRO_CATEGORIES.slice(0, 3).map(cat => (
                  <button key={cat} type="button" onClick={() => selectMacro(cat)}
                    className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl bg-zinc-800/60 border border-zinc-700/60 hover:bg-zinc-800 hover:border-zinc-600 transition-all group">
                    <CategoryIcon category={cat} size={18} className="text-zinc-400 group-hover:text-white transition-colors" />
                    <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white leading-tight text-center">{cat}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MACRO_CATEGORIES.slice(3).map(cat => (
                  <button key={cat} type="button" onClick={() => selectMacro(cat)}
                    className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl bg-zinc-800/60 border border-zinc-700/60 hover:bg-zinc-800 hover:border-zinc-600 transition-all group">
                    <CategoryIcon category={cat} size={18} className="text-zinc-400 group-hover:text-white transition-colors" />
                    <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white leading-tight text-center">{cat}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'search' && (() => {
            const header = (
              <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={() => { setStep('macro'); setSuggestions([]) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all flex-shrink-0">
                  <ArrowLeft size={13} />
                </button>
                <CategoryIcon category={selectedCat} size={14} className="flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-semibold text-white flex-1 truncate">{selectedCat}</span>
                <button type="button" onClick={close} className="text-zinc-600 hover:text-zinc-400 p-0.5"><X size={13} /></button>
              </div>
            )
            const inputEl = (
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={subInput}
                  onChange={e => setSubInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={hasApiSupport ? searchPlaceholder : 'Titolo specifico...'}
                  className="no-nav-hide w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-600 focus:outline-none rounded-xl pl-8 pr-8 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none transition"
                />
                {isSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--accent)' }} />}
                {!isSearching && subInput && (
                  <button type="button" onClick={() => setSubInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                    <X size={13} />
                  </button>
                )}
              </div>
            )
            const results = suggestions.length > 0 ? (
              <div className="rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-950 max-h-[200px] overflow-y-auto overscroll-contain mb-2">
                {suggestions.map((result, idx) => (
                  <button key={result.id} type="button" onClick={() => selectSuggestion(result)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-zinc-800/60 last:border-0 transition-colors ${
                      idx === activeSuggestion ? 'bg-zinc-700/40' : 'hover:bg-zinc-800/80'
                    }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate">{result.title}</p>
                      {result.subtitle && <p className="text-[11px] text-zinc-500">{result.subtitle}</p>}
                    </div>
                  </button>
                ))}
              </div>
            ) : null
            const usaLibero = subInput.trim() && !isSearching ? (
              <button type="button" onClick={() => { onChange(`${selectedCat}:${subInput.trim()}`); close() }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition mb-2"
                style={{ background: 'rgba(230,255,61,0.1)', border: '1px solid rgba(230,255,61,0.25)', color: 'var(--accent)' }}>
                <Check size={13} />
                Usa <strong className="font-semibold">"{subInput.trim()}"</strong>
              </button>
            ) : null
            const nessunRis = hasApiSupport && subInput.length >= 2 && !isSearching && suggestions.length === 0 ? (
              <p className="text-[12px] text-zinc-600 text-center py-2">Nessun risultato</p>
            ) : null
            const chips = !hasApiSupport && !subInput ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(QUICK_SUBS[selectedCat] || []).map(sub => (
                  <button key={sub} type="button" onClick={() => { onChange(`${selectedCat}:${sub}`); close() }}
                    className="px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700/80 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-white transition-all">
                    {sub}
                  </button>
                ))}
              </div>
            ) : null
            const usaSoloMacro = (
              <button type="button" onClick={() => { onChange(selectedCat); close() }}
                className="mt-1 w-full text-center text-[12px] text-zinc-600 hover:text-zinc-400 transition py-1">
                Usa solo medium "{selectedCat}"
              </button>
            )
            return openAboveRef.current ? (
              <div className="p-3">
                {usaSoloMacro}{results}{usaLibero}{nessunRis}{chips}{inputEl}{header}
              </div>
            ) : (
              <div className="p-3">
                {header}{inputEl}{results}{usaLibero}{nessunRis}{chips}{usaSoloMacro}
              </div>
            )
          })()}
        </div>
        , document.body
      )}
    </div>
  )
}

export function CategoryFilter({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string
  onFilterChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [activeMacro, setActiveMacro] = useState('')
  const [subSearch, setSubSearch] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const API_CATEGORIES = new Set(['Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Giochi da tavolo'])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!activeMacro || !API_CATEGORIES.has(activeMacro)) { setSuggestions([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!subSearch.trim() || subSearch.trim().length < 2) { setSuggestions([]); setIsSearching(false); return }
    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      const results = await searchByCategory(activeMacro, subSearch)
      setSuggestions(rankByQuery(results, subSearch.trim()))
      setIsSearching(false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [subSearch, activeMacro])

  const handleMacro = (cat: string) => {
    if (activeMacro === cat) { setActiveMacro(''); setSubSearch(''); setSuggestions([]) }
    else { setActiveMacro(cat); setSubSearch(''); setSuggestions([]) }
  }

  const applyFilter = (val: string) => { onFilterChange(val); setOpen(false) }

  const parsed = parseCategoryString(activeFilter)
  const displayLabel = activeFilter
    ? (parsed?.subcategory ? parsed.subcategory.trim() : parsed?.category || 'Filtra medium')
    : 'Filtra medium'

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold border transition-all max-w-[160px] sm:max-w-none ${
          activeFilter ? 'border-[rgba(230,255,61,0.4)] text-[var(--accent)]' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
        }`}>
        <Filter size={14} className="flex-shrink-0" />
        {activeFilter && <CategoryIcon category={parsed?.category || ''} size={13} className="flex-shrink-0" />}
        <span className="truncate">{displayLabel}</span>
        {activeFilter && (
          <span onClick={e => { e.stopPropagation(); applyFilter(''); setActiveMacro(''); setSubSearch('') }} className="ml-1 hover:text-red-400 transition-colors">
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute top-auto sm:top-full left-0 right-0 sm:left-auto sm:right-auto bottom-0 sm:bottom-auto mt-0 sm:mt-2 bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl shadow-2xl shadow-black/60 w-full sm:w-[300px] p-3 pb-6 sm:pb-3" style={{ zIndex: 20000 }}>
          <p className="text-[10px] text-zinc-500 font-semibold px-1 pb-2 uppercase tracking-wider">Filtra per medium</p>

          <div className="mb-3">
            <div className="grid grid-cols-3 gap-1.5 mb-1.5">
              {MACRO_CATEGORIES.slice(0, 3).map(cat => (
                <button key={cat} onClick={() => handleMacro(cat)}
                  className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    activeMacro === cat
                      ? 'border-[rgba(230,255,61,0.5)] text-[var(--accent)]'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}>
                  <CategoryIcon category={cat} size={11} />
                  {cat}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MACRO_CATEGORIES.slice(3).map(cat => (
                <button key={cat} onClick={() => handleMacro(cat)}
                  className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    activeMacro === cat
                      ? 'border-[rgba(230,255,61,0.5)] text-[var(--accent)]'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}>
                  <CategoryIcon category={cat} size={11} />
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {activeMacro && (
            <>
              <button onClick={() => applyFilter(activeMacro)}
                className="w-full text-left px-3 py-2 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition mb-2">
                Tutte le activity di <strong>{activeMacro}</strong>
              </button>

              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  autoFocus
                  type="text"
                  value={subSearch}
                  onChange={e => setSubSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && subSearch.trim()) applyFilter(`${activeMacro}:${subSearch.trim()}`) }}
                  placeholder={`Cerca titolo in ${activeMacro}...`}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 transition"
                />
                {isSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--accent)' }} />}
              </div>

              {suggestions.length > 0 && (
                <div className="rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-950 max-h-[200px] overflow-y-auto overscroll-contain mb-2">
                  {suggestions.map(result => (
                    <button key={result.id} onClick={() => applyFilter(`${activeMacro}:${result.title}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/80 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">{result.title}</p>
                        {result.subtitle && <p className="text-[11px] text-zinc-500">{result.subtitle}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {subSearch.trim() && !isSearching && (
                <button onClick={() => applyFilter(`${activeMacro}:${subSearch.trim()}`)}
                  className="w-full px-3 py-2 rounded-xl text-sm font-semibold transition"
                  style={{ background: 'rgba(230,255,61,0.1)', border: '1px solid rgba(230,255,61,0.25)', color: 'var(--accent)' }}>
                  Cerca «{subSearch.trim()}» in {activeMacro}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
