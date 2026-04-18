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
  // Strategia a due livelli:
  // 1) Prima prova con "lang:it" nel query → Google restituisce libri italiani
  //    per titoli italiani completi ("harry potter e la pietra filosofale")
  // 2) Se 0 libri con language==='it', fallback senza filtro lingua
  //    → per query brevi/inglesi ("harry potter") mostra comunque risultati rilevanti

  const paramsIt = new URLSearchParams({ q: `${q} lang:it`, maxResults: '40', printType: 'books', orderBy: 'relevance' })
  if (apiKey) paramsIt.set('key', apiKey)

  console.log(`[BOOKS] query="${q}"`)

  let items: any[] = []
  const resIt = await fetchWithRetry(`${GOOGLE_BOOKS_BASE}?${paramsIt}`)
  if (resIt) {
    const data = await resIt.json()
    items = data.items || []
    const langs: Record<string, number> = {}
    items.forEach((i: any) => { const l = i.volumeInfo?.language ?? 'null'; langs[l] = (langs[l] || 0) + 1 })
    console.log(`[BOOKS] lang:it → ricevuti=${items.length} langs=${JSON.stringify(langs)}`)
  }

  // Tieni solo i libri italiani dalla prima chiamata
  const italianItems = items.filter((i: any) => i.volumeInfo?.language === 'it')
  console.log(`[BOOKS] italiani trovati: ${italianItems.length}`)

  if (italianItems.length > 0) {
    items = italianItems
  } else {
    // Fallback: cerca senza vincolo lingua (per query brevi/inglesi)
    const paramsFb = new URLSearchParams({ q, maxResults: '40', printType: 'books', langRestrict: 'it', orderBy: 'relevance' })
    if (apiKey) paramsFb.set('key', apiKey)
    const resFb = await fetchWithRetry(`${GOOGLE_BOOKS_BASE}?${paramsFb}`)
    if (resFb) {
      const data = await resFb.json()
      items = data.items || []
      const langs: Record<string, number> = {}
      items.forEach((i: any) => { const l = i.volumeInfo?.language ?? 'null'; langs[l] = (langs[l] || 0) + 1 })
      console.log(`[BOOKS] fallback langRestrict:it → ricevuti=${items.length} langs=${JSON.stringify(langs)}`)
    }
  }

  // ── Filtro titolo ─────────────────────────────────────────────────────────────
  const queryWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 3)
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
      ? rawCover.replace('http://', 'https://').replace('&edge=curl', '').replace('zoom=1', 'zoom=3')
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
