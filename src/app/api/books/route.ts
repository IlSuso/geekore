// src/app/api/books/route.ts
// Edge Function su fra1 (Francoforte) — Google vede IP europeo e rispetta langRestrict=it
// Key: GOOGLE_BOOKS_API_KEY (segreta, server-side)

export const runtime = 'edge'
export const preferredRegion = 'fra1' // Francoforte

import { NextRequest, NextResponse } from 'next/server'
import { truncateAtSentence } from '@/lib/utils'

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1'

function resolveCover(volumeInfo: any): string | undefined {
  const links = volumeInfo.imageLinks || {}
  const best = links.large || links.medium || links.small || links.thumbnail || links.smallThumbnail
  if (!best) return undefined
  return best
    .replace('http://', 'https://')
    .replace('&edge=curl', '')
    .replace('zoom=1', 'zoom=3')
}

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const KEY = process.env.GOOGLE_BOOKS_API_KEY
  const TARGET = 15
  const PAGE_SIZE = 40

  const makeUrl = (startIndex: number) => {
    const p = new URLSearchParams({
      q: `intitle:${q}`,
      maxResults: String(PAGE_SIZE),
      startIndex: String(startIndex),
      printType: 'books',
      orderBy: 'relevance',
      langRestrict: 'it',
      country: 'IT',
      hl: 'it',
      ...(KEY ? { key: KEY } : {}),
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

    // Solo prima pagina — la paginazione causa throttling 503
    const res = await fetch(makeUrl(0))
    if (!res.ok) return NextResponse.json([])

    const data = await res.json()
    const raw: any[] = Array.isArray(data.items) ? data.items : []

    console.log(`[BOOKS] region=fra1 | query="${q}" | risultati=${raw.length} | lingue: ${[...new Set(raw.map((v: any) => v.volumeInfo?.language))].join(',')}`)

    for (const vol of raw) {
      if (items.length >= TARGET) break

      const info = vol.volumeInfo
      if (!info?.title) continue

      if (!normalize(info.title).startsWith(qNorm)) continue

      const bookId = `book-${vol.id}`
      if (seenIds.has(bookId)) continue
      seenIds.add(bookId)

      const rawYear = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : undefined
      const year = rawYear && !isNaN(rawYear) ? rawYear : undefined
      const coverImage = resolveCover(info)
      const identifiers: Array<{ type: string; identifier: string }> = info.industryIdentifiers || []
      const isbn =
        identifiers.find(i => i.type === 'ISBN_13')?.identifier ||
        identifiers.find(i => i.type === 'ISBN_10')?.identifier
      const score = info.averageRating ? Math.round(info.averageRating * 2 * 10) / 10 : undefined
      const rawDesc = (info.description || '').replace(/<[^>]+>/g, '').trim()
      const description = rawDesc ? truncateAtSentence(rawDesc, 400) || undefined : undefined

      items.push({
        id: bookId,
        title: info.title,
        type: 'book',
        source: 'google_books',
        coverImage,
        year,
        description,
        genres: info.categories || [],
        authors: info.authors || [],
        pages: info.pageCount || undefined,
        score,
        isbn,
        publisher: info.publisher || undefined,
        language: info.language || undefined,
      })
    }

    // Italiani prima, poi con cover, poi score
    const sorted = [...items].sort((a, b) => {
      const aIt = a.language === 'it' ? 0 : 1
      const bIt = b.language === 'it' ? 0 : 1
      if (aIt !== bIt) return aIt - bIt
      if (!!a.coverImage !== !!b.coverImage) return a.coverImage ? -1 : 1
      return (b.score ?? 0) - (a.score ?? 0)
    })

    console.log(`[BOOKS] risposta finale: ${sorted.length} libri | lingue: ${[...new Set(sorted.map(b => b.language))].join(',')}`)

    return NextResponse.json(sorted, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[BOOKS] errore:', err)
    return NextResponse.json([])
  }
}