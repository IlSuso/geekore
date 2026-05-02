'use client'
// DESTINAZIONE: src/app/onboarding/page.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Zap, Gamepad2, Film, Tv, Check, Layers, Swords, ArrowRight,
  Sparkles, Users, TrendingUp, UploadCloud, Dices, ArrowLeft,
} from 'lucide-react'
import { SwipeMode } from '@/components/for-you/SwipeMode'
import type { SwipeItem } from '@/components/for-you/SwipeMode'

const TOTAL_STEPS = 4

const MEDIA_TYPES = [
  { id: 'anime', label: 'Anime', icon: Swords, color: 'var(--type-anime)' },
  { id: 'manga', label: 'Manga', icon: Layers, color: 'var(--type-manga)' },
  { id: 'game', label: 'Videogiochi', icon: Gamepad2, color: 'var(--type-game)' },
  { id: 'tv', label: 'Serie TV', icon: Tv, color: 'var(--type-tv)' },
  { id: 'movie', label: 'Film', icon: Film, color: 'var(--type-movie)' },
  { id: 'boardgame', label: 'Boardgame', icon: Dices, color: 'var(--type-board)' },
]

const IMPORT_SOURCES = [
  { id: 'anilist', label: 'AniList', detail: 'Anime e manga già visti', href: '/profile/me?import=anilist', icon: Swords, color: 'var(--type-anime)' },
  { id: 'steam', label: 'Steam', detail: 'Ore giocate e libreria PC', href: '/profile/me?import=steam', icon: Gamepad2, color: 'var(--type-game)' },
  { id: 'letterboxd', label: 'Letterboxd', detail: 'Film e rating', href: '/profile/me?import=letterboxd', icon: Film, color: 'var(--type-movie)' },
  { id: 'bgg', label: 'BoardGameGeek', detail: 'Boardgame collection', href: '/profile/me?import=bgg', icon: UploadCloud, color: 'var(--type-board)' },
]

const FEATURES = [
  { icon: Sparkles, label: 'Raccomandazioni personalizzate basate sui tuoi gusti' },
  { icon: Users, label: 'Segui amici e scopri cosa stanno guardando' },
  { icon: TrendingUp, label: 'Traccia i progressi su tutti i tuoi media preferiti' },
]

type CategoryKey = 'all' | 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'

type SuggestedUser = {
  id: string
  username: string | null
  display_name?: string | null
  avatar_url?: string | null
}

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
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="gk-mono text-[var(--text-muted)]">Passo {current + 1} di {total}</span>
        <span className="font-mono-data text-[11px] font-bold text-[var(--accent)]">{pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BrandPanel({ step }: { step: number }) {
  const copy = [
    { title: ['Scegli i media', 'che contano.'], sub: 'Partiamo dalle categorie che vuoi davvero tracciare.' },
    { title: ['Importa la storia,', 'non ripartire da zero.'], sub: 'AniList, Steam, Letterboxd e BGG diventano il tuo cold-start intelligente.' },
    { title: ['Dai segnali forti', 'al tuo DNA.'], sub: 'Valuta, salva o scarta titoli: il feed parte già con una direzione.' },
    { title: ['Preferenze pronte,', 'entra nel feed.'], sub: 'Conferma il tuo profilo iniziale e scopri utenti da seguire.' },
  ][Math.min(step, 3)]

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden px-14 py-14 xl:px-20">
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]"><Zap size={22} className="text-black" /></div>
        <span className="font-display text-2xl font-black tracking-[-0.03em] text-white">geekore</span>
      </div>
      <div className="relative z-10 space-y-7">
        <h2 key={step} className="gk-display max-w-[520px] text-white">
          {copy.title.map((line, i) => <span key={line} className="block" style={i === copy.title.length - 1 ? { color: 'var(--accent)' } : {}}>{line}</span>)}
        </h2>
        <p className="max-w-[380px] text-lg leading-relaxed text-[var(--text-secondary)]">{copy.sub}</p>
        {step === 0 && <div className="space-y-4 pt-2">{FEATURES.map(({ icon: Icon, label }) => <div key={label} className="flex items-start gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(230,255,61,0.2)] bg-[rgba(230,255,61,0.08)]"><Icon size={17} className="text-[var(--accent)]" /></div><span className="pt-1 text-sm leading-relaxed text-zinc-300">{label}</span></div>)}</div>}
      </div>
      <p className="relative z-10 text-xs text-zinc-800">© {new Date().getFullYear()} Geekore</p>
    </div>
  )
}

