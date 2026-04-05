import { NextRequest, NextResponse } from 'next/server'
import { parseStringPromise } from 'xml2js'
import { createClient } from '@supabase/supabase-js'

const CACHE_DURATION_MS = 86_400_000 // 24h

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const BGG_HEADERS = {
  'User-Agent': 'Geekore/1.0',
  'Accept': 'application/xml',
}

// GET ?search=termine → ricerca per nome
// GET (no params) → hot list
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')

  // ── SEARCH MODE ──────────────────────────────────────────────────────────────
  if (search) {
    const trimmed = search.trim()
    if (typeof search !== 'string' || trimmed.length < 2 || trimmed.length > 200) {
      return NextResponse.json({ results: [] }, { status: 400 })
    }

    try {
      const searchRes = await fetch(
        `https://boardgamegeek.com/xmlapi/search?search=${encodeURIComponent(trimmed)}`,
        { headers: BGG_HEADERS }
      )
      const searchXml = await searchRes.text()

      if (!searchXml.trim().startsWith('<')) {
        return NextResponse.json({ results: [] })
      }

      const searchResult = await parseStringPromise(searchXml)
      const items = (searchResult?.boardgames?.boardgame || []).slice(0, 8)

      if (items.length === 0) return NextResponse.json({ results: [] })

      const ids = items.map((item: any) => item.$.objectid).join(',')

      const detailRes = await fetch(
        `https://boardgamegeek.com/xmlapi/boardgame/${ids}?stats=0`,
        { headers: BGG_HEADERS }
      )
      const detailXml = await detailRes.text()
      const detailResult = await parseStringPromise(detailXml)
      const detailItems = detailResult?.boardgames?.boardgame || []

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

          return { id: `bgg-${id}`, title, type: 'boardgame', coverImage, year, source: 'bgg' }
        })
        .filter(Boolean)

      return NextResponse.json({ results })
    } catch (e) {
      console.error('BGG search error:', e)
      return NextResponse.json({ results: [] })
    }
  }

  // ── HOT LIST MODE ─────────────────────────────────────────────────────────────
  const supabase = getServiceClient()

  try {
    const { data: cache } = await supabase
      .from('boardgames_cache')
      .select('*')
      .single()

    const now = Date.now()
    if (cache && now - new Date(cache.updated_at).getTime() < CACHE_DURATION_MS) {
      return NextResponse.json({ articles: cache.data })
    }

    const response = await fetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', {
      headers: { 'User-Agent': 'Geekore/1.0' },
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

    await supabase.from('boardgames_cache').upsert({
      id: 1,
      data: cleanedArticles,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ articles: cleanedArticles })
  } catch (e) {
    console.error('BGG hot list error:', e)
    return NextResponse.json({ articles: [] })
  }
}
