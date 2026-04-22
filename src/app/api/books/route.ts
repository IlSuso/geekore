// src/app/api/books/route.ts
// FIX: Google Books ignora langRestrict=it dai server USA (Vercel iad1)
// Soluzione: aggiunta hl=it (host language) che forza metadati in italiano
// + country=IT + langRestrict=it + inlanguage:ita nella query

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

  const makeUrl = (q_str: string, langIt: boolean) => {
    const p = new URLSearchParams({
      q: q_str,
      maxResults: String(PAGE_SIZE),
      startIndex: '0',
      printType: 'books',
      orderBy: 'relevance',
      country: 'IT',   // mercato italiano
      hl: 'it',        // host language: forza metadati in italiano
      ...(langIt ? { langRestrict: 'it' } : {}),
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
    // Tre query parallele in ordine di priorità:
    // 1. intitle + langRestrict=it + hl=it  → edizioni italiane (massima priorità)
    // 2. intitle + inlanguage:ita + hl=it   → filtro lingua nella query stessa
    // 3. intitle globale + hl=it            → fallback con almeno metadati italiani
    const [resIt, resItLang, resGlobal] = await Promise.allSettled([
      fetch(makeUrl(`intitle:${q}`, true)),
      fetch(makeUrl(`intitle:${q}+inlanguage:ita`, false)),
      fetch(makeUrl(`intitle:${q}`, false)),
    ])

    const fetchLabel = ['IT+langRestrict', 'IT+inlanguage', 'GLOBAL']
    const fetchResults = [resIt, resItLang, resGlobal]

    let allRaw: any[] = []

    for (let i = 0; i < fetchResults.length; i++) {
      const r = fetchResults[i]
      if (r.status !== 'fulfilled' || !r.value.ok) {
        console.log(`[BOOKS] ${fetchLabel[i]}: FAILED`)
        continue
      }
      try {
        const data = await r.value.json()
        const raw = Array.isArray(data.items) ? data.items : []
        console.log(`[BOOKS] ${fetchLabel[i]}: ${raw.length} risultati | lingue: ${[...new Set(raw.map((v: any) => v.volumeInfo?.language))].join(',')}`)
        allRaw.push(...raw)
      } catch {}
    }

    // Dedup: il primo che compare vince (IT+langRestrict è primo)
    const seenRaw = new Set<string>()
    allRaw = allRaw.filter(v => {
      if (seenRaw.has(v.id)) return false
      seenRaw.add(v.id)
      return true
    })

    // Riordina: lang=it sempre prima
    allRaw.sort((a, b) => {
      const aIt = a.volumeInfo?.language === 'it' ? 0 : 1
      const bIt = b.volumeInfo?.language === 'it' ? 0 : 1
      return aIt - bIt
    })

    console.log(`[BOOKS] Dopo dedup+sort: ${allRaw.length} volumi | lingue: ${[...new Set(allRaw.map((v: any) => v.volumeInfo?.language))].join(',')}`)

    const items: BookItem[] = []
    const seenIds = new Set<string>()

    for (const vol of allRaw) {
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