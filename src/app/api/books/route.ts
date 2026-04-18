// src/app/api/books/route.ts
// Google Books API — ricerca libri per Geekore
// GET /api/books?q=<query>

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { truncateAtSentence } from '@/lib/utils'

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes'

// Mappa categorie Google Books → generi cross-media Geekore
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

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'books' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY || ''
  const params = new URLSearchParams({
    q,
    maxResults: '40',
    printType: 'books',
    langRestrict: 'it',
    hl: 'it',
    orderBy: 'relevance',
  })
  if (apiKey) params.set('key', apiKey)

  const fullUrl = `${GOOGLE_BOOKS_BASE}?${params}`
  console.log(`[BOOKS] ── query: "${q}"`)
  console.log(`[BOOKS] ── URL: ${fullUrl.replace(apiKey, 'API_KEY')}`)

  let rawTotal = 0
  let items: any[] = []
  try {
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(8000) })
    console.log(`[BOOKS] ── HTTP status: ${res.status}`)
    if (res.ok) {
      const data = await res.json()
      rawTotal = data.totalItems ?? 0
      items = data.items || []
      console.log(`[BOOKS] ── totalItems (Google): ${rawTotal}`)
      console.log(`[BOOKS] ── items ricevuti: ${items.length}`)

      // Log lingua di ogni libro ricevuto
      const langMap: Record<string, number> = {}
      items.forEach((item: any) => {
        const lang = item.volumeInfo?.language ?? '(assente)'
        langMap[lang] = (langMap[lang] || 0) + 1
      })
      console.log(`[BOOKS] ── distribuzione language:`, JSON.stringify(langMap))

      // Log titoli grezzi
      items.forEach((item: any, i: number) => {
        console.log(`[BOOKS]   [${i}] lang="${item.volumeInfo?.language ?? 'null'}" title="${item.volumeInfo?.title}"`)
      })
    } else {
      console.error(`[BOOKS] ── API error: HTTP ${res.status}`)
    }
  } catch (err: any) {
    console.error(`[BOOKS] ── fetch exception:`, err?.message)
  }

  // ── Filtro lingua ────────────────────────────────────────────────────────────
  const afterFetch = items.length
  // Escludi solo libri esplicitamente in inglese — langRestrict:it gestisce il resto
  items = items.filter((item: any) => item.volumeInfo?.language !== 'en')
  console.log(`[BOOKS] ── dopo filtro lingua (!= 'en'): ${afterFetch} → ${items.length}`)

  // ── Filtro titolo ─────────────────────────────────────────────────────────────
  const afterLang = items.length
  const queryWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  console.log(`[BOOKS] ── queryWords (>3 chars):`, queryWords)
  if (queryWords.length > 0) {
    items = items.filter((item: any) => {
      const title = (item.volumeInfo?.title || '').toLowerCase()
      const pass = queryWords.every(word => title.includes(word))
      if (!pass) {
        console.log(`[BOOKS]   SCARTATO titolo="${item.volumeInfo?.title}" — parole mancanti: ${queryWords.filter(w => !title.includes(w)).join(', ')}`)
      }
      return pass
    })
  }
  console.log(`[BOOKS] ── dopo filtro titolo: ${afterLang} → ${items.length}`)

  if (!items.length) {
    console.log(`[BOOKS] ── ZERO risultati finali, rispondo con []`)
    return NextResponse.json({ results: [] })
  }

  // Normalizza i risultati
  const results = items.slice(0, 20).map((item: any) => {
    const info = item.volumeInfo || {}
    const categories: string[] = info.categories || []
    const genres = mapCategoriesToGenres(categories)

    // Cover: qualità massima disponibile
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

  console.log(`[BOOKS] ── risultati finali restituiti: ${results.length}`)
  return NextResponse.json({ results })
}