function UserSuggestionCard({ user }: { user: SuggestedUser }) {
  const name = user.display_name || user.username || 'Geekore user'
  const initial = name.trim().slice(0, 1).toUpperCase() || 'G'
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--bg-elevated)] font-display text-sm font-black text-[var(--accent)]">
        {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-white">{name}</p>
        {user.username && <p className="truncate font-mono-data text-[10px] text-[var(--text-muted)]">@{user.username}</p>}
      </div>
      <span className="gk-chip gk-chip-match">Da seguire</span>
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
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([])
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
    if (!userId) return
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .neq('id', userId)
      .limit(8)
      .then(({ data }) => setSuggestedUsers((data || []) as SuggestedUser[]))
  }, [userId]) // eslint-disable-line

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
  const goToConfirmation = useCallback(() => setStep(3), [])

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
  }, [selectedTypes, importSkipped, router])

  if (step === 2) {
    return <SwipeMode items={swipePool} onSeen={handleOnboardingSeen} onSkip={handleOnboardingSkip} onClose={goToConfirmation} onRequestMore={handleOnboardingRequestMore} isOnboarding onOnboardingComplete={goToConfirmation} onUndo={handleOnboardingUndo} onUndoWishlist={handleOnboardingUndoWishlist} />
  }

  const selectedLabels = selectedTypes
    .map(id => MEDIA_TYPES.find(t => t.id === id)?.label)
    .filter(Boolean)

  return (
    <div className="gk-onboarding-page flex min-h-screen w-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="hidden shrink-0 border-r border-[var(--border)] lg:block lg:w-[46%] xl:w-[50%]"><div className="sticky top-0 h-screen"><BrandPanel step={step} /></div></div>
      <div className="flex flex-1 flex-col items-center justify-center px-7 py-12 sm:px-12 lg:px-14 xl:px-20">
        <div className="mb-10 flex items-center gap-3 self-start lg:hidden"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent)]"><Zap size={20} className="text-black" /></div><span className="font-display text-2xl font-black tracking-[-0.03em] text-white">geekore</span></div>
        <div className="w-full max-w-md">
          <div className="mb-8"><StepDots current={step} total={TOTAL_STEPS} /></div>

          {step === 0 && <>
            <div className="mb-7">
              <h1 className="gk-title mb-2 text-white">Cosa tracci?</h1>
              <p className="gk-body">Scegli almeno una categoria. Puoi cambiarle più avanti dal profilo.</p>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              {MEDIA_TYPES.map(({ id, label, icon: Icon, color }) => {
                const selected = selectedTypes.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    data-no-swipe="true"
                    onClick={() => toggleType(id)}
                    className="gk-active-press relative flex aspect-[1.05] flex-col justify-between rounded-[18px] border p-4 text-left transition-colors"
                    style={selected ? { borderColor: 'rgba(230,255,61,0.55)', background: 'rgba(230,255,61,0.06)' } : { borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                    aria-pressed={selected}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><Icon size={18} /></span>
                    <span className="text-sm font-black text-white">{label}</span>
                    {selected && <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)]"><Check size={11} className="text-black" strokeWidth={3} /></span>}
                  </button>
                )
              })}
            </div>
            {selectedTypes.length === 0 && <p className="gk-caption mb-5 text-[var(--text-muted)]">Seleziona almeno un tipo media per continuare.</p>}
            <button type="button" data-no-swipe="true" onClick={() => setStep(1)} disabled={selectedTypes.length === 0} className="gk-btn gk-btn-primary gk-focus-ring w-full disabled:opacity-50">
              Continua <ArrowRight size={18} />
            </button>
          </>}

          {step === 1 && <>
            <div className="mb-7">
              <h1 className="gk-title mb-2 text-white">Importa la tua storia</h1>
              <p className="gk-body">Collega o importa le librerie che hai già. Puoi saltare e farlo dopo dal profilo.</p>
            </div>
            <div className="mb-7 space-y-2">
              {IMPORT_SOURCES.map(({ id, label, detail, href, icon: Icon, color }) => <a key={id} href={href} data-no-swipe="true" className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 transition-colors hover:bg-[var(--bg-elevated)]"><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><Icon size={18} /></div><div className="min-w-0 flex-1"><p className="text-sm font-black text-white">{label}</p><p className="text-xs text-[var(--text-muted)]">{detail}</p></div><ArrowRight size={16} className="text-[var(--text-muted)]" /></a>)}
            </div>
            <div className="flex gap-3">
              <button type="button" data-no-swipe="true" onClick={() => setStep(0)} className="gk-btn gk-btn-secondary gk-focus-ring px-5"><ArrowLeft size={16} /> Indietro</button>
              <button type="button" data-no-swipe="true" onClick={() => { setImportSkipped(true); setStep(2) }} disabled={!poolReady} className="gk-btn gk-btn-secondary gk-focus-ring flex-1 disabled:cursor-wait disabled:opacity-50">Salta</button>
              <button type="button" data-no-swipe="true" onClick={() => { setImportSkipped(false); setStep(2) }} disabled={!poolReady} className="gk-btn gk-btn-primary gk-focus-ring flex-1 disabled:cursor-wait disabled:opacity-50">{!poolReady ? 'Caricamento…' : 'Continua'} <ArrowRight size={18} /></button>
            </div>
          </>}

          {step === 3 && <>
            <div className="mb-7">
              <h1 className="gk-title mb-2 text-white">Preferenze pronte</h1>
              <p className="gk-body">Hai creato il tuo profilo iniziale. Puoi entrare nella home e continuare a raffinare il DNA con l’uso.</p>
            </div>

            <div className="mb-5 rounded-[24px] border border-[rgba(230,255,61,0.20)] bg-[rgba(230,255,61,0.05)] p-4">
              <p className="gk-label mb-3 text-[var(--accent)]">Riepilogo</p>
              <div className="flex flex-wrap gap-2">
                {selectedLabels.length > 0 ? selectedLabels.map(label => <span key={label} className="gk-chip gk-chip-match">{label}</span>) : <span className="gk-caption">Nessuna categoria selezionata</span>}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-black/18 p-3"><p className="font-mono-data text-lg font-black text-white">{acceptedItemsRef.current.size}</p><p className="gk-mono text-[var(--text-muted)]">segnali</p></div>
                <div className="rounded-2xl bg-black/18 p-3"><p className="font-mono-data text-lg font-black text-white">{wishlistItemsRef.current.size}</p><p className="gk-mono text-[var(--text-muted)]">wishlist</p></div>
                <div className="rounded-2xl bg-black/18 p-3"><p className="font-mono-data text-lg font-black text-white">{skippedItemsRef.current.length}</p><p className="gk-mono text-[var(--text-muted)]">skip</p></div>
              </div>
            </div>

            <div className="mb-7">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="gk-label text-[var(--text-secondary)]">Suggeriti da seguire</p>
                <span className="font-mono-data text-[10px] text-[var(--text-muted)]">{Math.min(suggestedUsers.length, 8)} utenti</span>
              </div>
              <div className="space-y-2">
                {suggestedUsers.length > 0 ? suggestedUsers.slice(0, 8).map(user => <UserSuggestionCard key={user.id} user={user} />) : (
                  <div className="gk-empty-state">
                    <Users className="gk-empty-state-icon" />
                    <p className="gk-empty-state-title">Nessun suggerimento ancora</p>
                    <p className="gk-empty-state-subtitle">Entrerai comunque nella home e potrai seguire utenti dalla sezione Friends.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" data-no-swipe="true" onClick={() => setStep(2)} className="gk-btn gk-btn-secondary gk-focus-ring px-5"><ArrowLeft size={16} /> Swipe</button>
              <button type="button" data-no-swipe="true" onClick={completeOnboarding} className="gk-btn gk-btn-primary gk-focus-ring flex-1">Inizia <ArrowRight size={18} /></button>
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}
