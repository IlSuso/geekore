// DESTINAZIONE: src/app/api/recommendations/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// TASTE ENGINE V5 — "Full Signal Stack"
//
// Novità V5 rispetto al V4:
//   • Anti-ripetizione cross-sessione: tabella recommendations_shown, esclusione
//     titoli visti nelle ultime 2 settimane senza azione
//   • Seasonal Awareness APPLICATA: slot anime stagione corrente nel fetcher
//   • Award Boost APPLICATO: +8 matchScore nei fetcher (prima solo definito)
//   • Quality Gate APPLICATO: filtro vote_average/averageScore nei fetcher
//   • Release Freshness APPLICATA: moltiplicatore nei fetcher
//   • Sub-Genre filtro attivo: topThemes escludono titoli incompatibili
//   • Completion Rate AniList: completionPercentage come segnale qualità
//   • Runtime Preference: soft penalty ±20% per durate fuori range
//   • Lingua/Origine: boost/penalità per original_language su TMDb
//   • Social Proof boost: amici con similarity >70% → +15 matchScore
//   • Format Diversity: max 2 consecutivi dello stesso sotto-genere per sezione
//   • lowConfidence: passa al client per banner "Profilo in costruzione"
//
// Novità V4:
//   • Quality Gate: score minimo dinamico per TMDb/AniList/IGDB
//   • Release Freshness: moltiplicatore sull'anno di uscita
//   • Serendipity Slot: 1 jolly fuori profilo per sezione
//   • Award Boost: titoli acclamati +8 matchScore
//   • Seasonal Awareness: slot anime stagione corrente
//   • Confidence Score: lowConfidence flag quando profilo < 15 titoli
//   • Anti-ripetizione: esclude titoli già mostrati nelle ultime 2 settimane
//
// Novità V3 originali:
//   • Wishlist come AMPLIFICATORE del profilo (non solo esclusione)
//   • Session Velocity: quanto velocemente consumi = quanto ami
//   • Rewatch signal: titolo rivisto = peso ×3-5
//   • Creator/Studio tracking: studio/regista come segnale taste
//   • Continuity Engine: sequel/prequel/spinoff come prima card
//   • Sub-genre precision: tag AniList a livello fine
//   • Explanation V3: behavioral, creator-based, social-precision
//   • Binge Pattern Detection: watcher vs binger
//   • Trending × Taste boost
//   • Adaptive Windows per tipo di media
// ═══════════════════════════════════════════════════════════════════════════

export const maxDuration = 60

import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { memCacheGet, memCacheSet, memCacheInvalidate } from '@/lib/reco/cache'
import type { RecoMediaType, TasteProfile, Recommendation, MemCacheEntry } from '@/lib/reco/types'
import type { MediaType, UserEntry } from '@/lib/reco/engine-types'
import { loadRecommendationExposures } from '@/lib/reco/exposure'
import { FORCE_REGEN_COOLDOWN_MINUTES, MASTER_POOL_MAX_AGE_DAYS, MASTER_POOL_MIN_HEALTHY_SIZE, MASTER_POOL_SIZE_PER_TYPE, computePoolTTL, computeRegenDelta } from '@/lib/reco/pool'
import { buildDiversitySlots } from '@/lib/reco/slots'
import { computeTasteProfile } from '@/lib/reco/profile'
import { fetchContinuityRecs } from '@/lib/reco/continuity'
import { fetchAnimeRecs, fetchBoardgameRecs, fetchGameRecs, fetchMangaRecs, fetchMovieRecs, fetchTvRecs } from '@/lib/reco/fetchers'
import { applyFormatDiversity } from '@/lib/reco/scoring'
import { composeRecommendationRails } from '@/lib/reco/rails'
import { finishRegen, tryStartRegen } from '@/lib/reco/regen-lock'
import { sampleAndPersistFromMasterPool, serveFromSavedPool, refreshFromMasterPool } from '@/lib/reco/serving'


// Tipo Supabase client (evita any)
type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>


