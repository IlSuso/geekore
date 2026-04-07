import { NextRequest, NextResponse } from 'next/server'
import { parseStringPromise } from 'xml2js'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const CACHE_DURATION_MS = 86400000 // 24 ore

function bggHeaders(): HeadersInit {
  const token = process.env.BGG_BEARER_TOKEN
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// BGG spesso risponde 202 (ancora in elaborazione) — riprova fino a maxRetries volte
async function bggFetch(url: string, maxRetries = 5, delayMs = 2000): Promise<string | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, delayMs))
    try {
      const res = await fetch(url, { cache: 'no-store', headers: bggHeaders() })
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

    const term = search.trim()

    // Prova diversi endpoint BGG finché uno funziona
    const endpoints = [
      `https://api.geekdo.com/xmlapi2/search?query=${encodeURIComponent(term)}&type=boardgame`,
      `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(term)}&type=boardgame`,
      `https://boardgamegeek.com/xmlapi/search?search=${encodeURIComponent(term)}&exact=0`,
    ]

    let searchXml: string | null = null
    let usedV2 = true

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { cache: 'no-store', headers: bggHeaders() })
        console.log(`[BGG] ${endpoint.split('?')[0]} → ${res.status}`)
        if (res.status === 202) continue
        if (!res.ok) continue
        const text = await res.text()
        if (!text.trim().startsWith('<')) continue
        searchXml = text
        usedV2 = endpoint.includes('xmlapi2')
        break
      } catch (e) {
        console.error(`[BGG] errore su ${endpoint}:`, e)
      }
    }

    if (!searchXml) {
      console.error('[BGG] tutti gli endpoint hanno fallito')
      return NextResponse.json({ results: [], error: 'BGG non raggiungibile' })
    }

    try {
      const searchResult = await parseStringPromise(searchXml)

      let items: any[]
      let ids: string

      if (usedV2) {
        items = (searchResult?.items?.item || []).slice(0, 10)
        ids = items.map((i: any) => i.$.id).join(',')
      } else {
        items = (searchResult?.boardgames?.boardgame || []).slice(0, 10)
        ids = items.map((i: any) => i.$.objectid).join(',')
      }

      if (items.length === 0) return NextResponse.json({ results: [] })

      await new Promise(r => setTimeout(r, 600))

      const detailEndpoints = usedV2
        ? [
            `https://api.geekdo.com/xmlapi2/thing?id=${ids}&type=boardgame`,
            `https://boardgamegeek.com/xmlapi2/thing?id=${ids}&type=boardgame`,
          ]
        : [`https://boardgamegeek.com/xmlapi/boardgame/${ids}`]

      let detailXml: string | null = null
      for (const endpoint of detailEndpoints) {
        try {
          const res = await fetch(endpoint, { cache: 'no-store', headers: bggHeaders() })
          console.log(`[BGG] detail ${endpoint.split('?')[0]} → ${res.status}`)
          if (res.status === 202) continue
          if (!res.ok) continue
          const text = await res.text()
          if (!text.trim().startsWith('<')) continue
          detailXml = text
          break
        } catch {}
      }

      if (!detailXml) return NextResponse.json({ results: [] })

      const detailResult = await parseStringPromise(detailXml)
      const detailItems: any[] = usedV2
        ? detailResult?.items?.item || []
        : detailResult?.boardgames?.boardgame || []

      const results = detailItems.map((item: any) => {
        const id = usedV2 ? item.$.id : item.$.objectid

        let title = 'Senza titolo'
        if (usedV2) {
          const nameEl = (item.name || []).find((n: any) => n.$.type === 'primary')
          title = nameEl?.$.value || title
        } else {
          const nameEl = Array.isArray(item.name)
            ? item.name.find((n: any) => n.$.primary === 'true') || item.name[0]
            : item.name
          title = nameEl?._ || nameEl || title
        }

        const thumb = item.thumbnail?.[0]?.trim?.() || item.thumbnail?.[0]
        const fullImg = item.image?.[0]?.trim?.() || item.image?.[0]
        const rawImage = fullImg || thumb
        if (!rawImage) return null
        const coverImage = rawImage.startsWith('http') ? rawImage : `https:${rawImage}`

        const year = usedV2
          ? item.yearpublished?.[0]?.$?.value ? parseInt(item.yearpublished[0].$.value) : undefined
          : item.yearpublished?.[0] ? parseInt(item.yearpublished[0]) : undefined

        return { id: `bgg-${id}`, title, type: 'boardgame', coverImage, year, source: 'bgg' }
      }).filter(Boolean)

      return NextResponse.json({ results })
    } catch (e) {
      console.error('[BGG] parse error:', e)
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

    const xmlData = await bggFetch('https://api.geekdo.com/xmlapi2/hot?type=boardgame')
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
