'use client'
// DESTINAZIONE: src/app/onboarding/page.tsx
// Onboarding v3:
//   • Step 0 — Welcome
//     → avvia SUBITO in background il preload di TUTTE le categorie:
//       swipe_all, swipe_anime, swipe_manga, swipe_movie, swipe_tv, swipe_game
//     → le fetch partono scaglionate (stagger 400ms) per non saturare il server
//   • Step 1 — Selezione media types
//     → se l'utente ha selezionato dei tipi, aggiorna il pool "all" con quei tipi
//   • Step 2 — SwipeMode onboarding
//     → onRequestMore serve prima dalla cache in-memory per categoria,
//       poi fetch fresh solo se la cache è esaurita
//
// Logica scrittura:
//   • Swipe DESTRA → persistAccepted() chiamato SUBITO (user_media_entries aggiornato)
//   • Swipe SINISTRA → batch in memoria, scritto in upsert alla fine
//   • Alla chiusura → batch skip → swipe_skipped, update profile, trigger reco refresh

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

// Tutte le categorie da precaricare (uguale a CATEGORIES in SwipeMode)
type CategoryKey = 'all' | 'anime' | 'manga' | 'movie' | 'tv' | 'game'
const ALL_CATEGORIES: CategoryKey[] = ['all', 'anime', 'manga', 'movie', 'tv', 'game']

const POOL_QUICK = 15        // card per categoria nel precaricamento rapido
const POOL_TARGET = 50       // card per categoria nel caricamento completo
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

// ─── Fetch titoli dall'API per una specifica categoria ───────────────────────
// ?onboarding=1 bypassa il filtro allTypesInCollection (profilo vuoto)
// ?types=anime,game limita i tipi se l'utente ha fatto una selezione

