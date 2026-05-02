'use client'
// DESTINAZIONE: src/app/onboarding/page.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Zap, Gamepad2, Film, Tv, Check, Layers, Swords, ArrowRight, Sparkles, Users, TrendingUp } from 'lucide-react'
import { SwipeMode } from '@/components/for-you/SwipeMode'
import type { SwipeItem } from '@/components/for-you/SwipeMode'

// ─── Costanti ────────────────────────────────────────────────────────────────

const MEDIA_TYPES = [
  { id: 'anime',  label: 'Anime',       icon: Swords,   color: '#38bdf8', active: 'bg-sky-500/25 border-sky-400 text-sky-200',         inactive: 'bg-sky-500/10 border-sky-500/30 text-zinc-400' },
  { id: 'manga',  label: 'Manga',       icon: Layers,   color: '#f97066', active: 'bg-orange-500/25 border-orange-400 text-orange-200', inactive: 'bg-orange-500/10 border-orange-500/30 text-zinc-400' },
  { id: 'game',   label: 'Videogiochi', icon: Gamepad2, color: '#4ade80', active: 'bg-green-500/25 border-green-400 text-green-200',    inactive: 'bg-green-500/10 border-green-500/30 text-zinc-400' },
  { id: 'tv',     label: 'Serie TV',    icon: Tv,       color: '#a78bfa', active: 'bg-violet-500/25 border-violet-400 text-violet-200', inactive: 'bg-violet-500/10 border-violet-500/30 text-zinc-400' },
  { id: 'movie',  label: 'Film',        icon: Film,     color: '#fb7185', active: 'bg-rose-500/25 border-rose-400 text-rose-200',       inactive: 'bg-rose-500/10 border-rose-500/30 text-zinc-400' },
]

const FEATURES = [
  { icon: Sparkles,   label: 'Raccomandazioni personalizzate basate sui tuoi gusti' },
  { icon: Users,      label: 'Segui amici e scopri cosa stanno guardando' },
  { icon: TrendingUp, label: 'Traccia i progressi su tutti i tuoi media preferiti' },
]

type CategoryKey = 'all' | 'anime' | 'manga' | 'movie' | 'tv' | 'game'

const POOL_QUICK = 15
const POOL_TARGET = 50
const REFILL_THRESHOLD = 20

// ─── Helpers ──────────────────────────────────────────────────────────────────

function recToSwipeItem(r: any): SwipeItem {
  return {
    id: r.id, title: r.title, type: r.type as SwipeItem['type'],
    coverImage: r.coverImage, year: r.year, genres: r.genres || [],
    score: r.score, description: r.description, why: r.why,
    matchScore: r.matchScore || 0, episodes: r.episodes, authors: r.authors,
    developers: r.developers, platforms: r.platforms,
    isAwardWinner: r.isAwardWinner, isDiscovery: r.isDiscovery, source: r.source,
  }
}

// Alterna un item per tipo: [anime[0], manga[0], movie[0], tv[0], game[0], anime[1], ...]
function interleavedMix(byType: Record<string, SwipeItem[]>, limit: number): SwipeItem[] {
  const types = Object.keys(byType).filter(t => byType[t].length > 0)
  const result: SwipeItem[] = []
  let i = 0
  while (result.length < limit) {
    let added = false
    for (const t of types) {
      if (byType[t][i]) { result.push(byType[t][i]); added = true }
      if (result.length >= limit) break
    }
    if (!added) break
    i++
  }
  return result
}

