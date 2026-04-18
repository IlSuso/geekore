// src/app/api/books/route.ts
// Google Books API — ricerca libri per Geekore
// GET /api/books?q=<query>

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { truncateAtSentence } from '@/lib/utils'

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes'

const GBOOKS_CATEGORY_TO_GENRE: Record<string, string> = {
  'Fantasy':            'Fantasy',
  'Science Fiction':    'Science Fiction',
  'Sci-Fi':             'Science Fiction',
  'Horror':             'Horror',
  'Mystery':            'Mystery',
  'Thriller':           'Thriller',
  'Romance':            'Romance',
  'Adventure':          'Adventure',
  'Action':             'Action',
  'Drama':              'Drama',
  'Comedy':             'Comedy',
  'Historical Fiction': 'Drama',
  'History':            'Drama',
  'Biography':          'Drama',
  'Psychological':      'Psychological',
  'Supernatural':       'Supernatural',
  'Crime':              'Crime',
  'Dystopia':           'Science Fiction',
  'Magic':              'Fantasy',
  'Manga':              'Action',
  'Comics':             'Action',
  'Graphic Novel':      'Action',
  'Young Adult':        'Adventure',
  'Children':           'Adventure',
}

function mapCategoriesToGenres(categories: string[]): string[] {
  const genres = new Set<string>()
  for (const cat of categories) {
    for (const [key, genre] of Object.entries(GBOOKS_CATEGORY_TO_GENRE)) {
      if (cat.toLowerCase().includes(key.toLowerCase())) {
        genres.add(genre)
      }
    }
  }
  return [...genres]
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (res.ok) return res
      if (res.status >= 500 && attempt < retries) {
        console.log(`[BOOKS] HTTP ${res.status}, retry ${attempt + 1}/${retries}…`)
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
        continue
      }
      console.error(`[BOOKS] HTTP ${res.status} definitivo`)
      return null
    } catch (err: any) {
      if (attempt < retries) {
        console.log(`[BOOKS] fetch error "${err?.message}", retry ${attempt + 1}/${retries}…`)
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
      } else {
        console.error(`[BOOKS] fetch fallito dopo ${retries + 1} tentativi:`, err?.message)
      }
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'books' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY || ''

  // ── Chiamata API ─────────────────────────────────────────────────────────────
  // Formula raccomandata dalla documentazione Google Books:
  //   q=intitle:"query"  +  langRestrict=it  (parametro separato, non lang:it nel query)
  // intitle:"..." forza Google a cercare la frase ESATTA nel titolo del libro.
  // langRestrict=it come parametro URL è più affidabile di lang:it nel query.
  //
  // Fallback: se 0 risultati italiani, cerca senza intitle (per titoli parziali/ambigui)

  console.log(`[BOOKS] query="${q}"`)
  let items: any[] = []

  // Cerchiamo due pagine in parallelo (startIndex 0 e 40) per aumentare il pool.
  // lr=lang_it + langRestrict=it + hl=it = massima pressione linguistica sull'API.
  // intitle:"query" = cerca la frase esatta nel titolo.
  const baseParams = { q: `intitle:"${q}"`, maxResults: '40', printType: 'books', langRestrict: 'it', lr: 'lang_it', hl: 'it', orderBy: 'relevance' }
  const p1 = new URLSearchParams({ ...baseParams, startIndex: '0' })
  const p2 = new URLSearchParams({ ...baseParams, startIndex: '40' })
  if (apiKey) { p1.set('key', apiKey); p2.set('key', apiKey) }

  const [r1, r2] = await Promise.all([
    fetchWithRetry(`${GOOGLE_BOOKS_BASE}?${p1}`),
    fetchWithRetry(`${GOOGLE_BOOKS_BASE}?${p2}`),
  ])

  const raw: any[] = []
  for (const r of [r1, r2]) {
    if (r) { const data = await r.json(); raw.push(...(data.items || [])) }
  }

  // Tieni preferibilmente solo italiani; se 0, accetta tutto tranne inglese
  const italian = raw.filter((i: any) => i.volumeInfo?.language === 'it')
  const nonEn   = raw.filter((i: any) => i.volumeInfo?.language !== 'en')
  items = italian.length > 0 ? italian : nonEn

  const langs: Record<string, number> = {}
  raw.forEach((i: any) => { const l = i.volumeInfo?.language ?? 'null'; langs[l] = (langs[l] || 0) + 1 })
  console.log(`[BOOKS] raw totale=${raw.length} langs=${JSON.stringify(langs)} → usati=${items.length} (it=${italian.length})`)

  // Fallback: senza intitle se ancora 0
  if (items.length === 0) {
    const p3 = new URLSearchParams({ q, maxResults: '40', printType: 'books', langRestrict: 'it', lr: 'lang_it', hl: 'it', orderBy: 'relevance' })
    if (apiKey) p3.set('key', apiKey)
    const r3 = await fetchWithRetry(`${GOOGLE_BOOKS_BASE}?${p3}`)
    if (r3) {
      const data = await r3.json()
      items = data.items || []
      const l2: Record<string, number> = {}
      items.forEach((i: any) => { const l = i.volumeInfo?.language ?? 'null'; l2[l] = (l2[l] || 0) + 1 })
      console.log(`[BOOKS] fallback no-intitle → raw=${items.length} langs=${JSON.stringify(l2)}`)
    }
  }

  // Deduplicazione per titolo: rimuove edizioni multiple dello stesso libro
  const seenTitles = new Set<string>()
  items = items.filter((item: any) => {
    const t = (item.volumeInfo?.title || '').toLowerCase().trim()
    if (!t || seenTitles.has(t)) return false
    seenTitles.add(t)
    return true
  })

  // ── Filtro titolo ─────────────────────────────────────────────────────────────
  // Tutte le parole della query devono apparire nel titolo (nessun limite di lunghezza)
  const queryWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 0)
  if (queryWords.length > 0) {
    const before = items.length
    items = items.filter((item: any) => {
      const title = (item.volumeInfo?.title || '').toLowerCase()
      return queryWords.every(word => title.includes(word))
    })
    console.log(`[BOOKS] dopo filtro titolo: ${before} → ${items.length}`)
  }

  if (!items.length) {
    console.log(`[BOOKS] ZERO risultati`)
    return NextResponse.json({ results: [] })
  }

  const results = items.slice(0, 20).map((item: any) => {
    const info = item.volumeInfo || {}
    const categories: string[] = info.categories || []
    const genres = mapCategoriesToGenres(categories)

    const rawCover = info.imageLinks?.extraLarge || info.imageLinks?.large ||
      info.imageLinks?.medium || info.imageLinks?.thumbnail ||
      info.imageLinks?.smallThumbnail || null
    const cover = rawCover
      ? (() => {
          let u = rawCover.replace('http://', 'https://').replace('&edge=curl', '').replace(/zoom=\d+/, 'zoom=3')
          if (!u.includes('fife=')) u += '&fife=w400'
          return u
        })()
      : null

    const description = info.description
      ? truncateAtSentence(info.description.replace(/<[^>]+>/g, ''), 400)
      : null

    return {
      id: `gbooks-${item.id}`,
      external_id: item.id,
      title: info.title || 'Titolo sconosciuto',
      type: 'book',
      coverImage: cover,
      year: info.publishedDate ? parseInt(info.publishedDate.substring(0, 4)) : null,
      genres,
      score: info.averageRating ? Math.round(info.averageRating * 20) : null,
      description,
      authors: info.authors || [],
      publisher: info.publisher || null,
      pageCount: info.pageCount || null,
      categories,
      isbn: info.industryIdentifiers?.find((i: any) => i.type === 'ISBN_13')?.identifier || null,
      language: info.language || null,
      previewLink: info.previewLink || null,
    }
  }).filter(r => r.title && r.title !== 'Titolo sconosciuto' || r.coverImage)

  console.log(`[BOOKS] risultati finali: ${results.length}`)
  return NextResponse.json({ results })
}
