'use client'
// DESTINAZIONE: src/app/onboarding/page.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Zap, Gamepad2, Film, Tv, Check, Layers, Swords, ArrowRight, Sparkles, Users, TrendingUp, UploadCloud } from 'lucide-react'
import { SwipeMode } from '@/components/for-you/SwipeMode'
import type { SwipeItem } from '@/components/for-you/SwipeMode'

const MEDIA_TYPES = [
  { id: 'anime',  label: 'Anime',       icon: Swords,   color: '#38bdf8', active: 'bg-sky-500/25 border-sky-400 text-sky-200',         inactive: 'bg-sky-500/10 border-sky-500/30 text-zinc-400' },
  { id: 'manga',  label: 'Manga',       icon: Layers,   color: '#f97066', active: 'bg-orange-500/25 border-orange-400 text-orange-200', inactive: 'bg-orange-500/10 border-orange-500/30 text-zinc-400' },
  { id: 'game',   label: 'Videogiochi', icon: Gamepad2, color: '#4ade80', active: 'bg-green-500/25 border-green-400 text-green-200',    inactive: 'bg-green-500/10 border-green-500/30 text-zinc-400' },
  { id: 'tv',     label: 'Serie TV',    icon: Tv,       color: '#a78bfa', active: 'bg-violet-500/25 border-violet-400 text-violet-200', inactive: 'bg-violet-500/10 border-violet-500/30 text-zinc-400' },
  { id: 'movie',  label: 'Film',        icon: Film,     color: '#fb7185', active: 'bg-rose-500/25 border-rose-400 text-rose-200',       inactive: 'bg-rose-500/10 border-rose-500/30 text-zinc-400' },
]

const IMPORT_SOURCES = [
  { id: 'anilist', label: 'AniList', detail: 'Anime e manga già visti', href: '/profile/me?import=anilist', icon: Swords, color: 'var(--type-anime)' },
  { id: 'mal', label: 'MyAnimeList', detail: 'Anime list storica', href: '/profile/me?import=mal', icon: Layers, color: 'var(--type-manga)' },
  { id: 'steam', label: 'Steam', detail: 'Ore giocate e libreria PC', href: '/profile/me?import=steam', icon: Gamepad2, color: 'var(--type-game)' },
  { id: 'letterboxd', label: 'Letterboxd', detail: 'Film e rating', href: '/profile/me?import=letterboxd', icon: Film, color: 'var(--type-movie)' },
  { id: 'bgg', label: 'BoardGameGeek', detail: 'Boardgame collection', href: '/profile/me?import=bgg', icon: UploadCloud, color: 'var(--type-board)' },
]

const FEATURES = [
  { icon: Sparkles,   label: 'Raccomandazioni personalizzate basate sui tuoi gusti' },
  { icon: Users,      label: 'Segui amici e scopri cosa stanno guardando' },
  { icon: TrendingUp, label: 'Traccia i progressi su tutti i tuoi media preferiti' },
]

type CategoryKey = 'all' | 'anime' | 'manga' | 'movie' | 'tv' | 'game'

const POOL_QUICK = 15
const POOL_TARGET = 50

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

async function fetchCategoryTitles(category: CategoryKey, selectedTypes: string[], globalSeenIds: Set<string>, limit: number = POOL_TARGET): Promise<SwipeItem[]> {
  const params = new URLSearchParams()
  if (category === 'all' && selectedTypes.length > 0) params.set('types', selectedTypes.join(','))
  else if (category !== 'all') params.set('types', category)
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
    }
    let recs = (json.recommendations?.[category] || []) as any[]
    if (recs.length === 0) recs = (Object.values(json.recommendations || {}) as any[][]).flat().filter((r: any) => r.type === category)
    return recs.sort(() => Math.random() - 0.4).filter((r: any) => !globalSeenIds.has(r.id)).slice(0, limit).map(recToSwipeItem)
  } catch { return [] }
}

