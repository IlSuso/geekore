// src/app/api/books/route.ts
// Open Library API — ricerca libri per Geekore
// GET /api/books?q=<query>
//
// Strategia: search.json restituisce OPERE (works), non edizioni.
// Per avere titoli/copertine italiane bisogna:
//   1) cercare le opere → 2) fetchare /works/{key}/editions.json
//   3) filtrare le edizioni con languages: [{key: "/languages/ita"}]

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

const OL_SEARCH_BASE = 'https://openlibrary.org/search.json'
const OL_BASE        = 'https://openlibrary.org'
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
      if (sub.toLowerCase().includes(key.toLowerCase())) genres.add(genre)
    }
  }
  return [...genres]
}

async function fetchOL(url: string, timeoutMs = 6000): Promise<any | null> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
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

async function getItalianEditions(workKey: string): Promise<any[]> {
  const data = await fetchOL(`${OL_BASE}${workKey}/editions.json?limit=50`, 5000)
  if (!data) return []
  return (data.entries ?? []).filter((ed: any) =>
    Array.isArray(ed.languages) && ed.languages.some((l: any) => l.key === '/languages/ita')
  )
}

const SEARCH_FIELDS = 'key,title,author_name,cover_i,isbn,first_publish_year,number_of_pages_median,subject,ratings_average,language'

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'books' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  console.log(`[BOOKS] query="${q}"`)

  // Step 1: cerca opere
  const p1 = new URLSearchParams({ q, limit: '8', fields: SEARCH_FIELDS })
  const searchData = await fetchOL(`${OL_SEARCH_BASE}?${p1}`)
  if (!searchData) {
    console.error('[BOOKS] Open Library non raggiungibile')
    return NextResponse.json({ results: [] })
  }

  const works: any[] = searchData.docs ?? []
  console.log(`[BOOKS] works trovati: ${works.length}`)
  if (!works.length) return NextResponse.json({ results: [] })

  // Step 2: per ogni opera, recupera le edizioni italiane in parallelo
  const groups = await Promise.all(
    works.slice(0, 5).map(async (work: any) => {
      const genres = mapSubjectsToGenres(work.subject?.slice(0, 20) ?? [])
      const workScore = work.ratings_average ? Math.round(work.ratings_average * 20) : null
      const workAuthors: string[] = work.author_name ?? []

      const italianEds = await getItalianEditions(work.key)
      console.log(`[BOOKS] ${work.key} → edizioni italiane: ${italianEds.length}`)

      if (italianEds.length > 0) {
        // Restituisce le edizioni italiane con titolo/copertina italiano
        return italianEds.slice(0, 8).map((ed: any) => {
          const isbn = ed.isbn_13?.[0] ?? ed.isbn_10?.[0] ?? null
          const coverId = ed.covers?.[0] ?? work.cover_i ?? null
          const coverImage = coverId ? `${OL_COVER_BASE}/id/${coverId}-L.jpg` : null
          const yearMatch = (ed.publish_date ?? '').match(/\d{4}/)
          const year = yearMatch ? parseInt(yearMatch[0]) : (work.first_publish_year ?? null)
          return {
            id: `ol-${ed.key.replace('/books/', '')}`,
            external_id: ed.key,
            title: ed.title ?? work.title ?? 'Titolo sconosciuto',
            type: 'book',
            coverImage,
            year,
            genres,
            categories: genres,
            score: workScore,
            description: null,
            authors: workAuthors,
            publisher: ed.publishers?.[0]?.name ?? null,
            pageCount: ed.number_of_pages ?? work.number_of_pages_median ?? null,
            isbn,
            language: 'it',
            previewLink: `${OL_BASE}${ed.key}`,
          }
        })
      }

      // Nessuna edizione italiana trovata: usa i dati dell'opera come fallback
      const isbn = work.isbn?.find((i: string) => i.length === 13) ?? work.isbn?.[0] ?? null
      const coverImage = work.cover_i ? `${OL_COVER_BASE}/id/${work.cover_i}-L.jpg` : null
      return [{
        id: `ol-${work.key.replace('/works/', '')}`,
        external_id: work.key,
        title: work.title ?? 'Titolo sconosciuto',
        type: 'book',
        coverImage,
        year: work.first_publish_year ?? null,
        genres,
        categories: genres,
        score: workScore,
        description: null,
        authors: workAuthors,
        publisher: null,
        pageCount: work.number_of_pages_median ?? null,
        isbn,
        language: null,
        previewLink: `${OL_BASE}${work.key}`,
      }]
    })
  )

  const results = groups
    .flat()
    .filter(r => r.title !== 'Titolo sconosciuto' || r.coverImage)
    .slice(0, 20)

  console.log(`[BOOKS] risultati finali: ${results.length}`)
  return NextResponse.json({ results })
}
