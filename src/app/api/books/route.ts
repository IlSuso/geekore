// src/app/api/books/route.ts
// Google Books API + Open Library fallback per copertine mancanti
// Key env: GOOGLE_BOOKS_API_KEY

import { NextRequest, NextResponse } from 'next/server'
import { truncateAtSentence } from '@/lib/utils'

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1'
const OPEN_LIBRARY_COVERS = 'https://covers.openlibrary.org/b'

// ── Cover helpers ─────────────────────────────────────────────────────────────

function openLibraryCoverByISBN(isbn: string): string {
  return `${OPEN_LIBRARY_COVERS}/isbn/${isbn}-L.jpg`
}

function resolveCoverUrl(volumeInfo: any): string | undefined {
  const gbThumb =
    volumeInfo.imageLinks?.large ||
    volumeInfo.imageLinks?.medium ||
    volumeInfo.imageLinks?.thumbnail ||
    volumeInfo.imageLinks?.smallThumbnail

  if (gbThumb) {
    return gbThumb
      .replace('http://', 'https://')
      .replace('&edge=curl', '')
      .replace('zoom=1', 'zoom=3')
  }

  const identifiers: Array<{ type: string; identifier: string }> =
    volumeInfo.industryIdentifiers || []
  const isbn13 = identifiers.find(i => i.type === 'ISBN_13')?.identifier
  const isbn10 = identifiers.find(i => i.type === 'ISBN_10')?.identifier

  if (isbn13) return openLibraryCoverByISBN(isbn13)
  if (isbn10) return openLibraryCoverByISBN(isbn10)

  return undefined
}

// ── Tipo output ───────────────────────────────────────────────────────────────

interface BookItem {
  id: string
  title: string
  type: 'book'
  source: 'google_books'
  coverImage?: string
  year?: number
  description?: string
  genres?: string[]
  authors?: string[]
  pages?: number
  score?: number
  isbn?: string
  publisher?: string
  language?: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) return NextResponse.json([])

  const GOOGLE_BOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY

  const TARGET = 15
  const MAX_CALLS = 5
  const PAGE_SIZE = 40

  const makeParams = (startIndex: number, langIt: boolean) => {
    const p = new URLSearchParams({
      q: `intitle:${q}`,
      maxResults: String(PAGE_SIZE),
      startIndex: String(startIndex),
      printType: 'books',
      orderBy: 'relevance',
      ...(langIt ? { langRestrict: 'it', country: 'IT' } : {}),
      ...(GOOGLE_BOOKS_KEY ? { key: GOOGLE_BOOKS_KEY } : {}),
    })
    return `${GOOGLE_BOOKS_BASE}/volumes?${p}`
  }

  const STOP_WORDS = new Set([
    'il','lo','la','i','gli','le','un','uno','una',
    'del','dello','della','dei','degli','delle',
    'al','allo','alla','ai','agli','alle',
    'dal','dallo','dalla','dai','dagli','dalle',
    'nel','nello','nella','nei','negli','nelle',
    'sul','sullo','sulla','sui','sugli','sulle',
    'di','da','in','con','su','per','tra','fra',
    'the','a','an',
  ])

  const normalize = (s: string) => {
    let r = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
    const firstSpace = r.indexOf(' ')
    if (firstSpace > 0) {
      const firstWord = r.slice(0, firstSpace)
      if (STOP_WORDS.has(firstWord)) r = r.slice(firstSpace + 1).trim()
    }
    return r
  }

  const qNorm = normalize(q)

  try {
    const items: BookItem[] = []
    const seenIds = new Set<string>()

    for (let call = 0; call < MAX_CALLS; call++) {
      if (items.length >= TARGET) break

      const startIndex = call * PAGE_SIZE

      let results: any[] = []
      try {
        const [resGlobal, resIt] = await Promise.allSettled([
          fetch(makeParams(startIndex, false)),
          fetch(makeParams(startIndex, true)),
        ])

        for (const r of [resGlobal, resIt] as PromiseSettledResult<Response>[]) {
          if (r.status !== 'fulfilled' || !r.value.ok) continue
          let data: any
          try { data = await r.value.json() } catch { continue }
          if (Array.isArray(data.items)) results.push(...data.items)
        }
      } catch {
        break
      }

      // Deduplica tra le due query
      const seenPageIds = new Set<string>()
      results = results.filter(v => {
        if (seenPageIds.has(v.id)) return false
        seenPageIds.add(v.id)
        return true
      })

      if (results.length === 0) break

      for (const vol of results) {
        if (items.length >= TARGET) break

        const info = vol.volumeInfo
        if (!info?.title) continue

        const normalizedBookTitle = normalize(info.title)

        if (!normalizedBookTitle.startsWith(qNorm)) continue

        const bookId = `book-${vol.id}`
        if (seenIds.has(bookId)) continue
        seenIds.add(bookId)

        const rawYear = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : undefined
        const year = rawYear && !isNaN(rawYear) ? rawYear : undefined
        const coverImage = resolveCoverUrl(info)
        const identifiers: Array<{ type: string; identifier: string }> = info.industryIdentifiers || []
        const isbn =
          identifiers.find(i => i.type === 'ISBN_13')?.identifier ||
          identifiers.find(i => i.type === 'ISBN_10')?.identifier
        const score = info.averageRating ? Math.round(info.averageRating * 2 * 10) / 10 : undefined
        const rawDesc = (info.description || '').replace(/<[^>]+>/g, '').trim()
        const description = rawDesc ? truncateAtSentence(rawDesc, 400) || undefined : undefined
        const genres: string[] = info.categories || []

        items.push({
          id: bookId,
          title: info.title,
          type: 'book',
          source: 'google_books',
          coverImage,
          year,
          description,
          genres,
          authors: info.authors || [],
          pages: info.pageCount || undefined,
          score,
          isbn,
          publisher: info.publisher || undefined,
          language: info.language || undefined,
        })
      }
    }

    // Ordina: italiano prima, poi con cover, poi per score decrescente
    const sorted = [...items].sort((a, b) => {
      const aIt = a.language === 'it' ? 0 : 1
      const bIt = b.language === 'it' ? 0 : 1
      if (aIt !== bIt) return aIt - bIt
      if (!!a.coverImage !== !!b.coverImage) return a.coverImage ? -1 : 1
      return (b.score ?? 0) - (a.score ?? 0)
    })

    return NextResponse.json(sorted, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[Books API]', err)
    return NextResponse.json([])
  }
}