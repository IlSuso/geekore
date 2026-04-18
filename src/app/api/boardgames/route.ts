import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { parseStringPromise } from 'xml2js'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { translateWithCache } from '@/lib/deepl'

const CACHE_DURATION_MS = 86400000 // 24 ore

function bggHeaders(): HeadersInit {
  const token = process.env.BGG_BEARER_TOKEN
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function bggFetch(url: string, maxRetries = 5, delayMs = 2000): Promise<string | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, delayMs))
    try {
      const res = await fetch(url, { cache: 'no-store', headers: bggHeaders(), signal: AbortSignal.timeout(15000) })
      if (res.status === 202) continue
      if (!res.ok) {
        console.error(`[BGG] HTTP ${res.status} per ${url}`)
        return null
      }
      const text = await res.text()
      if (!text.trim().startsWith('<')) {
        logger.error('[BGG] Risposta non XML:', text.slice(0, 200))
        return null
      }
      return text
    } catch (e) {
      logger.error(`[BGG] Errore rete tentativo ${attempt}:`, e)
      if (attempt === maxRetries - 1) return null
    }
  }
  logger.error('[BGG] Tutti i tentativi esauriti per', url)
  return null
}

export async function GET(request: NextRequest) {
  // ── Rate limiting: 20 req/min per IP ──────────────────────────────────────
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'bgg' })
  if (!rl.ok) {
    return NextResponse.json(
      { results: [], error: 'Troppe richieste. Riprova tra qualche secondo.' },
      { status: 429, headers: rl.headers }
    )
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get("search") || searchParams.get("q")
  const lang = searchParams.get("lang") || 'it'

  // ── MODALITÀ RICERCA ─────────────────────────────────────────────────────
  if (search) {
    // Validazione server-side
    if (typeof search !== 'string' || search.trim().length < 2 || search.length > 200) {
      return NextResponse.json(
        { results: [] },
        { status: 400, headers: rl.headers }
      )
    }

    // Controlla caratteri non consentiti (prevenzione injection XML)
    const dangerous = /<|>|&(?!amp;|lt;|gt;|quot;|apos;)/
    if (dangerous.test(search)) {
      return NextResponse.json(
        { results: [] },
        { status: 400, headers: rl.headers }
      )
    }

    const term = search.trim()
    // BGG interpreta ':' come operatore campo:valore — lo sostituiamo con uno spazio
    const bggQuery = term.replace(/:/g, ' ').replace(/\s+/g, ' ').trim()
    const endpoints = [
      `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(bggQuery)}&type=boardgame`,
    ]

    let searchXml: string | null = null
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { cache: 'no-store', headers: bggHeaders() })
        if (res.status === 202) continue
        if (!res.ok) continue
        const text = await res.text()
        if (!text.trim().startsWith('<')) continue
        searchXml = text
        break
      } catch (e) {
        logger.error(`[BGG] errore su ${endpoint}:`, e)
      }
    }

    if (!searchXml) {
      return NextResponse.json(
        { results: [], error: 'BGG non raggiungibile' },
        { headers: rl.headers }
      )
    }

    try {
      const searchResult = await parseStringPromise(searchXml)
      const allItems: any[] = searchResult?.items?.item || []

      // BGG restituisce tutti i match nel search response con i nomi inclusi.
      // Ordiniamo per rilevanza del titolo PRIMA di fetchare i dettagli,
      // così i 20 che fetcheremo sono sempre i più pertinenti alla query.
      const q = bggQuery.toLowerCase()
      const sortedItems = [...allItems].sort((a: any, b: any) => {
        const nameA = (a.name?.find?.((n: any) => n.$?.type === 'primary')?.$.value || '').toLowerCase()
        const nameB = (b.name?.find?.((n: any) => n.$?.type === 'primary')?.$.value || '').toLowerCase()
        const score = (t: string) => t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3
        return score(nameA) - score(nameB)
      })

      const items = sortedItems.slice(0, 20)
      const ids = items.map((i: any) => i.$.id).join(',')

      if (items.length === 0) return NextResponse.json({ results: [] }, { headers: rl.headers })

      await new Promise(r => setTimeout(r, 600))

      const detailXml = await bggFetch(
        `https://boardgamegeek.com/xmlapi2/thing?id=${ids}&type=boardgame&stats=1`
      )
      if (!detailXml) return NextResponse.json({ results: [] }, { headers: rl.headers })

      const detailResult = await parseStringPromise(detailXml)
      const detailItems: any[] = detailResult?.items?.item || []

      const rawResults: any[] = detailItems.map((item: any) => {
        const id = item.$.id
        const nameEl = (item.name || []).find((n: any) => n.$.type === 'primary')
        const title = nameEl?.$.value || 'Senza titolo'

        const thumb = item.thumbnail?.[0]?.trim?.() || item.thumbnail?.[0]
        const fullImg = item.image?.[0]?.trim?.() || item.image?.[0]
        const rawImage = fullImg || thumb
        const coverImage = rawImage
          ? (rawImage.startsWith('http') ? rawImage : `https:${rawImage}`)
          : ''

        const year = item.yearpublished?.[0]?.$?.value
          ? parseInt(item.yearpublished[0].$.value)
          : undefined

        const description = item.description?.[0]
          ? item.description[0].replace(/&#10;/g, ' ').replace(/&amp;/g, '&').slice(0, 400)
          : undefined

        const links: any[] = item.link || []

        const categories = links
          .filter((l: any) => l.$.type === 'boardgamecategory')
          .map((l: any) => l.$.value)
          .filter(Boolean) as string[]

        const mechanics = links
          .filter((l: any) => l.$.type === 'boardgamemechanic')
          .map((l: any) => l.$.value)
          .filter(Boolean) as string[]

        const designers = links
          .filter((l: any) => l.$.type === 'boardgamedesigner')
          .map((l: any) => l.$.value)
          .filter(Boolean) as string[]

        const publishers = links
          .filter((l: any) => l.$.type === 'boardgamepublisher')
          .map((l: any) => l.$.value)
          .filter(Boolean)
          .slice(0, 3) as string[]

        const minPlayers = item.minplayers?.[0]?.$?.value
          ? parseInt(item.minplayers[0].$.value)
          : undefined
        const maxPlayers = item.maxplayers?.[0]?.$?.value
          ? parseInt(item.maxplayers[0].$.value)
          : undefined
        const playingTime = item.playingtime?.[0]?.$?.value
          ? parseInt(item.playingtime[0].$.value)
          : undefined
        const complexity = item.statistics?.[0]?.ratings?.[0]?.averageweight?.[0]?.$?.value
          ? parseFloat(item.statistics[0].ratings[0].averageweight[0].$.value)
          : undefined
        const bggRating = item.statistics?.[0]?.ratings?.[0]?.average?.[0]?.$?.value
          ? parseFloat(item.statistics[0].ratings[0].average[0].$.value)
          : undefined

        return {
          id: `bgg-${id}`,
          title,
          type: 'boardgame',
          coverImage,
          year,
          source: 'bgg',
          description,
          genres: mapBggCategoriesToGenres(categories),
          categories,
          mechanics,
          designers,
          publishers,
          min_players: minPlayers,
          max_players: maxPlayers,
          playing_time: playingTime,
          complexity,
          bgg_rating: bggRating,
        }
      }).filter(Boolean)

      rawResults.sort((a, b) => {
        const score = (title: string) => {
          const t = title.toLowerCase()
          return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3
        }
        return score(a.title) - score(b.title)
      })

      if (lang === 'it') {
        const toTranslate = rawResults.filter(r => r.description)
        if (toTranslate.length > 0) {
          const items = toTranslate.map(r => ({ id: r.id, text: r.description as string }))
          const translated = await translateWithCache(items, 'IT', 'EN')
          toTranslate.forEach(r => {
            if (translated[r.id]) r.description = translated[r.id]
          })
        }
      }

      return NextResponse.json({ results: rawResults }, { headers: rl.headers })
    } catch (e) {
      logger.error('[BGG] parse error:', e)
      return NextResponse.json({ results: [] }, { headers: rl.headers })
    }
  }

  // ── MODALITÀ HOT LIST ────────────────────────────────────────────────────
  const supabaseService = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data: cache } = await supabaseService
      .from('boardgames_cache')
      .select('*')
      .single()

    const now = Date.now()
    if (cache && now - new Date(cache.updated_at).getTime() < CACHE_DURATION_MS) {
      return NextResponse.json({ articles: cache.data }, { headers: rl.headers })
    }

    const xmlData = await bggFetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame')
    if (!xmlData) {
      return cache
        ? NextResponse.json({ articles: cache.data }, { headers: rl.headers })
        : NextResponse.json({ articles: [] }, { headers: rl.headers })
    }

    const result = await parseStringPromise(xmlData)
    const cleanedArticles = (result.items?.item || []).slice(0, 20).map((item: any) => {
      const thumb = item.thumbnail?.[0]?.$?.value || ''
      return {
        title: item.name?.[0]?.$?.value || 'Unknown',
        description: `RANK #${item.$.rank}${item.yearpublished?.[0]?.$?.value ? ` · ${item.yearpublished[0].$.value}` : ''}`,
        url: `https://boardgamegeek.com/boardgame/${item.$.id}`,
        urlToImage: thumb ? (thumb.startsWith('http') ? thumb : `https:${thumb}`) : '',
        source: { name: 'BGG' },
      }
    })

    await supabaseService.from('boardgames_cache').upsert({
      id: 1,
      data: cleanedArticles,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ articles: cleanedArticles }, { headers: rl.headers })
  } catch (e) {
    logger.error('[BGG] hot list error:', e)
    return NextResponse.json({ articles: [] }, { headers: rl.headers })
  }
}

