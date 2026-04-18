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

  let items: any[] = []
  try {
    const res = await fetch(`${GOOGLE_BOOKS_BASE}?${params}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      items = data.items || []
    }
  } catch { /* ignore */ }

  // Tieni solo libri in italiano
  items = items.filter((item: any) => item.volumeInfo?.language === 'it')

  // Filtra per titolo: tutte le parole significative della query devono apparire nel titolo
  const queryWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  if (queryWords.length > 0) {
    items = items.filter((item: any) => {
      const title = (item.volumeInfo?.title || '').toLowerCase()
      return queryWords.every(word => title.includes(word))
    })
  }

  if (!items.length) return NextResponse.json({ results: [] })

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
      ? rawCover.replace('http://', 'https://').replace('&edge=curl', '').replace('zoom=1', 'zoom=0')
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
      score: info.averageRating ? Math.round(info.averageRating * 20) : null, // → scala 0-100
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

  return NextResponse.json({ results })
}
