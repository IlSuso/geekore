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
  const params = new URLSearchParams({ type: 'all', refresh: '1', onboarding: '1' })
  if (category === 'all' && selectedTypes.length > 0) {
    params.set('types', selectedTypes.join(','))
  } else if (category !== 'all') {
    params.set('types', category)
  }
  try {
    const res = await fetch(`/api/recommendations?${params.toString()}`)
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

async function persistAccepted(
  supabase: ReturnType<typeof createClient>,
  userId: string, item: SwipeItem, rating: number | null
) {
  await supabase.from('user_media_entries').upsert({
    user_id: userId, external_id: item.id, title: item.title, type: item.type,
    cover_image: item.coverImage ?? null, genres: item.genres, rating: rating ?? null,
    status: rating !== null ? 'completed' : 'wishlist', year: item.year ?? null,
    score: item.score ?? null, description: item.description ?? null,
    episodes: item.episodes ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,external_id' })
}

function setOnboardingCookie() {
  const maxAge = 60 * 60 * 24 * 365
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `geekore_onboarding_done=1; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
}

// ─── StepDots ─────────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 items-center">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`rounded-full transition-all duration-300 ${
          i === current ? 'w-7 h-2 bg-violet-500' : i < current ? 'w-2 h-2 bg-violet-500/40' : 'w-2 h-2 bg-zinc-700'
        }`} />
      ))}
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
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-violet-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-10 w-96 h-96 bg-fuchsia-600/10 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute top-1/2 -translate-y-1/2 left-1/3 w-60 h-60 bg-sky-500/8 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative z-10 flex items-center gap-3">
        <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30">
          <Zap size={22} className="text-white" />
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
                <div className="w-9 h-9 bg-violet-500/10 border border-violet-500/25 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={17} className="text-violet-400" />
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

  const categoryCache = useRef<Partial<Record<CategoryKey, SwipeItem[]>>>({})
  const categoryLoading = useRef<Partial<Record<CategoryKey, boolean>>>({})
  const categoryLoaded = useRef<Partial<Record<CategoryKey, boolean>>>({})
  const globalSeenIds = useRef<Set<string>>(new Set())
  const skippedItemsRef = useRef<SwipeItem[]>([])

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      userIdRef.current = user.id
    })
  }, []) // eslint-disable-line

  // Preload 3 fasi
  useEffect(() => {
    const run = async () => {
      // FASE 1: 15 "all" interleaved → sblocca bottone
      const quickAll = await fetchCategoryTitles('all', [], globalSeenIds.current, POOL_QUICK)
      if (quickAll.length > 0) {
        quickAll.forEach(i => globalSeenIds.current.add(i.id))
        categoryCache.current['all'] = quickAll
        setSwipePool(quickAll)
        setPoolReady(true)
      }

      // FASE 2: 15 per ogni categoria specifica in parallelo
      const specificTypes: CategoryKey[] = ['anime', 'manga', 'movie', 'tv', 'game']
      await Promise.all(specificTypes.map(async (cat) => {
        const items = await fetchCategoryTitles(cat, [], new Set(), POOL_QUICK)
        if (items.length > 0) {
          categoryCache.current[cat] = items
          categoryLoaded.current[cat] = true
        }
      }))

      // FASE 3: completa fino a 50 in background
      const allTypes: CategoryKey[] = ['all', 'anime', 'manga', 'movie', 'tv', 'game']
      for (const cat of allTypes) {
        fetchCategoryTitles(cat, [], globalSeenIds.current, POOL_TARGET).then(items => {
          if (items.length === 0) return
          if (cat === 'all') {
            const fresh = items.filter(i => !globalSeenIds.current.has(i.id))
            if (fresh.length > 0) {
              fresh.forEach(i => globalSeenIds.current.add(i.id))
              categoryCache.current['all'] = [...(categoryCache.current['all'] || []), ...fresh]
              setSwipePool(prev => [...prev, ...fresh])
            }
          } else {
            const existing = categoryCache.current[cat] || []
            const fresh = items.filter(i => !existing.some(e => e.id === i.id))
            categoryCache.current[cat] = [...existing, ...fresh]
          }
        }).catch(() => {})
      }
    }
    run()
  }, []) // eslint-disable-line

  const refreshAllPoolForTypes = useCallback(async (types: string[]) => {
    if (types.length === 0) return
    categoryLoading.current['all'] = true
    const items = await fetchCategoryTitles('all', types, new Set())
    if (items.length > 0) {
      categoryCache.current['all'] = items
      const fresh = items.filter(i => !globalSeenIds.current.has(i.id))
      setSwipePool(prev => prev.length < 5 ? items : [...prev, ...fresh].slice(0, POOL_TARGET))
      fresh.forEach(i => globalSeenIds.current.add(i.id))
    }
    categoryLoading.current['all'] = false
  }, [])

  const toggleType = (id: string) =>
    setSelectedTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])

  const handleOnboardingSeen = useCallback((item: SwipeItem, rating: number | null) => {
    globalSeenIds.current.add(item.id)
    if (userId) persistAccepted(supabase, userId, item, rating)
  }, [userId, supabase])

  const handleOnboardingSkip = useCallback((item: SwipeItem) => {
    globalSeenIds.current.add(item.id)
    skippedItemsRef.current.push(item)
  }, [])

  const handleOnboardingRequestMore = useCallback(async (filter: string = 'all'): Promise<SwipeItem[]> => {
    const cat = filter as CategoryKey
    const cached = categoryCache.current[cat] || []
    const fromCache = cached.filter(i => !globalSeenIds.current.has(i.id))
    if (fromCache.length >= REFILL_THRESHOLD) {
      fromCache.forEach(i => globalSeenIds.current.add(i.id))
      setTimeout(async () => {
        const fresh = await fetchCategoryTitles(cat, selectedTypes, globalSeenIds.current)
        if (fresh.length > 0) { categoryCache.current[cat] = fresh }
      }, 200)
      return fromCache
    }
    const items = await fetchCategoryTitles(cat, selectedTypes, globalSeenIds.current)
    if (items.length > 0) {
      categoryCache.current[cat] = items
      items.forEach(i => globalSeenIds.current.add(i.id))
      return items
    }
    const skippedIds = new Set(skippedItemsRef.current.map(i => i.id))
    globalSeenIds.current = skippedIds
    const retryItems = await fetchCategoryTitles(cat, selectedTypes, globalSeenIds.current)
    retryItems.forEach(i => globalSeenIds.current.add(i.id))
    return retryItems
  }, [selectedTypes])

  const completeOnboarding = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) return

    if (skippedItemsRef.current.length > 0) {
      await supabase.from('swipe_skipped').upsert(
        skippedItemsRef.current.map(item => ({ user_id: uid, external_id: item.id, title: item.title, type: item.type })),
        { onConflict: 'user_id,external_id' }
      )
    }

    // Update critico — onboarding_done separato da preferred_types per sicurezza
    await supabase.from('profiles').update({ onboarding_done: true, onboarding_step: 3 }).eq('id', uid)
    if (selectedTypes.length > 0) {
      await supabase.from('profiles').update({ preferred_types: selectedTypes }).eq('id', uid).then(() => {})
    }

    setOnboardingCookie()
    fetch('/api/recommendations?refresh=1').catch(() => {})
    router.push('/feed')
  }, [userId, selectedTypes, supabase, router])

  const goToSwipe = useCallback(() => {
    setStep(2)
    refreshAllPoolForTypes(selectedTypes)
  }, [selectedTypes, refreshAllPoolForTypes])

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
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
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
                    <div className="w-8 h-8 bg-violet-500/15 border border-violet-500/30 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={15} className="text-violet-400" />
                    </div>
                    <span className="text-zinc-300 text-sm leading-relaxed pt-1">{label}</span>
                  </div>
                ))}
              </div>

              {/* Titolo desktop */}
              <div className="hidden lg:block mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Cominciamo 👋</h1>
                <p className="text-zinc-400">Ci vorranno meno di 2 minuti.</p>
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20"
              >
                Inizia <ArrowRight size={20} />
              </button>
              <p className="text-zinc-700 text-xs text-center mt-6">
                Hai già un account?{' '}
                <a href="/login" className="text-zinc-500 hover:text-zinc-300 underline transition-colors">Accedi</a>
              </p>
            </>
          )}

          {/* ── Step 1 ── */}
          {step === 1 && (
            <>
              <div className="mb-7">
                <h1 className="text-3xl font-bold text-white mb-2">Cosa tracci?</h1>
                <p className="text-zinc-400">Seleziona i media che ti interessano.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-7">
                {MEDIA_TYPES.map(({ id, label, icon: Icon, color, active, inactive }) => {
                  const sel = selectedTypes.includes(id)
                  return (
                    <button key={id} onClick={() => toggleType(id)}
                      className={`relative flex items-center gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${sel ? active : inactive}`}
                    >
                      <Icon size={19} style={sel ? { color } : {}} />
                      <span className="font-medium text-sm">{label}</span>
                      {sel && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center shadow-sm shadow-violet-500/50">
                          <Check size={11} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              {selectedTypes.length === 0 && (
                <p className="text-zinc-600 text-xs text-center mb-5">Nessuna selezione? Ti mostreremo un po' di tutto 👍</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep(0)}
                  className="px-5 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl font-medium transition-all text-zinc-300 text-sm">
                  Indietro
                </button>
                <button onClick={goToSwipe} disabled={!poolReady}
                  className="flex-1 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 disabled:opacity-50 disabled:cursor-wait rounded-2xl font-semibold transition-all flex items-center justify-center gap-2">
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