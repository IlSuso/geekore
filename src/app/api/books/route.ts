// src/app/api/books/route.ts
// Open Library API — ricerca libri per Geekore
// GET /api/books?q=<query>
//
// Strategia in 2 passi:
//   1) search.json → trova le OPERE (works)
//   2) /works/{key}/editions.json?limit=1000 → TUTTE le edizioni
//      → filtra per languages[].key === "/languages/ita"
//      → ordina per anno DESC (più recenti prima)

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

const OL_SEARCH_BASE = 'https://openlibrary.org/search.json'
const OL_BASE        = 'https://openlibrary.org'
const OL_COVER_BASE  = 'https://covers.openlibrary.org/b'

// User-Agent richiesto da Open Library per ottenere 3x rate limit (3 req/s invece di 1)
const OL_HEADERS = { 'User-Agent': 'Geekore (admin@geekore.it)' }

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
      if (sub.toLowerCase().includes(key.toLowerCase())) genres.add(genre)
    }
  }
  return [...genres]
}

async function fetchOL(url: string, timeoutMs = 8000): Promise<any | null> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: OL_HEADERS })
      if (res.ok) return await res.json()
      if (res.status < 500) return null
      if (attempt === 0) await new Promise(r => setTimeout(r, 600))
    } catch (err: any) {
      if (attempt === 0) await new Promise(r => setTimeout(r, 600))
      else console.error(`[BOOKS] fetch error: ${err?.message}`)
    }
  }
  return null
}

// Recupera TUTTE le edizioni di un'opera e restituisce solo quelle in italiano
async function getItalianEditions(workKey: string): Promise<any[]> {
  const data = await fetchOL(`${OL_BASE}${workKey}/editions.json?limit=1000`, 10000)
  if (!data) return []
  const allEditions: any[] = data.entries ?? []
  return allEditions.filter((ed: any) =>
    Array.isArray(ed.languages) &&
    ed.languages.some((l: any) => l.key === '/languages/ita')
  )
}

function parseYear(publishDate: string | undefined): number | null {
  if (!publishDate) return null
  const m = publishDate.match(/\d{4}/)
  return m ? parseInt(m[0]) : null
}

const SEARCH_FIELDS = 'key,title,author_name,cover_i,isbn,first_publish_year,number_of_pages_median,subject,ratings_average'

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'books' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  console.log(`[BOOKS] query="${q}"`)

  // Step 1: cerca le opere
  const p = new URLSearchParams({ q, limit: '5', fields: SEARCH_FIELDS })
  const searchData = await fetchOL(`${OL_SEARCH_BASE}?${p}`)
  if (!searchData) {
    console.error('[BOOKS] Open Library non raggiungibile')
    return NextResponse.json({ results: [] })
  }

  const works: any[] = searchData.docs ?? []
  console.log(`[BOOKS] opere trovate: ${works.length}`)
  if (!works.length) return NextResponse.json({ results: [] })

  // Step 2: per ogni opera, recupera TUTTE le edizioni italiane in parallelo
  const groups = await Promise.all(
    works.map(async (work: any) => {
      const genres    = mapSubjectsToGenres(work.subject?.slice(0, 20) ?? [])
      const workScore = work.ratings_average ? Math.round(work.ratings_average * 20) : null
      const authors   = work.author_name ?? []

      const italianEds = await getItalianEditions(work.key)
      console.log(`[BOOKS] ${work.key} → edizioni italiane: ${italianEds.length} / totale opera`)

      // Ordina per anno decrescente (più recenti prima)
      italianEds.sort((a, b) => (parseYear(b.publish_date) ?? 0) - (parseYear(a.publish_date) ?? 0))

      return italianEds.map((ed: any) => {
        const isbn      = ed.isbn_13?.[0] ?? ed.isbn_10?.[0] ?? null
        const coverId   = ed.covers?.[0] ?? work.cover_i ?? null
        const coverImage = coverId ? `${OL_COVER_BASE}/id/${coverId}-L.jpg` : null
        const year      = parseYear(ed.publish_date) ?? work.first_publish_year ?? null

        return {
          id:           `ol-${ed.key.replace('/books/', '')}`,
          external_id:  ed.key,
          title:        ed.title ?? work.title ?? 'Titolo sconosciuto',
          type:         'book',
          coverImage,
          year,
          genres,
          categories:   genres,
          score:        workScore,
          description:  null,
          authors,
          publisher:    ed.publishers?.[0]?.name ?? null,
          pageCount:    ed.number_of_pages ?? work.number_of_pages_median ?? null,
          isbn,
          language:     'it',
          previewLink:  `${OL_BASE}${ed.key}`,
        }
      })
    })
  )

  // Appiattisci, ordina globalmente per anno DESC, prendi i primi 20
  const all = groups
    .flat()
    .filter(r => r.title !== 'Titolo sconosciuto' || r.coverImage)

  all.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))

  const results = all.slice(0, 20)
  console.log(`[BOOKS] risultati finali: ${results.length}`)
  return NextResponse.json({ results })
}
