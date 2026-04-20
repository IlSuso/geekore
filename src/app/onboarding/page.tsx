'use client'
// DESTINAZIONE: src/app/onboarding/page.tsx
// Onboarding v4:
//   • Step 0 — Welcome
//     → avvia SUBITO il preload veloce via /api/recommendations/onboarding
//       (endpoint dedicato: fetch parallele, no taste profile, ~2-4s)
//     → Una volta caricati i primi 50 per categoria, lancia in background
//       il build del master pool via /api/recommendations?refresh=1&onboarding=1
//   • Step 1 — Selezione media types
//   • Step 2 — SwipeMode onboarding
//     → onRequestMore serve dalla cache in-memory, poi refetch quick
//
// Logica scrittura:
//   • Swipe DESTRA → persistAccepted() chiamato SUBITO
//   • Swipe SINISTRA → batch in memoria, scritto alla fine
//   • Alla chiusura → batch skip → swipe_skipped, update profile → /feed

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Zap, Gamepad2, Film, Tv, Check, Layers, Swords } from 'lucide-react'
import { SwipeMode } from '@/components/for-you/SwipeMode'
import type { SwipeItem } from '@/components/for-you/SwipeMode'

// ─── Costanti ────────────────────────────────────────────────────────────────

const MEDIA_TYPES = [
  { id: 'anime',  label: 'Anime',       icon: Swords,   color: 'bg-sky-500/20 border-sky-500/50 text-sky-300' },
  { id: 'manga',  label: 'Manga',       icon: Layers,   color: 'bg-orange-500/20 border-orange-500/50 text-orange-300' },
  { id: 'game',   label: 'Videogiochi', icon: Gamepad2, color: 'bg-green-500/20 border-green-500/50 text-green-300' },
  { id: 'tv',     label: 'Serie TV',    icon: Tv,       color: 'bg-purple-500/20 border-purple-500/50 text-purple-300' },
  { id: 'movie',  label: 'Film',        icon: Film,     color: 'bg-red-500/20 border-red-500/50 text-red-300' },
]

type CategoryKey = 'all' | 'anime' | 'manga' | 'movie' | 'tv' | 'game'

const REFILL_THRESHOLD = 20  // card rimaste prima di chiedere il refill

// ─── Helper: converte risposta API → SwipeItem ────────────────────────────────

function recToSwipeItem(r: any): SwipeItem {
  return {
    id: r.id,
    title: r.title,
    type: r.type as SwipeItem['type'],
    coverImage: r.coverImage,
    year: r.year,
    genres: r.genres || [],
    score: r.score,
    description: r.description,
    why: r.why,
    matchScore: r.matchScore || 0,
    episodes: r.episodes,
    authors: r.authors,
    developers: r.developers,
    platforms: r.platforms,
    isAwardWinner: r.isAwardWinner,
    isDiscovery: r.isDiscovery,
    source: r.source,
  }
}

// ─── Fetch rapido via endpoint dedicato onboarding ───────────────────────────
// Usa /api/recommendations/onboarding che fa fetch parallele senza taste profile.
// types: lista di tipi da caricare (undefined = tutti)

async function fetchQuick(types?: string[]): Promise<Partial<Record<CategoryKey, SwipeItem[]>>> {
  const params = new URLSearchParams()
  if (types && types.length > 0) params.set('types', types.join(','))

  try {
    const res = await fetch(`/api/recommendations/onboarding?${params.toString()}`)
    if (!res.ok) return {}
    const json = await res.json()
    const recs = json.recommendations || {}

    const result: Partial<Record<CategoryKey, SwipeItem[]>> = {}
    for (const [type, items] of Object.entries(recs)) {
      result[type as CategoryKey] = (items as any[]).map(recToSwipeItem)
    }
    return result
  } catch {
    return {}
  }
}

// ─── Scrittura immediata accettato su user_media_entries ──────────────────────