function setOnboardingCookie() {
  const maxAge = 60 * 60 * 24 * 365
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `geekore_onboarding_done=1; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
}

function StepDots({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100)
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Passo {current + 1} di {total}</span>
        <span className="text-[11px] font-bold" style={{ color: 'var(--accent)' }}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  )
}

function BrandPanel({ step }: { step: number }) {
  const copy = [
    { title: ['Il tuo universo geek,', 'finalmente unificato.'], sub: 'Anime, manga, videogiochi, film e serie TV in un solo posto. Condividi progressi e scopri nuovi titoli.' },
    { title: ['Scegli i medium', 'che contano.'], sub: 'Partiamo dalle categorie che vuoi davvero tracciare.' },
    { title: ['Importa la storia,', 'non ripartire da zero.'], sub: 'AniList, MAL, Steam, Letterboxd e BGG diventano il tuo cold-start intelligente.' },
    { title: ['Dai 5 segnali', 'forti al DNA.'], sub: 'Valuta, salva o scarta titoli: il feed parte già con una direzione.' },
  ][Math.min(step, 3)]

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden px-14 py-14 xl:px-20">
      <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full blur-[140px] pointer-events-none" style={{ background: 'rgba(230,255,61,0.05)' }} />
      <div className="absolute -bottom-32 -right-10 h-96 w-96 rounded-full blur-[110px] pointer-events-none" style={{ background: 'rgba(230,255,61,0.05)' }} />
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--accent)' }}><Zap size={22} className="text-black" /></div>
        <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
      </div>
      <div className="relative z-10 space-y-7">
        <h2 key={step} className="gk-display max-w-[520px] text-white">
          {copy.title.map((line, i) => <span key={line} className="block" style={i === copy.title.length - 1 ? { color: 'var(--accent)' } : {}}>{line}</span>)}
        </h2>
        <p className="max-w-[380px] text-lg leading-relaxed text-zinc-400">{copy.sub}</p>
        {step === 0 && <div className="space-y-4 pt-2">{FEATURES.map(({ icon: Icon, label }) => <div key={label} className="flex items-start gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.2)' }}><Icon size={17} style={{ color: 'var(--accent)' }} /></div><span className="pt-1 text-sm leading-relaxed text-zinc-300">{label}</span></div>)}</div>}
      </div>
      <p className="relative z-10 text-xs text-zinc-800">© {new Date().getFullYear()} Geekore</p>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [importSkipped, setImportSkipped] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const [poolReady, setPoolReady] = useState(false)
  const [swipePool, setSwipePool] = useState<SwipeItem[]>([])
  const skippedItemsRef = useRef<SwipeItem[]>([])
  const acceptedItemsRef = useRef<Map<string, { item: SwipeItem; rating: number | null }>>(new Map())
  const wishlistItemsRef = useRef<Set<string>>(new Set())

  const getQueueTable = (filter: string) => ({ all: 'swipe_queue_all', anime: 'swipe_queue_anime', manga: 'swipe_queue_manga', movie: 'swipe_queue_movie', tv: 'swipe_queue_tv', game: 'swipe_queue_game' }[filter] ?? 'swipe_queue_all')
  const rowToSwipeItem = (row: any): SwipeItem => ({ id: row.external_id, title: row.title, type: row.type as SwipeItem['type'], coverImage: row.cover_image, year: row.year, genres: row.genres || [], score: row.score, description: row.description, why: row.why, matchScore: row.match_score || 0, episodes: row.episodes, authors: row.authors, developers: row.developers, platforms: row.platforms, isAwardWinner: row.is_award_winner, isDiscovery: row.is_discovery, source: row.source })
  const toQueueRow = (r: any, uid: string) => ({ user_id: uid, external_id: r.id, title: r.title, type: r.type, cover_image: r.coverImage || r.cover_image, year: r.year, genres: r.genres || [], score: r.score ?? null, description: r.description ?? null, why: r.why ?? null, match_score: r.matchScore || 0, episodes: r.episodes ?? null, authors: r.authors || [], developers: r.developers || [], platforms: r.platforms || [], is_award_winner: r.isAwardWinner || false, is_discovery: r.isDiscovery || false, source: r.source ?? null })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id); userIdRef.current = user.id
    })
  }, []) // eslint-disable-line

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const uid = user.id
      const quickAll = await fetchCategoryTitles('all', [], new Set(), POOL_QUICK)
      if (quickAll.length > 0) {
        await fetch('/api/swipe/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queue: 'all', rows: quickAll.map(i => toQueueRow(i, uid)) }) }).catch(() => null)
        setSwipePool(quickAll); setPoolReady(true)
      }
      const specificTypes: CategoryKey[] = ['anime', 'manga', 'movie', 'tv', 'game']
      for (const cat of specificTypes) {
        const items = await fetchCategoryTitles(cat, [], new Set(), POOL_QUICK)
        if (items.length > 0) await fetch('/api/swipe/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queue: cat, rows: items.map(i => toQueueRow(i, uid)) }) }).catch(() => null)
      }
      for (const cat of specificTypes) fetchCategoryTitles(cat, [], new Set(), POOL_TARGET).then(async items => {
        if (items.length) await fetch('/api/swipe/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queue: cat, rows: items.map(i => toQueueRow(i, uid)) }) }).catch(() => null)
      }).catch(() => {})
    }
    run()
  }, []) // eslint-disable-line

  const toggleType = (id: string) => setSelectedTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  const handleOnboardingSeen = useCallback((item: SwipeItem, rating: number | null, skipPersist = false) => { if (!skipPersist) acceptedItemsRef.current.set(item.id, { item, rating }) }, [])
  const handleOnboardingUndo = useCallback((item: SwipeItem) => { acceptedItemsRef.current.delete(item.id); skippedItemsRef.current = skippedItemsRef.current.filter(i => i.id !== item.id) }, [])
  const handleOnboardingUndoWishlist = useCallback((item: SwipeItem) => { wishlistItemsRef.current.delete(item.id); acceptedItemsRef.current.delete(item.id) }, [])
  const handleOnboardingSkip = useCallback((item: SwipeItem) => { acceptedItemsRef.current.delete(item.id); wishlistItemsRef.current.delete(item.id); skippedItemsRef.current.push(item) }, [])

  const handleOnboardingRequestMore = useCallback(async (filter: string = 'all'): Promise<SwipeItem[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const uid = user.id
    const table = getQueueTable(filter)
    const { data: skippedRows } = await supabase.from('swipe_skipped').select('external_id').eq('user_id', uid)
    const skippedSet = new Set((skippedRows || []).map((r: any) => r.external_id as string))
    const { data: queueRows } = await supabase.from(table).select('*').eq('user_id', uid).order('inserted_at', { ascending: true })
    const existingRows = (queueRows || []).filter((r: any) => !skippedSet.has(r.external_id))
    const existingIds = new Set(existingRows.map((r: any) => r.external_id as string))
    if (existingRows.length >= 20) return existingRows.map(rowToSwipeItem)
    const items = await fetchCategoryTitles(filter as CategoryKey, selectedTypes, skippedSet, 50)
    const newItems = items.filter(i => !skippedSet.has(i.id) && !existingIds.has(i.id) && !acceptedItemsRef.current.has(i.id)).slice(0, 50 - existingRows.length)
    if (newItems.length > 0) await fetch('/api/swipe/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queue: filter === 'all' ? 'all' : filter, rows: newItems.map(i => toQueueRow(i, uid)) }) }).catch(() => null)
    return [...existingRows.map(rowToSwipeItem), ...newItems]
  }, [supabase, selectedTypes])

  const completeOnboarding = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) return
    const accepted = Array.from(acceptedItemsRef.current.values()).map(({ item, rating }) => ({ item, rating }))
    const wishlist = Array.from(wishlistItemsRef.current).map(id => acceptedItemsRef.current.get(id)?.item ?? skippedItemsRef.current.find(i => i.id === id)).filter(Boolean)
    const res = await fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accepted, wishlist, skipped: skippedItemsRef.current, selected_types: selectedTypes, import_skipped: importSkipped }) }).catch(() => null)
    if (!res?.ok) return
    setOnboardingCookie(); fetch('/api/recommendations?refresh=1&onboarding=1').catch(() => {}); router.push('/home')
  }, [userId, selectedTypes, importSkipped, router])

  if (step === 3) {
    return <SwipeMode items={swipePool} onSeen={handleOnboardingSeen} onSkip={handleOnboardingSkip} onClose={completeOnboarding} onRequestMore={handleOnboardingRequestMore} isOnboarding onOnboardingComplete={completeOnboarding} onUndo={handleOnboardingUndo} onUndoWishlist={handleOnboardingUndoWishlist} />
  }

  return (
    <div className="flex min-h-screen w-full">
      <div className="hidden shrink-0 border-r border-zinc-800/50 lg:block lg:w-[46%] xl:w-[50%]"><div className="sticky top-0 h-screen"><BrandPanel step={step} /></div></div>
      <div className="flex flex-1 flex-col items-center justify-center px-7 py-12 sm:px-12 lg:px-14 xl:px-20">
        <div className="mb-10 flex items-center gap-3 self-start lg:hidden"><div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: 'var(--accent)' }}><Zap size={20} className="text-black" /></div><span className="text-2xl font-bold tracking-tighter text-white">geekore</span></div>
        <div className="w-full max-w-md">
          <div className="mb-8"><StepDots current={step} total={4} /></div>
          {step === 0 && <><div className="mb-8 lg:hidden"><h1 className="gk-display mb-3 text-white">Il tuo universo geek, <span style={{ color: 'var(--accent)' }}>finalmente unificato.</span></h1><p className="text-zinc-400">Anime, manga, videogiochi, film e serie in un solo posto.</p></div><button type="button" data-no-swipe="true" onClick={() => setStep(1)} className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-semibold transition-all" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>Inizia <ArrowRight size={20} /></button></>}
          {step === 1 && <><div className="mb-7"><h1 className="gk-title mb-2 text-white">Cosa tracci?</h1><p className="text-zinc-400">Seleziona i media che ti interessano.</p></div><div className="mb-7 grid grid-cols-2 gap-3">{MEDIA_TYPES.map(({ id, label, icon: Icon, color, active, inactive }) => { const sel = selectedTypes.includes(id); return <button key={id} type="button" data-no-swipe="true" onClick={() => toggleType(id)} className={`relative flex items-center gap-2 rounded-2xl border p-4 transition-all hover:scale-[1.02] active:scale-[0.98] ${sel ? active : inactive}`}><Icon size={19} style={sel ? { color } : {}} /><span className="text-sm font-medium">{label}</span>{sel && <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: 'var(--accent)' }}><Check size={11} className="text-black" strokeWidth={3} /></div>}</button> })}</div><div className="flex gap-3"><button type="button" data-no-swipe="true" onClick={() => setStep(0)} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800">Indietro</button><button type="button" data-no-swipe="true" onClick={() => setStep(2)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 font-semibold transition-all" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>Continua <ArrowRight size={18} /></button></div></>}
          {step === 2 && <><div className="mb-7"><h1 className="gk-title mb-2 text-white">Importa la tua storia</h1><p className="text-zinc-400">Collega o importa le librerie che hai già. Puoi saltare e farlo dopo dal profilo.</p></div><div className="mb-7 space-y-2">{IMPORT_SOURCES.map(({ id, label, detail, href, icon: Icon, color }) => <a key={id} href={href} data-no-swipe="true" className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 transition-colors hover:bg-zinc-800"><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${color}18`, color }}><Icon size={18} /></div><div className="min-w-0 flex-1"><p className="text-sm font-black text-white">{label}</p><p className="text-xs text-zinc-500">{detail}</p></div><ArrowRight size={16} className="text-zinc-600" /></a>)}</div><div className="flex gap-3"><button type="button" data-no-swipe="true" onClick={() => setStep(1)} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800">Indietro</button><button type="button" data-no-swipe="true" onClick={() => { setImportSkipped(true); setStep(3) }} disabled={!poolReady} className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 font-semibold transition-all disabled:cursor-wait disabled:opacity-50" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>{!poolReady ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />Caricamento…</> : <>Scegli 5 titoli <ArrowRight size={18} /></>}</button></div></>}
        </div>
      </div>
    </div>
  )
}
