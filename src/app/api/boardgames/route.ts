import { NextRequest, NextResponse } from 'next/server'
import { parseStringPromise } from 'xml2js'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const CACHE_DURATION_MS = 86400000 // 24 ore
const BGG_HEADERS = {
  'User-Agent': 'Geekore/1.0 (contact: suinky1999@gmail.com)',
  'Accept': 'application/xml',
}

// BGG spesso risponde 202 (ancora in elaborazione) — riprova fino a maxRetries volte
async function bggFetch(url: string, maxRetries = 5, delayMs = 2000): Promise<string | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, delayMs))
    try {
      const res = await fetch(url, { headers: BGG_HEADERS, cache: 'no-store' })
      if (res.status === 202) continue // BGG sta ancora processando
      if (!res.ok) {
        console.error(`[BGG] HTTP ${res.status} per ${url}`)
        return null
      }
      const text = await res.text()
      if (!text.trim().startsWith('<')) {
        console.error('[BGG] Risposta non XML:', text.slice(0, 200))
        return null
      }
      return text
    } catch (e) {
      console.error(`[BGG] Errore rete tentativo ${attempt}:`, e)
      if (attempt === maxRetries - 1) return null
    }
  }
  console.error('[BGG] Tutti i tentativi esauriti per', url)
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')

  // ── MODALITÀ RICERCA (BGG XML API v2) ────────────────────────────────────
  if (search) {
    if (typeof search !== 'string' || search.trim().length < 2 || search.length > 200) {
      return NextResponse.json({ results: [] }, { status: 400 })
    }

    try {
      const term = search.trim()

      // 1. Ricerca con v2 — restituisce id + nome già nella risposta
      const searchXml = await bggFetch(
        `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(term)}&type=boardgame`
      )
      if (!searchXml) return NextResponse.json({ results: [] })

      const searchResult = await parseStringPromise(searchXml)
      const items: any[] = (searchResult?.items?.item || []).slice(0, 10)
      if (items.length === 0) return NextResponse.json({ results: [] })

      const ids = items.map((item: any) => item.$.id).join(',')

      // 2. Dettagli con v2 — restituisce image, thumbnail, description, anno, giocatori
      // Piccolo delay per rispettare il rate limit di BGG
      await new Promise(r => setTimeout(r, 800))
      const detailXml = await bggFetch(
        `https://boardgamegeek.com/xmlapi2/thing?id=${ids}&type=boardgame&stats=0`
      )

      if (!detailXml) return NextResponse.json({ results: [] })
      const detailResult = await parseStringPromise(detailXml)
      const detailItems: any[] = detailResult?.items?.item || []

      const results = detailItems
        .map((item: any) => {
          const id = item.$.id
          const nameEl = (item.name || []).find((n: any) => n.$.type === 'primary')
          const title = nameEl?.$.value || 'Senza titolo'

          // v2 usa <thumbnail> e <image> come elementi con valore diretto
          const thumb = item.thumbnail?.[0]?.trim()
          const fullImg = item.image?.[0]?.trim()
          const rawImage = fullImg || thumb
          if (!rawImage) return null
          const coverImage = rawImage.startsWith('http') ? rawImage : `https:${rawImage}`

          const year = item.yearpublished?.[0]?.$?.value
            ? parseInt(item.yearpublished[0].$.value)
            : undefined

          const minPlayers = item.minplayers?.[0]?.$?.value
          const maxPlayers = item.maxplayers?.[0]?.$?.value
          const playingTime = item.playingtime?.[0]?.$?.value

          // Descrizione: BGG la codifica con entità HTML
          const rawDesc = item.description?.[0] || ''
          const description = rawDesc
            .replace(/&#10;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&mdash;/g, '—')
            .replace(/&ndash;/g, '–')
            .replace(/<[^>]+>/g, '')
            .trim()
            .slice(0, 300)

          return {
            id: `bgg-${id}`,
            title,
            type: 'boardgame',
            coverImage,
            year,
            description: description || undefined,
            players: minPlayers && maxPlayers
              ? `${minPlayers}${minPlayers !== maxPlayers ? `–${maxPlayers}` : ''} giocatori`
              : undefined,
            playingTime: playingTime ? `~${playingTime} min` : undefined,
            source: 'bgg',
          }
        })
        .filter(Boolean)

      return NextResponse.json({ results })
    } catch (e) {
      console.error('[BGG] search error:', e)
      return NextResponse.json({ results: [] })
    }
  }

  // ── MODALITÀ HOT LIST (BGG v2 cached) ───────────────────────────────────
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
      return NextResponse.json({ articles: cache.data })
    }

    const xmlData = await bggFetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame')
    if (!xmlData) {
      return cache
        ? NextResponse.json({ articles: cache.data })
        : NextResponse.json({ articles: [] })
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

    return NextResponse.json({ articles: cleanedArticles })
  } catch (e) {
    console.error('[BGG] hot list error:', e)
    return NextResponse.json({ articles: [] })
  }
}