async function fetchCategoryTitles(
  category: CategoryKey,
  selectedTypes: string[],
  globalSeenIds: Set<string>,
  limit: number = POOL_TARGET
): Promise<SwipeItem[]> {
  // Usa il fast path dedicato all'onboarding (bypassa il Taste Engine V5)
  const params = new URLSearchParams()
  if (category === 'all' && selectedTypes.length > 0) {
    params.set('types', selectedTypes.join(','))
  } else if (category !== 'all') {
    params.set('types', category)
  }
  try {
    const res = await fetch(`/api/recommendations/onboarding?${params.toString()}`)
    if (!res.ok) return []
    const json = await res.json()
    if (category === 'all') {
      const byType: Record<string, SwipeItem[]> = {}
      for (const [type, items] of Object.entries(json.recommendations || {})) {
        byType[type] = (items as any[])
          .filter((r: any) => !globalSeenIds.has(r.id))
          .sort(() => Math.random() - 0.4)
          .map(recToSwipeItem)
      }
      return interleavedMix(byType, limit)
    } else {
      let recs = (json.recommendations?.[category] || []) as any[]
      if (recs.length === 0) {
        recs = (Object.values(json.recommendations || {}) as any[][])
          .flat().filter((r: any) => r.type === category)
      }
      return recs.sort(() => Math.random() - 0.4)
        .filter((r: any) => !globalSeenIds.has(r.id))
        .slice(0, limit).map(recToSwipeItem)
    }
  } catch { return [] }
}

