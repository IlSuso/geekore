// src/app/api/books/route.ts
// Open Library API — ricerca libri per Geekore
// GET /api/books?q=<query>

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

const OL_SEARCH_BASE = 'https://openlibrary.org/search.json'
const OL_COVER_BASE  = 'https://covers.openlibrary.org/b'

const SUBJECT_TO_GENRE: Record<string, string> = {
  'Fantasy':               'Fantasy',
  'Science fiction':       'Science Fiction',
  'Horror':                'Horror',
  'Mystery':               'Mystery',
  'Thriller':              'Thriller',
  'Romance':               'Romance',
  'Adventure':             'Adventure',
  'Action':                'Action',
  'Drama':                 'Drama',
  'Comedy':                'Comedy',
  'Historical fiction':    'Drama',
  'History':               'Drama',
  'Biography':             'Drama',
  'Psychological fiction': 'Psychological',
  'Supernatural':          'Supernatural',
  'Crime':                 'Crime',
  'Dystopian':             'Science Fiction',
  'Magic':                 'Fantasy',
  'Graphic novels':        'Action',
  'Comics':                'Action',
  'Young adult fiction':   'Adventure',
  "Children's literature": 'Adventure',
}

function mapSubjectsToGenres(subjects: string[]): string[] {
  const genres = new Set<string>()
  for (const sub of subjects) {
    for (const [key, genre] of Object.entries(SUBJECT_TO_GENRE)) {
      if (sub.toLowerCase().includes(key.toLowerCase())) {
        genres.add(genre)
      }
    }
  }
  return [...genres]
}

async function getIsbnCover(isbn: string): Promise<string | null> {
  try {
    const url = `${OL_COVER_BASE}/isbn/${isbn}-L.jpg?default=false`
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    if (res.ok) return `${OL_COVER_BASE}/isbn/${isbn}-L.jpg`
  } catch {
    // ignore
  }
  return null
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

const FIELDS = 'key,title,author_name,cover_i,isbn,first_publish_year,number_of_pages_median,subject,language,ratings_average'

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'books' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  console.log(`[BOOKS] query="${q}"`)

  // Ricerca principale con filtro lingua italiana
  const p1 = new URLSearchParams({ q, lang: 'ita', limit: '40', fields: FIELDS })
  const r1 = await fetchWithRetry(`${OL_SEARCH_BASE}?${p1}`)

  let items: any[] = []

  if (r1) {
    const data = await r1.json()
    // Tieni solo i libri con almeno un'edizione in italiano
    items = (data.docs || []).filter((doc: any) =>
      Array.isArray(doc.language) && doc.language.includes('ita')
    )
    console.log(`[BOOKS] OL totale=${data.docs?.length ?? 0} → italiani=${items.length}`)
  }

  // Fallback: senza restrizione lingua se zero risultati
  if (items.length === 0) {
    const p2 = new URLSearchParams({ q, limit: '40', fields: FIELDS })
    const r2 = await fetchWithRetry(`${OL_SEARCH_BASE}?${p2}`)
    if (r2) {
      const data = await r2.json()
      items = data.docs || []
      console.log(`[BOOKS] fallback no-lang: ${items.length}`)
    }
  }

  // Deduplicazione per titolo
  const seenTitles = new Set<string>()
  items = items.filter((doc: any) => {
    const t = (doc.title || '').toLowerCase().trim()
    if (!t || seenTitles.has(t)) return false
    seenTitles.add(t)
    return true
  })

  if (!items.length) {
    console.log('[BOOKS] ZERO risultati')
    return NextResponse.json({ results: [] })
  }

  const results = (await Promise.all(items.slice(0, 20).map(async (doc: any) => {
    const isbn13 = doc.isbn?.find((i: string) => i.length === 13) || doc.isbn?.[0] || null

    let coverImage: string | null = null
    if (doc.cover_i) {
      coverImage = `${OL_COVER_BASE}/id/${doc.cover_i}-L.jpg`
    } else if (isbn13) {
      coverImage = await getIsbnCover(isbn13)
      if (coverImage) console.log(`[BOOKS] ISBN cover per ${isbn13}`)
    }

    const subjects: string[] = doc.subject?.slice(0, 20) || []
    const genres = mapSubjectsToGenres(subjects)

    return {
      id: `ol-${(doc.key ?? '').replace('/works/', '') || Math.random().toString(36).slice(2)}`,
      external_id: doc.key || null,
      title: doc.title || 'Titolo sconosciuto',
      type: 'book',
      coverImage,
      year: doc.first_publish_year || null,
      genres,
      categories: genres,
      score: doc.ratings_average ? Math.round(doc.ratings_average * 20) : null,
      description: null,
      authors: doc.author_name || [],
      publisher: null,
      pageCount: doc.number_of_pages_median || null,
      isbn: isbn13,
      language: 'it',
      previewLink: doc.key ? `https://openlibrary.org${doc.key}` : null,
    }
  }))).filter(r => r.title !== 'Titolo sconosciuto' || r.coverImage)

  console.log(`[BOOKS] risultati finali: ${results.length}`)
  return NextResponse.json({ results })
}
