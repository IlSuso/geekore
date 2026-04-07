// DESTINAZIONE: src/app/api/boardgames/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { parseStringPromise } from 'xml2js'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const CACHE_DURATION_MS = 86400000

// GET senza parametri → hot list (comportamento originale)
// GET con ?search=termine → ricerca per nome
export async function GET(request: NextRequest) {
  // ── Verifica autenticazione ──────────────────────────────────────────────
  const supabase = await createClient()

  // Client con service role solo per la cache pubblica (boardgames_cache)
  // Inizializzato dentro il handler per evitare errori in build time
  const supabaseService = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')

  // ── MODALITÀ RICERCA ────────────────────────────────────────────────────────
  if (search) {
    if (typeof search !== 'string' || search.trim().length < 2 || search.length > 200) {
      return NextResponse.json({ results: [] }, { status: 400 })
    }

    try {
      console.log('[BGG] Ricerca v1:', search.trim())

      // BGG XML API v1 — ancora pubblica senza auth
      const searchRes = await fetch(
        `https://boardgamegeek.com/xmlapi/search?search=${encodeURIComponent(search.trim())}`,
        {
          headers: {
            'User-Agent': 'Geekore/1.0 (contact: suinky1999@gmail.com)',
            'Accept': 'application/xml',
          }
        }
      )
      console.log('[BGG] Search status:', searchRes.status)
      const searchXml = await searchRes.text()
      console.log('[BGG] XML inizio:', searchXml.substring(0, 300))

      if (!searchXml.trim().startsWith('<')) {
        return NextResponse.json({ results: [] })
      }

      const searchResult = await parseStringPromise(searchXml)
      // v1 usa <boardgames><boardgame objectid="...">
      const items = (searchResult?.boardgames?.boardgame || []).slice(0, 8)
      console.log('[BGG] Items trovati:', items.length)

      if (items.length === 0) return NextResponse.json({ results: [] })

      // Fetch dettagli con v1
      const ids = items.map((item: any) => item.$.objectid).join(',')
      console.log('[BGG] IDs:', ids)

      const detailRes = await fetch(
        `https://boardgamegeek.com/xmlapi/boardgame/${ids}?stats=0`,
        {
          headers: {
            'User-Agent': 'Geekore/1.0 (contact: suinky1999@gmail.com)',
            'Accept': 'application/xml',
          }
        }
      )
      console.log('[BGG] Detail status:', detailRes.status)
      const detailXml = await detailRes.text()
      console.log('[BGG] Detail XML inizio:', detailXml.substring(0, 300))
      const detailResult = await parseStringPromise(detailXml)
      const detailItems = detailResult?.boardgames?.boardgame || []
      console.log('[BGG] Detail items:', detailItems.length)

      const results = detailItems
        .map((item: any) => {
          const id = item.$.id
          const nameEl = (item.name || []).find((n: any) => n.$.type === 'primary')
          const title = nameEl?.$.value || 'Senza titolo'
          const image = item.image?.[0]?.trim()
          const coverImage = image ? (image.startsWith('http') ? image : `https:${image}`) : null
          const year = item.yearpublished?.[0]?.$.value
            ? parseInt(item.yearpublished[0].$.value)
            : undefined

          if (!coverImage) return null

          return {
            id: `bgg-${id}`,
            title,
            type: 'boardgame',
            coverImage,
            year,
            source: 'bgg',
          }
        })
        .filter(Boolean)

      return NextResponse.json({ results })
    } catch (e) {
      console.error('BGG search error:', e)
      return NextResponse.json({ results: [] })
    }
  }

  // ── MODALITÀ HOT LIST (comportamento originale) ──────────────────────────
  try {
    const { data: cache } = await supabaseService
      .from('boardgames_cache')
      .select('*')
      .single()

    const now = new Date().getTime()
    if (cache && now - new Date(cache.updated_at).getTime() < CACHE_DURATION_MS) {
      return NextResponse.json({ articles: cache.data })
    }

    const response = await fetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const xmlData = await response.text()

    if (!xmlData.trim().startsWith('<')) {
      return cache
        ? NextResponse.json({ articles: cache.data })
        : NextResponse.json({ articles: [] })
    }

    const result = await parseStringPromise(xmlData)
    const cleanedArticles = result.items.item.slice(0, 20).map((item: any) => {
      const thumb = item.thumbnail?.[0]?.$?.value || ''
      return {
        title: item.name?.[0]?.$?.value || 'Unknown',
        description: `RANK #${item.$.rank} - ${item.yearpublished?.[0]?.$?.value || 'N/A'}`,
        url: `https://boardgamegeek.com/boardgame/${item.$.id}`,
        urlToImage: thumb ? thumb.replace(/_(thumb|t|sq|md|lg)\./i, '_master.') : '',
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
    return NextResponse.json({ articles: [] })
  }
}