async function persistAccepted(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  item: SwipeItem,
  rating: number | null
): Promise<void> {
  const { error } = await supabase
    .from('user_media_entries')
    .upsert({
      user_id: userId,
      external_id: item.id,
      title: item.title,
      type: item.type,
      cover_image: item.coverImage ?? null,
      genres: item.genres,
      rating: rating ?? null,
      status: rating !== null ? 'completed' : 'wishlist',
      year: item.year ?? null,
      score: item.score ?? null,
      description: item.description ?? null,
      episodes: item.episodes ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,external_id' })
  if (error) console.error('[Onboarding] persistAccepted error:', error)
}

// ─── OnboardingPage ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  // Pool "all" passato come initialItems a SwipeMode
  const [swipePool, setSwipePool] = useState<SwipeItem[]>([])
  const [poolLoading, setPoolLoading] = useState(true)

  // Cache per categoria — precaricata in background dal Step 0
  const categoryCache = useRef<Partial<Record<CategoryKey, SwipeItem[]>>>({})

  // IDs globalmente visti in questo onboarding (evita duplicati inter-categoria)
  const globalSeenIds = useRef<Set<string>>(new Set())

  // Accumula skippati — batch scritto alla fine
  const skippedItemsRef = useRef<SwipeItem[]>([])

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
    })
  }, []) // eslint-disable-line

  // ── Preload veloce al mount (Step 0) ─────────────────────────────────────────
  // 1. Carica SUBITO tutti e 5 i tipi via /api/recommendations/onboarding (parallelo, ~2-4s)
  // 2. Appena arrivano i dati, popola swipePool ("all") e categoryCache
  // 3. Lancia in background il build del master pool (nessuna urgenza)
  useEffect(() => {
    const load = async () => {
      setPoolLoading(true)
      console.log('[Onboarding] avvio quick fetch...')

      const data = await fetchQuick()

      // Costruisce il pool "all" unendo tutti i tipi e shufflando
      const all: SwipeItem[] = []
      for (const [type, items] of Object.entries(data)) {
        categoryCache.current[type as CategoryKey] = items
        all.push(...items)
      }

      // Shuffle leggero per varietà visiva nel pool "all"
      const shuffled = all.sort(() => Math.random() - 0.4)
      shuffled.forEach(i => globalSeenIds.current.add(i.id))

      // "all" = mix di tutti i tipi (max 50)
      categoryCache.current['all'] = shuffled.slice(0, 50)
      setSwipePool(shuffled.slice(0, 50))
      setPoolLoading(false)

      console.log(`[Onboarding] quick fetch completato: ${all.length} titoli totali`)

      // Build master pool in background — non blocca l'utente
      fetch('/api/recommendations?refresh=1&onboarding=1').catch(() => {})
    }

    load()
  }, []) // eslint-disable-line

  // ── Quando l'utente conferma i tipi: filtra/riordina il pool "all" ───────────
  // Se ha selezionato dei tipi specifici, prioritizza quelli nel pool
  const refreshAllPoolForTypes = useCallback((types: string[]) => {
    if (types.length === 0) return

    // Recupera dalla cache solo i tipi selezionati
    const filtered: SwipeItem[] = []
    for (const t of types) {
      const cached = categoryCache.current[t as CategoryKey] || []
      filtered.push(...cached.filter(i => !globalSeenIds.current.has(i.id)))
    }

    if (filtered.length > 0) {
      const shuffled = filtered.sort(() => Math.random() - 0.4).slice(0, 50)
      categoryCache.current['all'] = shuffled
      setSwipePool(prev =>
        prev.length < 5
          ? shuffled
          : [...prev, ...shuffled.filter(i => !globalSeenIds.current.has(i.id))].slice(0, 50)
      )
      shuffled.forEach(i => globalSeenIds.current.add(i.id))
    }
  }, [])

  // ── Toggle media type ───────────────────────────────────────────────────────
  const toggleType = (id: string) => {
    setSelectedTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  // ── Handler swipe DESTRA ─────────────────────────────────────────────────────
  const handleOnboardingSeen = useCallback((item: SwipeItem, rating: number | null) => {
    globalSeenIds.current.add(item.id)
    if (userId) persistAccepted(supabase, userId, item, rating)
  }, [userId, supabase])

  // ── Handler swipe SINISTRA ───────────────────────────────────────────────────
  const handleOnboardingSkip = useCallback((item: SwipeItem) => {
    globalSeenIds.current.add(item.id)
    skippedItemsRef.current.push(item)
  }, [])

  // ── onRequestMore: serve dalla cache, poi refetch quick ──────────────────────
  const handleOnboardingRequestMore = useCallback(async (
    filter: string = 'all'
  ): Promise<SwipeItem[]> => {
    const cat = filter as CategoryKey

    // 1. Servi dalla cache se disponibile
    const cached = categoryCache.current[cat] || []
    const fromCache = cached.filter(i => !globalSeenIds.current.has(i.id))
    if (fromCache.length >= REFILL_THRESHOLD) {
      console.log(`[Onboarding] requestMore "${cat}" → ${fromCache.length} dalla cache`)
      fromCache.forEach(i => globalSeenIds.current.add(i.id))

      // Ricarica la cache in background
      const types = cat === 'all'
        ? (selectedTypes.length > 0 ? selectedTypes : undefined)
        : [cat]
      setTimeout(async () => {
        const fresh = await fetchQuick(types)
        const freshItems = cat === 'all'
          ? Object.values(fresh).flat()
          : (fresh[cat] || [])
        categoryCache.current[cat] = freshItems.filter(i => !globalSeenIds.current.has(i.id))
      }, 500)

      return fromCache
    }

    // 2. Cache esaurita → refetch quick
    console.log(`[Onboarding] requestMore "${cat}" → refetch quick`)
    const types = cat === 'all'
      ? (selectedTypes.length > 0 ? selectedTypes : undefined)
      : [cat]
    const fresh = await fetchQuick(types)
    const freshItems = cat === 'all'
      ? Object.values(fresh).flat().filter(i => !globalSeenIds.current.has(i.id))
      : (fresh[cat] || []).filter(i => !globalSeenIds.current.has(i.id))

    if (freshItems.length > 0) {
      categoryCache.current[cat] = freshItems
      freshItems.forEach(i => globalSeenIds.current.add(i.id))
      return freshItems
    }

    // 3. Reset parziale se esaurito completamente
    const skippedIds = new Set(skippedItemsRef.current.map(i => i.id))
    globalSeenIds.current = skippedIds
    const retry = await fetchQuick(types)
    const retryItems = cat === 'all'
      ? Object.values(retry).flat()
      : (retry[cat] || [])
    retryItems.forEach(i => globalSeenIds.current.add(i.id))
    return retryItems
  }, [selectedTypes])

  // ── Completa onboarding ─────────────────────────────────────────────────────
  const completeOnboarding = useCallback(async () => {
    if (!userId) return

    // 1. Batch write skippati → swipe_skipped
    if (skippedItemsRef.current.length > 0) {
      const rows = skippedItemsRef.current.map(item => ({
        user_id: userId,
        external_id: item.id,
        title: item.title,
        type: item.type,
      }))
      await supabase
        .from('swipe_skipped')
        .upsert(rows, { onConflict: 'user_id,external_id' })
    }

    // 2. Segna onboarding completato (SOLO qui — mai prima)
    await supabase.from('profiles').update({
      onboarding_done: true,
      onboarding_step: 3,
      preferred_types: selectedTypes.length > 0 ? selectedTypes : null,
    }).eq('id', userId)

    // 3. Trigger refresh raccomandazioni personalizzate in background
    fetch('/api/recommendations?refresh=1').catch(() => {})

    router.push('/feed')
  }, [userId, selectedTypes, supabase, router])

  // ── goToSwipe: Step 1 → Step 2 ───────────────────────────────────────────────
  const goToSwipe = useCallback(() => {
    setStep(2)
    refreshAllPoolForTypes(selectedTypes)
  }, [selectedTypes, refreshAllPoolForTypes])

  // ─── Render ─────────────────────────────────────────────────────────────────

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

  const progress = ((step + 1) / 3) * 100

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-zinc-800 rounded-full mb-10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step dots */}
        <div className="flex gap-2 mb-8">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-all ${i <= step ? 'bg-violet-500' : 'bg-zinc-800'}`}
            />
          ))}
        </div>

        {/* ── Step 0 — Welcome ── */}
        {step === 0 && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/20 flex items-center justify-center">
              <Zap size={36} className="text-violet-400" />
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-white mb-4">
              Benvenuto su Geekore!
            </h1>
            <p className="text-zinc-400 text-lg mb-6">Il tuo universo geek in un unico posto.</p>
            <p className="text-zinc-500 mb-10 max-w-sm mx-auto">
              Traccia anime, manga, videogiochi, film e serie TV. Condividi i progressi con la community.
            </p>
            <button
              onClick={() => setStep(1)}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-lg transition-all"
            >
              Inizia
            </button>
          </div>
        )}

        {/* ── Step 1 — Selezione media ── */}
        {step === 1 && (
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Cosa tracci?</h1>
            <p className="text-zinc-400 mb-8">Seleziona i media che ti interessano.</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {MEDIA_TYPES.map(({ id, label, icon: Icon, color }) => {
                const selected = selectedTypes.includes(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleType(id)}
                    className={`relative flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                      selected
                        ? color
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Icon size={22} />
                    <span className="font-medium">{label}</span>
                    {selected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {selectedTypes.length === 0 && (
              <p className="text-zinc-600 text-xs text-center mb-6">
                Nessuna selezione? Ti mostreremo un po' di tutto.
              </p>
            )}
            {selectedTypes.length > 0 && <div className="mb-6" />}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(0)}
                className="px-6 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl font-medium transition-all"
              >
                Indietro
              </button>
              <button
                onClick={goToSwipe}
                disabled={poolLoading}
                className="flex-1 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 disabled:opacity-60 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
              >
                {poolLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Caricamento titoli…
                  </>
                ) : (
                  'Scopri i titoli →'
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}