function setOnboardingCookie() {
  const maxAge = 60 * 60 * 24 * 365
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `geekore_onboarding_done=1; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
}

// ─── StepBar — progress bar lineare ──────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100)
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
          Passo {current + 1} di {total}
        </span>
        <span className="text-[11px] font-bold" style={{ color: '#E6FF3D' }}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden w-full">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: '#E6FF3D' }}
        />
      </div>
    </div>
  )
}

// ─── BrandPanel (colonna sinistra su desktop) ─────────────────────────────────

function BrandPanel({ step }: { step: number }) {
  const headlines = [
    { lines: ['Il tuo universo geek,', 'finalmente unificato.'] },
    { lines: ['Cosa ami', 'di più?'] },
  ]
  const subs = [
    'Anime, manga, videogiochi, film e serie TV in un solo posto. Condividi progressi e scopri nuovi titoli.',
    'Seleziona i media che ti interessano: personalizziamo feed e raccomandazioni solo per te.',
  ]
  const h = headlines[Math.min(step, headlines.length - 1)]
  const sub = subs[Math.min(step, subs.length - 1)]

  return (
    <div className="relative w-full h-full flex flex-col justify-between px-14 xl:px-20 py-14 overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none" style={{ background: "rgba(230,255,61,0.05)" }} />
      <div className="absolute -bottom-32 -right-10 w-96 h-96 bg-fuchsia-600/10 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute top-1/2 -translate-y-1/2 left-1/3 w-60 h-60 bg-sky-500/8 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative z-10 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#E6FF3D' }}>
          <Zap size={22} className="text-black" />
        </div>
        <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
      </div>

      <div className="relative z-10 space-y-7">
        <h2 key={step} className="text-4xl xl:text-5xl font-black tracking-tight leading-[1.1] text-white">
          {h.lines.map((line, li) => (
            <span key={li} className={`block ${li === h.lines.length - 1 ? 'text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400' : ''}`}>
              {line}
            </span>
          ))}
        </h2>
        <p className="text-zinc-400 text-lg leading-relaxed max-w-[340px]">{sub}</p>

        {step === 0 && (
          <div className="space-y-4 pt-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.2)' }}>
                  <Icon size={17} style={{ color: '#E6FF3D' }} />
                </div>
                <span className="text-zinc-300 text-sm leading-relaxed pt-1">{label}</span>
              </div>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {MEDIA_TYPES.map(({ id, label, icon: Icon, color }) => (
              <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <Icon size={14} style={{ color }} />
                <span className="text-zinc-500 text-sm">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="relative z-10 text-xs text-zinc-800">© {new Date().getFullYear()} Geekore</p>
    </div>
  )
}

// ─── OnboardingPage ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const [poolReady, setPoolReady] = useState(false)
  const [swipePool, setSwipePool] = useState<SwipeItem[]>([])

  const skippedItemsRef = useRef<SwipeItem[]>([])
  const acceptedItemsRef = useRef<Map<string, { item: SwipeItem; rating: number | null }>>(new Map())
  // Traccia item aggiunti alla wishlist durante l'onboarding per poterli revertare con undo
  const wishlistItemsRef = useRef<Set<string>>(new Set())

  // ─── Helpers Supabase (stessa logica di for-you) ──────────────────────────

  const getQueueTable = (filter: string) => {
    const map: Record<string, string> = {
      all: 'swipe_queue_all', anime: 'swipe_queue_anime', manga: 'swipe_queue_manga',
      movie: 'swipe_queue_movie', tv: 'swipe_queue_tv', game: 'swipe_queue_game',
    }
    return map[filter] ?? 'swipe_queue_all'
  }

  const rowToSwipeItem = (row: any): SwipeItem => ({
    id: row.external_id, title: row.title, type: row.type as SwipeItem['type'],
    coverImage: row.cover_image, year: row.year, genres: row.genres || [],
    score: row.score, description: row.description, why: row.why,
    matchScore: row.match_score || 0, episodes: row.episodes,
    authors: row.authors, developers: row.developers, platforms: row.platforms,
    isAwardWinner: row.is_award_winner, isDiscovery: row.is_discovery, source: row.source,
  })

  const toQueueRow = (r: any, uid: string) => ({
    user_id: uid, external_id: r.id, title: r.title, type: r.type,
    cover_image: r.coverImage || r.cover_image, year: r.year, genres: r.genres || [],
    score: r.score ?? null, description: r.description ?? null, why: r.why ?? null,
    match_score: r.matchScore || 0, episodes: r.episodes ?? null,
    authors: r.authors || [], developers: r.developers || [], platforms: r.platforms || [],
    is_award_winner: r.isAwardWinner || false, is_discovery: r.isDiscovery || false,
    source: r.source ?? null,
  })

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      userIdRef.current = user.id
    })
  }, []) // eslint-disable-line

  // Preload 3 fasi — ora scrive su Supabase invece del cache in-memory
  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const uid = user.id

      // FASE 1: 15 "Tutti" → swipe_queue_all → sblocca bottone
      const quickAll = await fetchCategoryTitles('all', [], new Set(), POOL_QUICK)
      if (quickAll.length > 0) {
        const rows = quickAll.map(i => toQueueRow(i, uid))
        await fetch('/api/swipe/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue: 'all', rows }),
        }).catch(() => null)
        setSwipePool(quickAll)
        setPoolReady(true)
      }

      // FASE 2: 15 per ogni categoria specifica in sequenza
      const specificTypes: CategoryKey[] = ['anime', 'manga', 'movie', 'tv', 'game']
      for (const cat of specificTypes) {
        const items = await fetchCategoryTitles(cat, [], new Set(), POOL_QUICK)
        if (items.length > 0) {
          const rows = items.map(i => toQueueRow(i, uid))
          await fetch('/api/swipe/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queue: cat, rows }),
          }).catch(() => null)
        }
      }

      // FASE 3: porta ogni categoria a 50 in background (fire-and-forget, sequenziale)
      for (const cat of specificTypes) {
        fetchCategoryTitles(cat, [], new Set(), POOL_TARGET).then(async items => {
          if (items.length === 0) return
          const rows = items.map(i => toQueueRow(i, uid))
          await fetch('/api/swipe/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queue: cat, rows }),
          }).catch(() => null)
        }).catch(() => {})
      }
      // Top-up "all" in background
      fetchCategoryTitles('all', [], new Set(), POOL_TARGET).then(async items => {
        if (items.length === 0) return
        const rows = items.map(i => toQueueRow(i, uid))
        await fetch('/api/swipe/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue: 'all', rows }),
        }).catch(() => null)
      }).catch(() => {})
    }
    run()
  }, []) // eslint-disable-line

  const toggleType = (id: string) =>
    setSelectedTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])

  const handleOnboardingSeen = useCallback((item: SwipeItem, rating: number | null, skipPersist = false) => {
    if (skipPersist) return
    // Salva in coda pendente — non scrive subito per permettere l'undo
    acceptedItemsRef.current.set(item.id, { item, rating })
  }, [])

  // Undo: rimuove l'item da acceptedItemsRef e da wishlistItemsRef — ISTANTANEO
  const handleOnboardingUndo = useCallback((item: SwipeItem) => {
    acceptedItemsRef.current.delete(item.id)
    // Se era uno skip (non accepted), rimuovilo dalla lista skipped
    skippedItemsRef.current = skippedItemsRef.current.filter(i => i.id !== item.id)
  }, [])

  // Undo wishlist: rimuove da wishlistItemsRef — ISTANTANEO (nessuna scrittura Supabase da revertare
  // perché nell'onboarding la wishlist viene scritta solo al completeOnboarding)
  const handleOnboardingUndoWishlist = useCallback((item: SwipeItem) => {
    wishlistItemsRef.current.delete(item.id)
    acceptedItemsRef.current.delete(item.id)
  }, [])

  const handleOnboardingSkip = useCallback((item: SwipeItem) => {
    // Se era in coda come accettato (undo → skip) rimuovilo
    acceptedItemsRef.current.delete(item.id)
    wishlistItemsRef.current.delete(item.id)
    skippedItemsRef.current.push(item)
  }, [])

  // Refill identico a handleSwipeRequestMore di for-you — usa swipe_queue_* su Supabase
  const handleOnboardingRequestMore = useCallback(async (filter: string = 'all'): Promise<SwipeItem[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const uid = user.id

    const table = getQueueTable(filter)
    const TARGET = 50
    const REFILL_TRIGGER = 20

    // Leggi skipped
    const { data: skippedRows } = await supabase.from('swipe_skipped').select('external_id').eq('user_id', uid)
    const skippedSet = new Set((skippedRows || []).map((r: any) => r.external_id as string))

    // Leggi card in coda
    const { data: queueRows } = await supabase.from(table).select('*').eq('user_id', uid).order('inserted_at', { ascending: true })
    const existingRows = (queueRows || []).filter((r: any) => !skippedSet.has(r.external_id))
    const existingIds = new Set(existingRows.map((r: any) => r.external_id as string))

    // Se ho già abbastanza card, ritorna quelle esistenti
    if (existingRows.length >= REFILL_TRIGGER) return existingRows.map(rowToSwipeItem)

    // Rinfoltisci via fast-path onboarding
    try {
      const items = await fetchCategoryTitles(filter as CategoryKey, selectedTypes, skippedSet, TARGET)
      const newItems = items
        .filter(i =>
          !skippedSet.has(i.id) &&
          !existingIds.has(i.id) &&
          !acceptedItemsRef.current.has(i.id)
        )
        .slice(0, TARGET - existingRows.length)
      if (newItems.length > 0) {
        const rows = newItems.map(i => toQueueRow(i, uid))
        await fetch('/api/swipe/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue: filter === 'all' ? 'all' : filter, rows }),
        }).catch(() => null)
      }
      return [...existingRows.map(rowToSwipeItem), ...newItems]
    } catch {
      return existingRows.map(rowToSwipeItem)
    }
  }, [supabase, selectedTypes])

  const completeOnboarding = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) return

    // Scrivi tutti gli accepted in batch (esclusi quelli poi skippati via undo)
    const accepted = Array.from(acceptedItemsRef.current.values()).map(({ item, rating }) => ({ item, rating }))

    const wishlist = Array.from(wishlistItemsRef.current)
      .map(id => acceptedItemsRef.current.get(id)?.item ?? skippedItemsRef.current.find(i => i.id === id))
      .filter(Boolean)

    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accepted,
        wishlist,
        skipped: skippedItemsRef.current,
        selected_types: selectedTypes,
      }),
    }).catch(() => null)
    if (!res?.ok) return

    // Update critico — onboarding_done separato da preferred_types per sicurezza
    setOnboardingCookie()
    fetch('/api/recommendations?refresh=1&onboarding=1').catch(() => {})
    router.push('/home')
  }, [userId, selectedTypes, router])

  const goToSwipe = useCallback(() => {
    setStep(2)
  }, [])

  // Step 2: SwipeMode
  if (step === 2) {
    return (
      <SwipeMode
        items={swipePool}
        onSeen={handleOnboardingSeen}
        onSkip={handleOnboardingSkip}
        onClose={completeOnboarding}
        onRequestMore={handleOnboardingRequestMore}
        isOnboarding
        onOnboardingComplete={completeOnboarding}
        onUndo={handleOnboardingUndo}
        onUndoWishlist={handleOnboardingUndoWishlist}
      />
    )
  }

  // Step 0 + 1: layout fullscreen due colonne
  return (
    <div className="w-full min-h-screen flex">

      {/* Colonna sinistra branding — solo lg+ */}
      <div className="hidden lg:block lg:w-[46%] xl:w-[50%] border-r border-zinc-800/50 shrink-0">
        <div className="sticky top-0 h-screen">
          <BrandPanel step={step} />
        </div>
      </div>

      {/* Colonna destra — contenuto */}
      <div className="flex-1 flex flex-col items-center justify-center px-7 sm:px-12 lg:px-14 xl:px-20 py-12">

        {/* Logo mobile */}
        <div className="lg:hidden flex items-center gap-3 mb-10 self-start">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#E6FF3D' }}>
            <Zap size={20} className="text-black" />
          </div>
          <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <StepDots current={step} total={2} />
          </div>

          {/* ── Step 0 ── */}
          {step === 0 && (
            <>
              {/* Headline solo mobile */}
              <div className="lg:hidden mb-8">
                <h1 className="text-4xl font-black tracking-tight leading-tight text-white mb-3">
                  Il tuo universo geek,{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                    finalmente unificato.
                  </span>
                </h1>
                <p className="text-zinc-400">Anime, manga, videogiochi, film e serie in un solo posto.</p>
              </div>
              <div className="lg:hidden space-y-3 mb-8">
                {FEATURES.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.2)' }}>
                      <Icon size={15} style={{ color: '#E6FF3D' }} />
                    </div>
                    <span className="text-zinc-300 text-sm leading-relaxed pt-1">{label}</span>
                  </div>
                ))}
              </div>

              {/* Titolo desktop */}
              <div className="hidden lg:block mb-8">
                <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">Cominciamo <Sparkles size={26} style={{ color: '#E6FF3D' }} /></h1>
                <p className="text-zinc-400">Ci vorranno meno di 2 minuti.</p>
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full py-4 rounded-2xl font-semibold text-lg transition-all flex items-center justify-center gap-2"
                style={{ background: '#E6FF3D', color: '#0B0B0F' }}
              >
                Inizia <ArrowRight size={20} />
              </button>

            </>
          )}

          {/* ── Step 1 ── */}
          {step === 1 && (
            <>
              <div className="mb-7">
                <h1 className="text-3xl font-bold text-white mb-2">Cosa tracci?</h1>
                <p className="text-zinc-400">Seleziona i media che ti interessano.</p>
              </div>
              {/* Riga 1: 3 bottoni */}
              <div className="flex gap-3 mb-3">
                {MEDIA_TYPES.slice(0, 3).map(({ id, label, icon: Icon, color, active, inactive }) => {
                  const sel = selectedTypes.includes(id)
                  return (
                    <button key={id} onClick={() => toggleType(id)}
                      className={`relative flex-1 flex items-center gap-2 p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${sel ? active : inactive}`}
                    >
                      <Icon size={19} style={sel ? { color } : {}} />
                      <span className="font-medium text-sm">{label}</span>
                      {sel && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#E6FF3D' }}>
                          <Check size={11} className="text-black" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              {/* Riga 2: 2 bottoni centrati — allineati ai gap della riga sopra */}
              <div className="flex gap-3 mb-7">
                <div className="flex-1" />
                {MEDIA_TYPES.slice(3).map(({ id, label, icon: Icon, color, active, inactive }) => {
                  const sel = selectedTypes.includes(id)
                  return (
                    <button key={id} onClick={() => toggleType(id)}
                      className={`relative flex-[2] flex items-center gap-2 p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${sel ? active : inactive}`}
                    >
                      <Icon size={19} style={sel ? { color } : {}} />
                      <span className="font-medium text-sm">{label}</span>
                      {sel && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#E6FF3D' }}>
                          <Check size={11} className="text-black" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  )
                })}
                <div className="flex-1" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(0)}
                  className="px-5 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl font-medium transition-all text-zinc-300 text-sm">
                  Indietro
                </button>
                <button onClick={goToSwipe} disabled={!poolReady}
                  className="flex-1 py-4 disabled:opacity-50 disabled:cursor-wait rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
                  style={{ background: '#E6FF3D', color: '#0B0B0F' }}>
                  {!poolReady ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Caricamento titoli…</>
                  ) : (
                    <>Scopri i titoli <ArrowRight size={18} /></>
                  )}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