// Interleave: alterna un item per tipo → mix massimo nel pool "all"
// [anime[0], manga[0], movie[0], tv[0], game[0], anime[1], ...]
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
      // Interleave per mix massimo tra tipi diversi
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
          .flat()
          .filter((r: any) => r.type === category)
      }
      return recs
        .sort(() => Math.random() - 0.4)
        .filter((r: any) => !globalSeenIds.has(r.id))
        .slice(0, limit)
        .map(recToSwipeItem)
    }
  } catch {
    return []
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
  const userIdRef = useRef<string | null>(null)  // ref per evitare stale closure in completeOnboarding
  const [poolReady, setPoolReady] = useState(false) // true quando i primi 15 "all" sono pronti

  // Pool "all" passato come initialItems a SwipeMode
  const [swipePool, setSwipePool] = useState<SwipeItem[]>([])

  // ── Cache per categoria ──────────────────────────────────────────────────────
  // Precaricata in background dal Step 0.
  // onRequestMore(filter) serve prima da qui, poi fetch fresh se esaurita.
  const categoryCache = useRef<Partial<Record<CategoryKey, SwipeItem[]>>>({})
  const categoryLoading = useRef<Partial<Record<CategoryKey, boolean>>>({})
  const categoryLoaded = useRef<Partial<Record<CategoryKey, boolean>>>({})

  // IDs globalmente visti in questo onboarding (evita duplicati inter-categoria)
  const globalSeenIds = useRef<Set<string>>(new Set())

  // Accumula skippati — batch scritto alla fine
  const skippedItemsRef = useRef<SwipeItem[]>([])

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      userIdRef.current = user.id
    })
  }, []) // eslint-disable-line

  // ── Preload al mount — 3 fasi ─────────────────────────────────────────────
  // FASE 1 (immediata): 15 card "all" con interleave → abilita il bottone
  // FASE 2 (subito dopo): 15 card per ogni singola categoria (parallelo)
  // FASE 3 (background): completa fino a 50 per ogni categoria
  useEffect(() => {
    const run = async () => {
      // ── FASE 1: 15 "all" ────────────────────────────────────────────────
      const quickAll = await fetchCategoryTitles('all', [], globalSeenIds.current, POOL_QUICK)
      if (quickAll.length > 0) {
        quickAll.forEach(i => globalSeenIds.current.add(i.id))
        categoryCache.current['all'] = quickAll
        setSwipePool(quickAll)
        setPoolReady(true)  // ← sblocca il bottone "Scopri i titoli"
      }

      // ── FASE 2: 15 per ogni categoria specifica (parallelo) ─────────────
      const specificTypes: CategoryKey[] = ['anime', 'manga', 'movie', 'tv', 'game']
      await Promise.all(specificTypes.map(async (cat) => {
        const items = await fetchCategoryTitles(cat, [], new Set(), POOL_QUICK)
        if (items.length > 0) {
          categoryCache.current[cat] = items
          categoryLoaded.current[cat] = true
        }
      }))

      // ── FASE 3: completa fino a 50 per ogni categoria (background) ──────
      // Non blocca nulla — viene usato solo quando l'utente ha esaurito le prime card
      const allTypes: CategoryKey[] = ['all', 'anime', 'manga', 'movie', 'tv', 'game']
      for (const cat of allTypes) {
        fetchCategoryTitles(cat, [], globalSeenIds.current, POOL_TARGET).then(items => {
          if (items.length > 0) {
            // Per "all" aggiunge al pool esistente senza duplicati
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
          }
        }).catch(() => {})
      }
    }

    run()
  }, []) // eslint-disable-line

  // ── Quando l'utente conferma i tipi: aggiorna il pool "all" per quei tipi ────
  // Parte in background mentre avviene la transizione Step1→Step2.
  // Se il pool "all" era già caricato con tipi generici, lo sostituiamo
  // con uno ottimizzato per i tipi selezionati.
  const refreshAllPoolForTypes = useCallback(async (types: string[]) => {
    if (types.length === 0) return
    categoryLoading.current['all'] = true
    const items = await fetchCategoryTitles('all', types, new Set()) // no filter su seenIds
    if (items.length > 0) {
      categoryCache.current['all'] = items
      // Aggiorna il pool visibile filtrando i già-visti
      const fresh = items.filter(i => !globalSeenIds.current.has(i.id))
      // Se abbiamo già swipato qualcosa, appendiamo; altrimenti sostituiamo
      setSwipePool(prev =>
        prev.length < 5
          ? items // non ha ancora iniziato a swipare → rimpiazza tutto
          : [...prev, ...fresh].slice(0, POOL_TARGET)
      )
      fresh.forEach(i => globalSeenIds.current.add(i.id))
    }
    categoryLoading.current['all'] = false
  }, [])

  // ── Toggle media type ───────────────────────────────────────────────────────
  const toggleType = (id: string) => {
    setSelectedTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  // ── Handler swipe DESTRA: scrivi SUBITO su user_media_entries ────────────────
  const handleOnboardingSeen = useCallback((item: SwipeItem, rating: number | null) => {
    globalSeenIds.current.add(item.id)
    if (userId) persistAccepted(supabase, userId, item, rating)
  }, [userId, supabase])

  // ── Handler swipe SINISTRA: accumula in memoria ──────────────────────────────
  const handleOnboardingSkip = useCallback((item: SwipeItem) => {
    globalSeenIds.current.add(item.id)
    skippedItemsRef.current.push(item)
  }, [])

  // ── onRequestMore: serve prima dalla cache, poi fetch fresh ──────────────────
  // Quando SwipeMode chiede più card per un filtro:
  //   1. Controlla la cache per quella categoria
  //   2. Se ha card non ancora viste → le restituisce subito (zero latenza)
  //   3. Se la cache è esaurita → fetch fresh (API legge già il profilo aggiornato)
  //   4. Prima del fetch, trigghera aggiornamento taste in background
  const handleOnboardingRequestMore = useCallback(async (
    filter: string = 'all'
  ): Promise<SwipeItem[]> => {
    const cat = filter as CategoryKey

    // 1. Servi dalla cache in-memory se disponibile
    const cached = categoryCache.current[cat] || []
    const fromCache = cached.filter(i => !globalSeenIds.current.has(i.id))
    if (fromCache.length >= REFILL_THRESHOLD) {
      console.log(`[Onboarding] requestMore "${cat}" → ${fromCache.length} dalla cache`)
      fromCache.forEach(i => globalSeenIds.current.add(i.id))
      // Ricarica la cache per questa categoria in background per il prossimo refill
      setTimeout(async () => {
        categoryLoading.current[cat] = true
        const fresh = await fetchCategoryTitles(cat, selectedTypes, globalSeenIds.current)
        if (fresh.length > 0) {
          categoryCache.current[cat] = fresh
          fresh.forEach(i => globalSeenIds.current.add(i.id))
        }
        categoryLoading.current[cat] = false
      }, 200)
      return fromCache
    }

    // 2. Cache esaurita → fetch fresh
    //    Il profilo ha già i titoli accettati (scritti in real-time), quindi
    //    l'API restituisce raccomandazioni più personalizzate rispetto all'inizio
    console.log(`[Onboarding] requestMore "${cat}" → cache esaurita, fetch fresh`)
    const items = await fetchCategoryTitles(cat, selectedTypes, globalSeenIds.current)

    if (items.length > 0) {
      categoryCache.current[cat] = items
      items.forEach(i => globalSeenIds.current.add(i.id))
      return items
    }

    // 3. Nessun titolo nuovo → reset globalSeenIds (escludi solo gli skippati)
    //    e riprova per permettere il ricircolo del pool
    const skippedIds = new Set(skippedItemsRef.current.map(i => i.id))
    globalSeenIds.current = skippedIds
    const retryItems = await fetchCategoryTitles(cat, selectedTypes, globalSeenIds.current)
    retryItems.forEach(i => globalSeenIds.current.add(i.id))
    return retryItems
  }, [selectedTypes])

  // ── Completa onboarding ─────────────────────────────────────────────────────
  const completeOnboarding = useCallback(async () => {
    // Usa il ref per evitare stale closure — userId state potrebbe essere null
    // se la callback è stata catturata prima che l'auth check completasse
    const uid = userIdRef.current
    console.log('[Onboarding] completeOnboarding chiamato, uid:', uid, 'userId state:', userId)

    if (!uid) {
      console.error('[Onboarding] ERRORE: uid è null, impossibile completare onboarding')
      return
    }

    // 1. Batch write skippati → swipe_skipped
    if (skippedItemsRef.current.length > 0) {
      const rows = skippedItemsRef.current.map(item => ({
        user_id: uid,
        external_id: item.id,
        title: item.title,
        type: item.type,
      }))
      await supabase
        .from('swipe_skipped')
        .upsert(rows, { onConflict: 'user_id,external_id' })
    }

    // 2. Segna onboarding completato
    console.log('[Onboarding] aggiorno profiles con onboarding_done=true per uid:', uid)
    const { error: updateError } = await supabase.from('profiles').update({
      onboarding_done: true,
      onboarding_step: 3,
      preferred_types: selectedTypes.length > 0 ? selectedTypes : null,
    }).eq('id', uid)

    console.log('[Onboarding] update result:', updateError ? 'ERRORE: ' + updateError.message : 'OK')

    if (updateError) {
      console.error('[Onboarding] ERRORE aggiornamento profilo:', updateError)
      // Riprova una volta
      await supabase.from('profiles').update({ onboarding_done: true, onboarding_step: 3 }).eq('id', uid)
    }

    // 3. Aggiorna master pool in background
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
                disabled={!poolReady}
                className="flex-1 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 disabled:opacity-50 disabled:cursor-wait rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
              >
                {!poolReady ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Caricamento titoli…</>
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