// src/app/api/steam/enrich-genres/route.ts
// #23: Fuzzy matching IGDB per giochi con nomi in casing diverso
//      (ELDEN RING → Elden Ring, Half-Life: Alyx, Pokémon, ecc.)
// S5:  Sostituisce console.log/error con logger (nessun dato sensibile in prod)
//
// Strategia di match in ordine di priorità:
//   1. Match esatto case-insensitive
//   2. Match con normalizzazione: rimuovi ™®©, sostituisci - con spazio, ecc.
//   3. Search IGDB fuzzy: cerca il titolo con l'endpoint /search e prende il primo risultato

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rateLimit'
import { checkOrigin } from '@/lib/csrf'

// ── IGDB token cache ──────────────────────────────────────────────────────────
let igdbTokenCache: { token: string; expiresAt: number } | null = null

async function getIgdbToken(): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID
  const clientSecret = process.env.IGDB_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const now = Date.now()
  if (igdbTokenCache && igdbTokenCache.expiresAt > now + 60_000) return igdbTokenCache.token

  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    igdbTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
    return igdbTokenCache.token
  } catch {
    return null
  }
}

// ── #23 Normalizzazione nomi giochi ──────────────────────────────────────────
function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    // Rimuovi simboli TM, R, copyright
    .replace(/[™®©]/g, '')
    // Normalizza apici e trattini
    .replace(/[''`]/g, "'")
    .replace(/[–—]/g, '-')
    // Rimuovi sottotitoli dopo ": " (spesso diversi tra Steam e IGDB)
    // Commentato: troppo aggressivo. Usiamo il titolo completo come fallback
    // .replace(/\s*:\s*.+$/, '')
    // Comprimi spazi multipli
    .replace(/\s+/g, ' ')
    .trim()
}

// Genera varianti del nome per provare match alternativi
function generateVariants(name: string): string[] {
  const normalized = normalizeGameName(name)
  const variants = new Set<string>([
    name.toLowerCase(),
    normalized,
    // Title case: "ELDEN RING" → "Elden Ring"
    name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).toLowerCase(),
    // Rimuovi articolo iniziale: "The Witcher 3" → "Witcher 3"
    normalized.replace(/^(the|a|an)\s+/i, ''),
    // Rimuovi tutto dopo " - " (edizioni speciali: "Game - Deluxe Edition")
    normalized.replace(/\s+-\s+.+$/, '').trim(),
    // Rimuovi tutto dopo ": "
    normalized.replace(/\s*:\s+.+$/, '').trim(),
  ])
  return [...variants].filter(v => v.length > 0)
}

// ── Batch exact match con IGDB ────────────────────────────────────────────────
async function fetchExactBatch(
  gameNames: string[],
  clientId: string,
  token: string
): Promise<Map<string, { genres: string[]; themes: string[]; keywords: string[]; player_perspectives: string[]; game_modes: string[] }>> {
  const result = new Map<string, any>()
  if (gameNames.length === 0) return result

  const CHUNK = 10
  for (let i = 0; i < gameNames.length; i += CHUNK) {
    const chunk = gameNames.slice(i, i + CHUNK)

    // Genera tutte le varianti per questo chunk
    const allVariants: string[] = []
    const variantToOriginal = new Map<string, string>()
    for (const name of chunk) {
      for (const v of generateVariants(name)) {
        allVariants.push(v)
        variantToOriginal.set(v, name.toLowerCase())
      }
    }

    const searchNames = allVariants
      .map(n => `"${n.replace(/"/g, '').replace(/'/g, "\\'")}"`)
      .join(',')

    try {
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body: `
          fields name, genres.name, themes.name, keywords.name,
                 player_perspectives.name, game_modes.name;
          where name = (${searchNames});
          limit ${Math.min(allVariants.length * 2, 50)};
        `,
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) continue
      const games = await res.json()
      if (!Array.isArray(games)) continue

      for (const game of games) {
        const igdbNameLower = game.name.toLowerCase()
        const igdbNameNorm = normalizeGameName(game.name)

        // Trova quale dei nomi originali corrisponde
        let originalName: string | undefined

        // Controlla se qualche variante corrisponde
        for (const [variant, original] of variantToOriginal.entries()) {
          if (
            igdbNameLower === variant ||
            igdbNameNorm === normalizeGameName(variant)
          ) {
            originalName = original
            break
          }
        }

        if (!originalName) continue

        // Non sovrascrivere se già trovato con un match precedente
        if (result.has(originalName)) continue

        result.set(originalName, {
          genres: game.genres?.map((g: any) => g.name).filter(Boolean) || [],
          themes: game.themes?.map((t: any) => t.name).filter(Boolean) || [],
          keywords: game.keywords?.map((k: any) => k.name).filter(Boolean).slice(0, 10) || [],
          player_perspectives: game.player_perspectives?.map((p: any) => p.name).filter(Boolean) || [],
          game_modes: game.game_modes?.map((m: any) => m.name).filter(Boolean) || [],
        })
      }

      if (i + CHUNK < gameNames.length) {
        await new Promise(r => setTimeout(r, 350))
      }
    } catch {
      // Continua col prossimo chunk
    }
  }

  return result
}

// ── #23 Fuzzy search per giochi non trovati con match esatto ─────────────────
async function fetchFuzzyOne(
  gameName: string,
  clientId: string,
  token: string
): Promise<{ genres: string[]; themes: string[] } | null> {
  // Usa l'endpoint /search di IGDB che è molto più flessibile
  const cleanName = normalizeGameName(gameName)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleanName.length < 2) return null

  try {
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: `
        search "${cleanName.replace(/"/g, '')}";
        fields name, genres.name, themes.name;
        limit 3;
      `,
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) return null
    const games = await res.json()
    if (!Array.isArray(games) || games.length === 0) return null

    // Prende il primo risultato solo se il nome è ragionevolmente simile
    const first = games[0]
    const similarity = nameSimilarity(cleanName, normalizeGameName(first.name))
    if (similarity < 0.5) return null

    return {
      genres: first.genres?.map((g: any) => g.name).filter(Boolean) || [],
      themes: first.themes?.map((t: any) => t.name).filter(Boolean) || [],
    }
  } catch {
    return null
  }
}

// Calcola similarità tra due stringhe (0-1) con Jaccard sulle parole
function nameSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 1))
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 1))
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }

  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}

// ── Handler principale ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Rate limit: max 2 enrichment ogni 10 minuti (operazione pesante)
  const rl = rateLimit(request, { limit: 2, windowMs: 10 * 60_000, prefix: 'enrich-genres' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Troppi arricchimenti. Riprova tra qualche minuto.' },
      { status: 429, headers: rl.headers }
    )
  }
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })
  }

  const clientId = process.env.IGDB_CLIENT_ID
  const token = await getIgdbToken()

  if (!clientId || !token) {
    return NextResponse.json({ error: 'IGDB non configurato' }, { status: 500, headers: rl.headers })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Configurazione Supabase server mancante' }, { status: 503, headers: rl.headers })
  }

  const supabaseService = createServiceClient('steam-enrich-genres:update-owned-games')

  const { data: steamGames, error } = await supabaseService
    .from('user_media_entries')
    .select('id, title, genres')
    .eq('user_id', user.id)
    .eq('type', 'game')
    .eq('is_steam', true)

  if (error || !steamGames?.length) {
    return NextResponse.json({ enriched: 0, message: 'Nessun gioco Steam trovato' }, { headers: rl.headers })
  }

  const withoutGenres = steamGames.filter(g => !g.genres || g.genres.length === 0)

  if (withoutGenres.length === 0) {
    return NextResponse.json({ enriched: 0, message: 'Tutti i giochi hanno già i generi' }, { headers: rl.headers })
  }

  logger.log('Enrich', `Processing ${withoutGenres.length} games without genres`)

  const gameNames = withoutGenres.map(g => g.title)

  // Fase 1: batch exact match (con varianti)
  const metaMap = await fetchExactBatch(gameNames, clientId, token)
  logger.log('Enrich', `Exact match: ${metaMap.size} / ${withoutGenres.length}`)

  // Fase 2: fuzzy search per i rimanenti (giochi indie/rari)
  const notFound = withoutGenres.filter(g => !metaMap.has(g.title.toLowerCase()))
  let fuzzyCount = 0

  if (notFound.length > 0) {
    // Fuzzy in sequenza (no burst sull'API)
    for (const game of notFound.slice(0, 20)) { // max 20 fuzzy per request
      const meta = await fetchFuzzyOne(game.title, clientId, token)
      if (meta && (meta.genres.length > 0 || meta.themes.length > 0)) {
        metaMap.set(game.title.toLowerCase(), {
          genres: meta.genres,
          themes: meta.themes,
          keywords: [],
          player_perspectives: [],
          game_modes: [],
        })
        fuzzyCount++
      }
      // Throttle per non abusare dell'API
      await new Promise(r => setTimeout(r, 200))
    }
    logger.log('Enrich', `Fuzzy match: ${fuzzyCount} additional`)
  }

  // Applica aggiornamenti in batch
  const toUpdate = withoutGenres
    .map(game => ({ game, meta: metaMap.get(game.title.toLowerCase()) }))
    .filter((x): x is { game: typeof withoutGenres[0]; meta: NonNullable<typeof metaMap extends Map<any, infer V> ? V : never> } =>
      !!x.meta && x.meta.genres.length > 0
    )

  const BATCH = 10
  let enrichedCount = 0

  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const results = await Promise.allSettled(
      toUpdate.slice(i, i + BATCH).map(({ game, meta }) =>
        supabaseService
          .from('user_media_entries')
          .update({
            genres: meta.genres,
            themes: meta.themes?.length ? meta.themes : undefined,
            keywords: meta.keywords?.length ? meta.keywords : undefined,
            player_perspectives: meta.player_perspectives?.length ? meta.player_perspectives : undefined,
            game_modes: meta.game_modes?.length ? meta.game_modes : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id)
      )
    )
    enrichedCount += results.filter(r => r.status === 'fulfilled').length
  }

  return NextResponse.json({
    enriched: enrichedCount,
    total: withoutGenres.length,
    exact_match: metaMap.size - fuzzyCount,
    fuzzy_match: fuzzyCount,
    message: `Arricchiti ${enrichedCount} giochi su ${withoutGenres.length} (${fuzzyCount} via fuzzy search)`,
  }, { headers: rl.headers })
}

// GET — stesso comportamento, utile per chiamata dal browser
export async function GET(request: NextRequest) {
  return POST(request)
}
