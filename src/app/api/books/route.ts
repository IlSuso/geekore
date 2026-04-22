// src/app/api/books/route.ts
// FIX: Edge Function su region cdg1 (Parigi) — Google vede IP europeo e rispetta langRestrict=it

export const runtime = 'edge'
export const preferredRegion = 'cdg1' // Parigi — IP europeo, Google rispetta langRestrict=it

import { NextRequest, NextResponse } from 'next/server'
import { truncateAtSentence } from '@/lib/utils'

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1'
const OPEN_LIBRARY_COVERS = 'https://covers.openlibrary.org/b'

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

  const GOOGLE_BOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY

  const TARGET = 15
  const PAGE_SIZE = 40
  // Fetch molti più risultati perché filtriamo lato codice per lang=it
  const PAGE_SIZE_LARGE = 40
  const MAX_PAGES = 5 // fino a 200 risultati totali per trovare abbastanza italiani

  const makeUrl = (q_str: string, startIndex: number) => {
    const p = new URLSearchParams({
      q: q_str,
      maxResults: String(PAGE_SIZE_LARGE),
      startIndex: String(startIndex),
      printType: 'books',
      orderBy: 'relevance',
      country: 'IT',
      hl: 'it',
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
    // Strategia: fetch paginato su più pagine, raccogliamo TUTTI i risultati
    // e filtriamo lato codice per lang=it — unica soluzione affidabile
    // dato che langRestrict=it viene ignorato dai server USA di Vercel

    const seenRaw = new Set<string>()
    let allRaw: any[] = []

    // Fetch parallelo di MAX_PAGES pagine per raccogliere molti risultati
    const pageRequests = Array.from({ length: MAX_PAGES }, (_, i) =>
      fetch(makeUrl(`intitle:${q}`, i * PAGE_SIZE_LARGE))
    )
    const pageResults = await Promise.allSettled(pageRequests)

    for (let i = 0; i < pageResults.length; i++) {
      const r = pageResults[i]
      if (r.status !== 'fulfilled' || !r.value.ok) continue
      try {
        const data = await r.value.json()
        const raw = Array.isArray(data.items) ? data.items : []
        if (raw.length === 0) break // niente più risultati
        const itCount = raw.filter((v: any) => v.volumeInfo?.language === 'it').length
        console.log(`[BOOKS] Pagina ${i+1}: ${raw.length} risultati | it=${itCount} | lingue: ${[...new Set(raw.map((v: any) => v.volumeInfo?.language))].join(',')}`)
        for (const v of raw) {
          if (!seenRaw.has(v.id)) { seenRaw.add(v.id); allRaw.push(v) }
        }
      } catch {}
    }

    // Separa italiani da non-italiani
    const itRaw = allRaw.filter(v => v.volumeInfo?.language === 'it')
    const otherRaw = allRaw.filter(v => v.volumeInfo?.language !== 'it')
    console.log(`[BOOKS] Totale: ${allRaw.length} | italiani: ${itRaw.length} | altri: ${otherRaw.length}`)

    // Usa italiani se ne abbiamo abbastanza, altrimenti fallback su tutti
    const sourceRaw = itRaw.length >= 3 ? itRaw : allRaw

    const items: BookItem[] = []
    const seenIds = new Set<string>()

    for (const vol of sourceRaw) {
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

    // Filtro intelligente: se abbiamo almeno 5 italiani usiamo solo quelli,
    // altrimenti teniamo tutto per non lasciare la pagina vuota
    const italianItems = items.filter(b => b.language === 'it')
    const finalItems = italianItems.length >= 5 ? italianItems : items
    console.log(`[BOOKS] Filtro IT: ${italianItems.length} italiani / ${items.length} totali → ${finalItems === italianItems ? 'SOLO IT' : 'TUTTI (it insufficienti)'}`)

    // Sort finale: it prima, poi cover, poi score
    const sorted = [...finalItems].sort((a, b) => {
      const aIt = a.language === 'it' ? 0 : 1
      const bIt = b.language === 'it' ? 0 : 1
      if (aIt !== bIt) return aIt - bIt
      if (!!a.coverImage !== !!b.coverImage) return a.coverImage ? -1 : 1
      return (b.score ?? 0) - (a.score ?? 0)
    })

    console.log(`[BOOKS] Risposta finale: ${sorted.length} libri | lingue: ${[...new Set(sorted.map(b => b.language))].join(',')}`)

    return NextResponse.json(sorted, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[BOOKS] ERRORE:', err)
    return NextResponse.json([])
  }
}