export async function GET(request: NextRequest) {
  try {
    // ── Background regen bypass ───────────────────────────────────────────────
    const { searchParams } = new URL(request.url)
    const serviceUserId = request.headers.get('X-Service-User-Id')
    const serviceSecret = request.headers.get('X-Service-Secret')
    const cronSecret = process.env.CRON_SECRET
    const isServiceCall = !!(serviceUserId && cronSecret && serviceSecret === cronSecret)

    logger.info('recommendations', `GET called, isServiceCall=${isServiceCall}`)

    // Rate limit solo per chiamate esterne — le interne sono già serializzate dal cron
    if (!isServiceCall) {
      const rl = rateLimit(request, { limit: 10, windowMs: 60_000 })
      if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    let supabase = await createClient()
    let userId: string

    if (isServiceCall) {
      // Crea client con service role per leggere dati dell'utente
      const { createClient: createServiceClient } = await import('@supabase/supabase-js')
      supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      ) as any
      userId = serviceUserId!
      logger.info('recommendations', `[SERVICE CALL] Regen per userId=${userId}`)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
      userId = user.id
    }

    const requestedType = searchParams.get('type') || 'all'
    const forceRefresh = searchParams.get('refresh') === '1'
    const similarToId = searchParams.get('similar_to_id') || null  // Fix 1.15: "simili a questo"
    const similarToGenres = searchParams.get('similar_to_genres')?.split(',').filter(Boolean) || []
    // Onboarding: utente nuovo senza entries → bypassa il filtro allTypesInCollection
    // e usa i tipi passati esplicitamente (o tutti e 5 se non specificati)
    const isOnboardingCall = searchParams.get('onboarding') === '1'
    const onboardingTypes = searchParams.get('types')?.split(',').filter(Boolean) as MediaType[] | undefined

    // ── FAST PATH: legge solo da recommendations_pool, zero API esterne ──────
    // Usato da page.tsx al mount → risposta in ~50ms
    const poolOnly = searchParams.get('source') === 'pool'
    console.log('[RECO] poolOnly:', poolOnly, 'forceRefresh:', forceRefresh, 'requestedType:', requestedType)
    if (poolOnly && !forceRefresh) {
      const served = await serveFromSavedPool(supabase, userId)
      if (served) {
        return NextResponse.json(served.payload, {
          headers: { 'X-Cache': served.cacheHeader || 'POOL_HIT' },
        })
      }
      // Pool vuota: segnala al client di fare il calcolo completo
      return NextResponse.json({ recommendations: {}, tasteProfile: null, cached: false, source: 'pool_empty' })
    }

    // REFRESH POOL: campiona dal master pool con logica a tier (senza ricalcolo profilo)
    // Chiamato dal tasto Aggiorna: veloce perche legge solo da Supabase, zero API esterne.
    const refreshPoolOnly = searchParams.get('source') === 'refresh_pool'
    if (refreshPoolOnly) {
      return NextResponse.json(await refreshFromMasterPool(supabase, userId))
    }

    // ── In-memory cache check — bypassa se similar_to query (sempre fresh) ───
    if (!forceRefresh && !similarToId) {
      const memHit = memCacheGet(userId)
      console.log('[RECO] memHit:', !!memHit)
      if (memHit) {
        // Per type=all ritorna SEMPRE tutti i dati — mai un sottoinsieme
        const recs = requestedType === 'all'
          ? memHit.data
          : { [requestedType]: memHit.data[requestedType] || [] }
        // Sanity check: se type=all ma i dati sembrano parziali (un solo tipo), non usare cache
        if (requestedType === 'all') {
          const types = Object.keys(recs).filter(k => Array.isArray(recs[k]) && recs[k].length > 0)
          if (types.length < 1) {
            // Cache vuota o corrotta — cade attraverso al ricalcolo
          } else {
            return NextResponse.json({ recommendations: recs, rails: composeRecommendationRails(recs, memHit.tasteProfile), tasteProfile: memHit.tasteProfile, cached: true }, {
              headers: { 'X-Cache': 'MEM_HIT' }
            })
          }
        } else {
          return NextResponse.json({ recommendations: recs, rails: composeRecommendationRails(recs, memHit.tasteProfile), tasteProfile: memHit.tasteProfile, cached: true }, {
            headers: { 'X-Cache': 'MEM_HIT' }
          })
        }
      }
    }

    // Leggi collezione completa
    const { data: entries } = await supabase
      .from('user_media_entries')
      .select('type, rating, genres, current_episode, episodes, status, is_steam, title, title_en, external_id, appid, updated_at, tags, keywords, themes, player_perspectives, studios, directors, authors, developer, rewatch_count, started_at')
      .eq('user_id', userId)

    const allEntries: UserEntry[] = (entries || []) as UserEntry[]

    // Timestamp dell'ultima modifica alla collezione
    const lastCollectionUpdate = allEntries.reduce((latest: Date, e: UserEntry) => {
      const t = new Date(e.updated_at || 0)
      return t > latest ? t : latest
    }, new Date(0))

    // ── Carica preferenze + wishlist + search history ─────────────────────────
    const [
      { data: preferences },
      { data: wishlistRaw },
      { data: searchHistory },
    ] = await Promise.all([
      supabase.from('user_preferences').select('*').eq('user_id', userId).single(),
      supabase.from('wishlist').select('external_id, genres, media_type, title, studios').eq('user_id', userId),
      supabase.from('search_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    ])

    const wishlistItems: UserEntry[] = (wishlistRaw || []).map((w: { external_id: string; genres: string[]; media_type: string; title: string; studios: string }) => ({
      title: w.title || '',
      type: (w.media_type || 'movie') as MediaType,
      external_id: w.external_id,
      genres: w.genres,
      studio: w.studios,
    }))
    const searches = searchHistory || []
    const userPlatformIds: number[] = (preferences as any)?.streaming_platforms || []

    // Compute taste profile
    const tasteProfile = computeTasteProfile(allEntries, preferences, wishlistItems, searches)

    // ── Deduplicazione robusta ────────────────────────────────────────────────
    const normalizeTitle = (t: string) =>
      t.toLowerCase()
       .replace(/^(the|a|an|il|lo|la|i|gli|le|un|uno|una)\s+/i, '')
       .replace(/[^a-z0-9]/g, '')

    const titleTokens = (t: string): Set<string> =>
      new Set(
        t.toLowerCase()
         .replace(/[^a-z0-9\s]/g, '')
         .split(/\s+/)
         .filter(w => w.length >= 4)
      )

    const hasTokenOverlap = (a: Set<string>, b: Set<string>, threshold = 0.6): boolean => {
      if (a.size === 0 || b.size === 0) return false
      let matches = 0
      for (const token of a) { if (b.has(token)) matches++ }
      return matches / Math.min(a.size, b.size) >= threshold
    }

    type OwnedByType = { ids: Set<string>; titles: Set<string>; tokenSets: Array<Set<string>> }
    const ownedByType = new Map<string, OwnedByType>()

    for (const type of ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']) {
      ownedByType.set(type, { ids: new Set(), titles: new Set(), tokenSets: [] })
    }

    for (const e of allEntries) {
      const type = e.type || 'movie'
      const bucket = ownedByType.get(type)
      if (!bucket) continue
      if (e.external_id) bucket.ids.add(e.external_id)
      if (e.appid) bucket.ids.add(String(e.appid))
      if (e.title) {
        bucket.titles.add(normalizeTitle(e.title))
        bucket.tokenSets.push(titleTokens(e.title))
      }
      if (e.title_en) {
        bucket.titles.add(normalizeTitle(e.title_en))
        bucket.tokenSets.push(titleTokens(e.title_en))
      }
    }

    for (const w of (wishlistRaw || [])) {
      const type = w.media_type || 'movie'
      const bucket = ownedByType.get(type)
      if (!bucket) continue
      if (w.external_id) bucket.ids.add(w.external_id)
      if (w.title) {
        bucket.titles.add(normalizeTitle(w.title))
        bucket.tokenSets.push(titleTokens(w.title))
      }
    }

    const isAlreadyOwned = (type: string, id: string, title: string): boolean => {
      const bucket = ownedByType.get(type)
      if (!bucket) return false
      if (bucket.ids.has(id)) return true
      const norm = normalizeTitle(title)
      if (norm && bucket.titles.has(norm)) return true
      const tokens = titleTokens(title)
      if (tokens.size >= 2) {
        for (const existing of bucket.tokenSets) {
          if (hasTokenOverlap(tokens, existing)) return true
        }
      }
      return false
    }

    const ownedIds = new Set<string>([
      ...allEntries.map(e => e.external_id).filter((x): x is string => Boolean(x)),
      ...allEntries.map(e => String(e.appid ?? '')).filter(Boolean),
      ...wishlistItems.map(w => w.external_id).filter((x): x is string => Boolean(x)),
    ])

    const tmdbToken = process.env.TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    const ALL_MEDIA_TYPES: MediaType[] = ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']

    // Tipi per cui l'utente ha almeno 1 titolo in collezione (o wishlist)
    const allTypesInCollection = new Set<string>([
      ...allEntries.map(e => e.type),
      ...wishlistItems.map(w => w.type),
    ])

    // I tipi vengono inclusi solo se l'utente ha già contenuti di quel tipo —
    // ECCEZIONE: in modalità onboarding il profilo è vuoto per definizione,
    // quindi usiamo i tipi passati esplicitamente (o tutti e 5 come fallback)
    // boardgame è sempre incluso anche senza import BGG (consigli universali)
    const ALWAYS_INCLUDE: MediaType[] = ['boardgame']
    // Per la regen del master pool usiamo sempre tutti i tipi della collezione
    // anche se requestedType è un singolo tipo (es. 'anime') — così il pool viene
    // sempre ricalcolato completo quando scatta la regen
    const typesToFetch: MediaType[] = isOnboardingCall
      ? (onboardingTypes && onboardingTypes.length > 0 ? onboardingTypes : ALL_MEDIA_TYPES)
      : ALL_MEDIA_TYPES.filter(t => allTypesInCollection.has(t) || ALWAYS_INCLUDE.includes(t))
    // Il tipo richiesto esplicitamente viene comunque incluso
    if (requestedType !== 'all' && !typesToFetch.includes(requestedType as MediaType)) {
      typesToFetch.push(requestedType as MediaType)
    }

    // ── V6: Carica titoli mostrati nella sessione corrente (TTL: 4h) ──────────
    // NON escludiamo titoli per settimane — solo quelli mostrati nelle ultime 4 ore
    // così ogni sessione di navigazione vede facce nuove, ma il pool rimane intatto
    const recommendationExposures = await loadRecommendationExposures(supabase, userId)

    // ── V6: Carica socialFavorites ────────────────────────────────────────────
    const { data: similarFriends } = await supabase
      .from('taste_similarity')
      .select('other_user_id, similarity_score')
      .eq('user_id', userId)
      .gte('similarity_score', 70)
      .order('similarity_score', { ascending: false })
      .limit(5)

    const socialFavorites = new Map<string, string>()
    if (similarFriends && similarFriends.length > 0) {
      const friendIds = similarFriends.map((f: any) => f.other_user_id)
      const { data: friendEntries } = await supabase
        .from('user_media_entries')
        .select('user_id, external_id, rating')
        .in('user_id', friendIds)
        .gte('rating', 4)

      if (friendEntries) {
        for (const fe of friendEntries) {
          if (!fe.external_id || ownedIds.has(fe.external_id)) continue
          if (!socialFavorites.has(fe.external_id)) {
            const friend = similarFriends.find((f: any) => f.other_user_id === fe.user_id)
            if (friend) socialFavorites.set(fe.external_id, `${Math.round(friend.similarity_score)}%`)
          }
        }
      }
    }

    // ── V6: Controlla se il pool esiste ed è ancora valido ───────────────────
    // Fix 1.13: TTL dinamico basato sull'attività recente
    const dynamicTTL = computePoolTTL(allEntries)
    const poolCutoff = new Date(Date.now() - dynamicTTL * 60 * 60 * 1000).toISOString()

    const { data: poolRows } = await supabase
      .from('recommendations_pool')
      .select('media_type, data, generated_at, collection_hash')
      .eq('user_id', userId)
      .in('media_type', typesToFetch)

    // Hash semplice della collezione: numero di entry + timestamp ultima modifica
    const collectionHash = `${allEntries.length}_${lastCollectionUpdate.getTime()}`

    // Conta entry per tipo — usato per hasGrown per-tipo e collection_size per-tipo
    const entriesByType = new Map<string, number>()
    for (const type of typesToFetch) {
      entriesByType.set(type, allEntries.filter((e: any) => e.type === type).length)
    }

    // ── MASTER POOL: controlla se esiste ed è ancora valido ──────────────────
    // Una riga per tipo, data = array Recommendation completi (cover, matchScore, isDiscovery inclusi)
    // Viene rigenerato solo se: troppo piccolo, età > 7gg E collezione +10 titoli, o forceRefresh
    const masterPoolCutoff = new Date(Date.now() - MASTER_POOL_MAX_AGE_DAYS * 24 * 3600 * 1000).toISOString()

    const { data: masterPoolRows } = await supabase
      .from('master_recommendations_pool')
      .select('media_type, data, collection_hash, collection_size, generated_at')
      .eq('user_id', userId)
      .in('media_type', typesToFetch)

    // Raggruppa master pool per tipo — data è già array Recommendation completo
    const masterByType = new Map<string, Recommendation[]>()
    for (const row of (masterPoolRows || [])) {
      if (Array.isArray(row.data)) masterByType.set(row.media_type, row.data as Recommendation[])
    }

    // Determina se il master pool va rigenerato
    // Il trigger è basato sul TOTALE titoli nel profilo (tutti i media combined),
    // non per singolo tipo. Il delta cresce con la dimensione del profilo.
    const totalCollectionSize = allEntries.length
    const regenDelta = computeRegenDelta(totalCollectionSize)

    // collection_size salvato nel pool — usiamo il valore del primo tipo disponibile
    // come riferimento del totale al momento dell'ultima regen
    // collection_size ora contiene il totale collezione al momento dell'ultima regen
    // quindi basta prendere il valore di una qualsiasi riga (sono tutti uguali)
    const savedTotalSize = (masterPoolRows || [])[0]?.collection_size || 0

    const totalHasGrown = totalCollectionSize - savedTotalSize >= regenDelta
    const rowByType = new Map((masterPoolRows || []).map((row: any) => [row.media_type, row]))
    const masterHealthByType = new Map<string, { missing: boolean; tooSmall: boolean; expired: boolean; invalidated: boolean; usable: boolean }>()
    for (const type of typesToFetch) {
      const items = masterByType.get(type) || []
      const row = rowByType.get(type)
      const generatedAt = row?.generated_at ? new Date(row.generated_at).getTime() : 0
      const ageHours = generatedAt ? (Date.now() - generatedAt) / 3600000 : Infinity
      masterHealthByType.set(type, {
        missing: !row || items.length === 0,
        tooSmall: !!row && items.length > 0 && items.length < MASTER_POOL_MIN_HEALTHY_SIZE && ageHours >= 24,
        expired: !!row && (!row.generated_at || new Date(row.generated_at).getTime() < new Date(masterPoolCutoff).getTime()),
        invalidated: row?.collection_size === -1,
        usable: !!row && items.length > 0 && row?.collection_size !== -1,
      })
    }

    const typesNeedingMasterRegen: MediaType[] = []
    const typesToRegenBackground: MediaType[] = []

    // Rigenera in modo sincrono solo quando non abbiamo nulla di servibile.
    // Se un master esiste ma e vecchio/piccolo, serviamo subito quello e rifacciamo il master in background.
    if (forceRefresh) {
      for (const type of typesToFetch) {
        const health = masterHealthByType.get(type)
        const row = rowByType.get(type)
        const generatedAt = row?.generated_at ? new Date(row.generated_at).getTime() : 0
        const ageMinutes = generatedAt ? (Date.now() - generatedAt) / 60000 : Infinity
        if (!health || health.missing || health.invalidated || ageMinutes >= FORCE_REGEN_COOLDOWN_MINUTES) {
          typesNeedingMasterRegen.push(type as MediaType)
        }
      }
    } else {
      for (const type of typesToFetch) {
        const health = masterHealthByType.get(type)
        if (!health) continue
        if (health.missing || health.invalidated) typesNeedingMasterRegen.push(type as MediaType)
        else if (health.usable && (health.tooSmall || health.expired || totalHasGrown)) typesToRegenBackground.push(type as MediaType)
      }
    }

    console.log('[RECO] typesNeedingMasterRegen:', typesNeedingMasterRegen)
    console.log('[RECO] typesToRegenBackground:', typesToRegenBackground)
    console.log('[RECO] entriesByType:', Object.fromEntries(entriesByType))
    console.log('[RECO] masterPoolRows types:', (masterPoolRows || []).map((r: any) => `${r.media_type}:${r.collection_size}`))

    // ── Rigenera master pool in background per i tipi che lo necessitano ─────
    if (typesNeedingMasterRegen.length > 0) {
      const emptyShownIds = new Set<string>()

      const continuityRecsPromise = (typesNeedingMasterRegen.includes('anime') || typesNeedingMasterRegen.includes('manga'))
        ? fetchContinuityRecs(allEntries, ownedIds, tasteProfile, supabase)
        : Promise.resolve([])

      const [continuityRecs, ...masterResults] = await Promise.all([
        continuityRecsPromise,
        ...typesNeedingMasterRegen.map(async type => {
          // Usa MASTER_POOL_SIZE_PER_TYPE slot → raccoglie molti più candidati
          const slots = buildDiversitySlots(type, tasteProfile, MASTER_POOL_SIZE_PER_TYPE)
          if (slots.length === 0) return { type, items: [] as Recommendation[] }
          switch (type) {
            case 'anime': return { type, items: await fetchAnimeRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites) }
            case 'manga': return { type, items: await fetchMangaRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds, socialFavorites) }
            case 'movie': return { type, items: await fetchMovieRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds) }
            case 'tv':    return { type, items: await fetchTvRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds) }
            case 'game':  return { type, items: await fetchGameRecs(slots, ownedIds, tasteProfile, igdbClientId, igdbClientSecret, isAlreadyOwned, emptyShownIds) }
            case 'boardgame': return { type, items: await fetchBoardgameRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds) }
            default: return { type, items: [] as Recommendation[] }
          }
        })
      ])

      // Prepend continuity recs per tipo
      const continuityByType = new Map<string, Recommendation[]>()
      for (const contRec of continuityRecs) {
        const arr = continuityByType.get(contRec.type) || []
        arr.push(contRec)
        continuityByType.set(contRec.type, arr)
      }

      // Aggiorna masterByType + salva su Supabase (upsert — una riga per tipo)
      const masterUpserts: any[] = []
      for (const result of masterResults) {
        if (!result?.type || !result.items.length) continue
        const type = result.type as MediaType

        const contRecs = continuityByType.get(type) || []
        const contIds = new Set(contRecs.map(r => r.id))
        // Nel master pool mantieni solo titoli con affinità >= 40%: sotto soglia non vengono mai campionati.
        // I continuity recs (sequel/prequel) sono esenti dal filtro: hanno priorità speciale.
        const allItems: Recommendation[] = [
          ...contRecs,
          ...result.items.filter(r => !contIds.has(r.id) && r.matchScore >= 40),
        ]

        masterByType.set(type, allItems)
        console.log(`[RECO] result type=${type} items=${result.items.length} allItems=${allItems.length}`)
        masterUpserts.push({
          user_id: userId,
          media_type: type,
          data: allItems,
          collection_hash: collectionHash,
          collection_size: totalCollectionSize,
          generated_at: new Date().toISOString(),
        })
      }

      console.log('[RECO] masterResults length:', masterResults.length)
      console.log('[RECO] masterResults types:', masterResults.map(r => `${r?.type}:${r?.items?.length ?? 'null'}`))

      // Await — garantisce che il master sia scritto prima che il pool venga campionato
      if (masterUpserts.length > 0) {
        console.log('[RECO] upserting master pool:', masterUpserts.map(u => `${u.media_type}:${u.data.length}items:size${u.collection_size}`))
        const { error: upsertError, data: upsertData } = await supabase.from('master_recommendations_pool')
          .upsert(masterUpserts, { onConflict: 'user_id,media_type' })
          .select('media_type, collection_size, generated_at')
        if (upsertError) console.log('[RECO] upsert ERROR:', JSON.stringify(upsertError))
        else console.log('[RECO] upsert SUCCESS, rows written:', JSON.stringify(upsertData?.map(r => `${r.media_type}:${r.collection_size}`)))
      } else {
        console.log('[RECO] masterUpserts is EMPTY — nothing written to pool')
      }
    }

    // ── Rigenera in background i tipi ASSENTI dal master pool ────────────────
    // Questi tipi non hanno ancora nessuna riga in master_recommendations_pool.
    // Li rigeneriamo in fire-and-forget: la risposta corrente non li aspetta
    // (saranno disponibili alla prossima chiamata), ma vengono comunque generati
    // e salvati su Supabase dietro le quinte, uno per uno, per evitare timeout.
    const backgroundRegenTypes = typesToRegenBackground.filter(type =>
      tryStartRegen(`${userId}:${type}:${collectionHash}`)
    )
    if (backgroundRegenTypes.length > 0) {
      ;(async () => {
        const emptyShownIds = new Set<string>()
        const continuityRecsForBg = (backgroundRegenTypes.includes('anime') || backgroundRegenTypes.includes('manga'))
          ? await fetchContinuityRecs(allEntries, ownedIds, tasteProfile, supabase).catch(() => [])
          : []
        const continuityByTypeBg = new Map<string, Recommendation[]>()
        for (const contRec of continuityRecsForBg) {
          const arr = continuityByTypeBg.get(contRec.type) || []
          arr.push(contRec)
          continuityByTypeBg.set(contRec.type, arr)
        }
        for (const type of backgroundRegenTypes) {
          const regenKey = `${userId}:${type}:${collectionHash}`
          try {
            const slots = buildDiversitySlots(type, tasteProfile, MASTER_POOL_SIZE_PER_TYPE)
            if (slots.length === 0) continue
            let items: Recommendation[] = []
            switch (type) {
              case 'anime': items = await fetchAnimeRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites); break
              case 'manga': items = await fetchMangaRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds, socialFavorites); break
              case 'movie': items = await fetchMovieRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds); break
              case 'tv':    items = await fetchTvRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds); break
              case 'game':  items = await fetchGameRecs(slots, ownedIds, tasteProfile, igdbClientId, igdbClientSecret, isAlreadyOwned, emptyShownIds); break
              case 'boardgame': items = await fetchBoardgameRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds); break
            }
            if (!items.length) continue
            const contRecs = continuityByTypeBg.get(type) || []
            const contIds = new Set(contRecs.map(r => r.id))
            const allItems = applyFormatDiversity([
              ...contRecs,
              ...items.filter(r => !contIds.has(r.id)),
            ], type)
            await supabase.from('master_recommendations_pool').upsert({
              user_id: userId,
              media_type: type,
              data: allItems,
              collection_hash: collectionHash,
              collection_size: totalCollectionSize,
              generated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,media_type' })
          } catch { /* ignora errori singoli tipi: non blocca gli altri */ }
          finally {
            finishRegen(regenKey)
          }
        }
      })()
    }

    // ── Campiona dal master pool → recommendations_pool ─────────────────────
    // Usa logica a tier: 10 da 80-100%, 5 da 60-79%, 5 da 40-59% (con cascata).
    // Se il master non esiste per un tipo → vuoto.

    const {
      recommendations,
      poolByType,
      diagnostics: servingDiagnostics,
    } = await sampleAndPersistFromMasterPool({
      supabase,
      userId,
      typesToFetch,
      masterByType,
      exposures: recommendationExposures,
      collectionHash,
      totalEntries: allEntries.length,
      isAlreadyOwned,
    })

    // Salva creator profile aggiornato (fire-and-forget)
    ;(async () => {
      const topStudios = Object.entries(tasteProfile.creatorScores.studios).sort(([,a],[,b]) => b - a).slice(0, 30)
      const topDirectors = Object.entries(tasteProfile.creatorScores.directors).sort(([,a],[,b]) => b - a).slice(0, 30)
      await supabase.from('user_creator_profile').upsert({
        user_id: userId,
        studios: Object.fromEntries(topStudios),
        directors: Object.fromEntries(topDirectors),
        authors: Object.fromEntries(Object.entries(tasteProfile.creatorScores.authors).sort(([,a],[,b]) => b - a).slice(0, 20)),
        developers: Object.fromEntries(Object.entries(tasteProfile.creatorScores.developers).sort(([,a],[,b]) => b - a).slice(0, 20)),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    })()

    // ── Serve dal pool — i titoli (max 20) sono già stati campionati con logica a tier
    // Li serviamo direttamente senza ulteriori manipolazioni.

    // ── V6: Registra i titoli mostrati (sessione corrente) ────────────────────

    // ── Popola in-memory cache ────────────────────────────────────────────────
    const topStudiosForResponse = Object.entries(tasteProfile.creatorScores.studios).sort(([,a],[,b]) => b - a).slice(0, 5)
    const topDirectorsForResponse = Object.entries(tasteProfile.creatorScores.directors).sort(([,a],[,b]) => b - a).slice(0, 5)

    const tasteProfileResponse = {
      globalGenres: tasteProfile.globalGenres,
      topGenres: tasteProfile.topGenres,
      collectionSize: tasteProfile.collectionSize,
      recentWindow: tasteProfile.recentWindow,
      deepSignals: {
        topThemes: Object.entries(tasteProfile.deepSignals.themes)
          .sort(([, a], [, b]) => b - a).slice(0, 5).map(([k]) => k),
        topTones: Object.entries(tasteProfile.deepSignals.tones)
          .sort(([, a], [, b]) => b - a).slice(0, 5).map(([k]) => k),
        topSettings: Object.entries(tasteProfile.deepSignals.settings)
          .sort(([, a], [, b]) => b - a).slice(0, 4).map(([k]) => k),
      },
      discoveryGenres: tasteProfile.discoveryGenres,
      negativeGenres: Object.keys(tasteProfile.negativeGenres).slice(0, 5),
      creatorScores: {
        topStudios: topStudiosForResponse.map(([name, score]) => ({ name, score })),
        topDirectors: topDirectorsForResponse.map(([name, score]) => ({ name, score })),
      },
      bingeProfile: tasteProfile.bingeProfile,
      wishlistGenres: tasteProfile.wishlistGenres,
      searchIntentGenres: tasteProfile.searchIntentGenres,
    }
    memCacheSet(userId, recommendations, tasteProfile)

    // Aggiorna solo taste_profile e total_entries nel pool (fast path) — NON sovrascrive data
    // I dati del pool (i 15 titoli) sono già stati scritti sopra dal campionamento master
    const profileUpdateUpserts = Object.keys(recommendations)
      .filter(type => (poolByType.get(type as MediaType) || []).length > 0)
      .map(type => ({
        user_id: userId,
        media_type: type,
        data: poolByType.get(type as MediaType) || [],
        generated_at: new Date().toISOString(),
        collection_hash: collectionHash,
        taste_profile: tasteProfileResponse,
        total_entries: allEntries.length,
      }))
    if (profileUpdateUpserts.length > 0) {
      supabase.from('recommendations_pool').upsert(profileUpdateUpserts, {
        onConflict: 'user_id,media_type',
      }).then(() => {})
    }

    return NextResponse.json({
      recommendations,
      rails: composeRecommendationRails(recommendations, tasteProfile),
      tasteProfile: {
        ...tasteProfileResponse,
        lowConfidence: tasteProfile.lowConfidence,
        totalEntries: allEntries.length,
      },
      cached: false,
      recommendationDiagnostics: {
        ...servingDiagnostics,
        backgroundRegenQueued: backgroundRegenTypes,
        syncRegenTypes: typesNeedingMasterRegen,
        poolHealth: Object.fromEntries([...masterHealthByType.entries()].map(([type, health]) => {
          const row = rowByType.get(type)
          const generatedAt = row?.generated_at ? new Date(row.generated_at).getTime() : 0
          return [type, {
            ...health,
            size: (masterByType.get(type) || []).length,
            ageHours: generatedAt ? Math.round(((Date.now() - generatedAt) / 3600000) * 10) / 10 : null,
          }]
        })),
      },
    })

  } catch (error) {
    logger.error('Recommendations V6', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

// POST /api/recommendations?invalidateCache=true
// Chiamato dal client dopo aver aggiunto un titolo — svuota la memCache
// così la prossima apertura di Per Te triggera una regen fresca
export async function POST(request: NextRequest) {
  try {
    const invalidateCache = request.nextUrl.searchParams.get('invalidateCache')
    if (invalidateCache !== 'true') return NextResponse.json({ ok: false }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    memCacheInvalidate(user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