// Mappa categorie BGG → generi standard per il taste profile
function mapBggCategoriesToGenres(categories: string[]): string[] {
  const map: Record<string, string> = {
    Fantasy: 'Fantasy',
    'Science Fiction': 'Science Fiction',
    Horror: 'Horror',
    Medieval: 'Medieval',
    Adventure: 'Adventure',
    Fighting: 'Fighting',
    Deduction: 'Mystery',
    'Murder/Mystery': 'Mystery',
    'Thriller/Suspense': 'Thriller',
    Humor: 'Comedy',
    Wargame: 'War',
    'World War II': 'War',
    'World War I': 'War',
    Historical: 'History',
    Economic: 'Strategy',
    Political: 'Political',
    Bluffing: 'Strategy',
    Negotiation: 'Strategy',
    'Territory Building': 'Strategy',
    'Card Game': 'Card Game',
    Dice: 'Dice',
    'Abstract Strategy': 'Abstract',
    'Cooperative Game': 'Cooperative',
    'Party Game': 'Party',
    "Children's Game": 'Family',
    Family: 'Family',
    Sports: 'Sports',
    Animals: 'Nature',
    Exploration: 'Adventure',
    Civilization: 'Strategy',
    'City Building': 'Strategy',
    Pirates: 'Adventure',
    Nautical: 'Adventure',
    'Space Exploration': 'Science Fiction',
    Zombies: 'Horror',
    Mythology: 'Fantasy',
  }

  const genres = new Set<string>()
  for (const cat of categories) {
    const mapped = map[cat]
    if (mapped) genres.add(mapped)
  }
  return Array.from(genres)
}