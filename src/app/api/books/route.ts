// src/app/api/books/route.ts
// DEBUG VERSION — log completi su terminale (locale) e Vercel Function Logs (web)

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
  const isVercel = !!process.env.VERCEL
  const region = process.env.VERCEL_REGION || 'unknown'

  // ── LOG INTESTAZIONE ──────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log(`[BOOKS DEBUG] Ambiente: ${isVercel ? `VERCEL (region: ${region})` : 'LOCALE'}`)
  console.log(`[BOOKS DEBUG] Query: "${q}"`)
  console.log(`[BOOKS DEBUG] API Key presente: ${!!GOOGLE_BOOKS_KEY}`)
  console.log('='.repeat(60))

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
      country: 'IT',
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
  console.log(`[BOOKS DEBUG] Query normalizzata: "${qNorm}"`)

  try {
    const items: BookItem[] = []
    const seenIds = new Set<string>()

    for (let call = 0; call < MAX_CALLS; call++) {
      if (items.length >= TARGET) break

      const startIndex = call * PAGE_SIZE
      const urlIt     = makeParams(startIndex, true)
      const urlGlobal = makeParams(startIndex, false)

      console.log(`\n[BOOKS DEBUG] --- Chiamata #${call + 1} (startIndex=${startIndex}) ---`)
      console.log(`[BOOKS DEBUG] URL italiana:  ${urlIt}`)
      console.log(`[BOOKS DEBUG] URL globale:   ${urlGlobal}`)

      let resultsIt: any[] = []
      let resultsGlobal: any[] = []

      try {
        const [resIt, resGlobal] = await Promise.allSettled([
          fetch(urlIt),
          fetch(urlGlobal),
        ])

        // Risultati italiani
        if (resIt.status === 'fulfilled') {
          console.log(`[BOOKS DEBUG] Risposta italiana: HTTP ${resIt.value.status}`)
          if (resIt.value.ok) {
            try {
              const data = await resIt.value.json()
              resultsIt = Array.isArray(data.items) ? data.items : []
              console.log(`[BOOKS DEBUG] Volumi italiani ricevuti: ${resultsIt.length} (totalItems: ${data.totalItems ?? '?'})`)
              console.log(`[BOOKS DEBUG] Titoli italiani grezzi:`)
              resultsIt.forEach((v: any, i: number) => {
                console.log(`  [IT ${i+1}] "${v.volumeInfo?.title}" | lang=${v.volumeInfo?.language} | cover=${!!v.volumeInfo?.imageLinks}`)
              })
            } catch (e) { console.log(`[BOOKS DEBUG] Errore parse JSON italiana: ${e}`) }
          }
        } else {
          console.log(`[BOOKS DEBUG] Fetch italiana FALLITA: ${resIt.reason}`)
        }

        // Risultati globali
        if (resGlobal.status === 'fulfilled') {
          console.log(`[BOOKS DEBUG] Risposta globale: HTTP ${resGlobal.value.status}`)
          if (resGlobal.value.ok) {
            try {
              const data = await resGlobal.value.json()
              resultsGlobal = Array.isArray(data.items) ? data.items : []
              console.log(`[BOOKS DEBUG] Volumi globali ricevuti: ${resultsGlobal.length} (totalItems: ${data.totalItems ?? '?'})`)
              console.log(`[BOOKS DEBUG] Titoli globali grezzi:`)
              resultsGlobal.forEach((v: any, i: number) => {
                console.log(`  [GL ${i+1}] "${v.volumeInfo?.title}" | lang=${v.volumeInfo?.language} | cover=${!!v.volumeInfo?.imageLinks}`)
              })
            } catch (e) { console.log(`[BOOKS DEBUG] Errore parse JSON globale: ${e}`) }
          }
        } else {
          console.log(`[BOOKS DEBUG] Fetch globale FALLITA: ${resGlobal.reason}`)
        }
      } catch (e) {
        console.log(`[BOOKS DEBUG] Eccezione fetch: ${e}`)
        break
      }

      // Italiani prima nel merge
      const combined = [...resultsIt, ...resultsGlobal]
      const seenPageIds = new Set<string>()
      const results = combined.filter(v => {
        if (seenPageIds.has(v.id)) return false
        seenPageIds.add(v.id)
        return true
      })

      console.log(`[BOOKS DEBUG] Dopo dedup: ${results.length} volumi (${resultsIt.length} it + ${resultsGlobal.length} gl - duplicati)`)

      if (results.length === 0) {
        console.log(`[BOOKS DEBUG] Nessun volume, stop loop`)
        break
      }

      let addedCount = 0
      let skippedTitle = 0
      let skippedDupe = 0

      for (const vol of results) {
        if (items.length >= TARGET) break

        const info = vol.volumeInfo
        if (!info?.title) continue

        const normalizedBookTitle = normalize(info.title)
        if (!normalizedBookTitle.startsWith(qNorm)) {
          skippedTitle++
          console.log(`[BOOKS DEBUG] SCARTATO (titolo): "${info.title}" → norm="${normalizedBookTitle}" vs query="${qNorm}"`)
          continue
        }

        const bookId = `book-${vol.id}`
        if (seenIds.has(bookId)) { skippedDupe++; continue }
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
        addedCount++
        console.log(`[BOOKS DEBUG] AGGIUNTO: "${info.title}" | lang=${info.language} | cover=${!!coverImage} | year=${year}`)
      }

      console.log(`[BOOKS DEBUG] Chiamata #${call + 1} riepilogo: +${addedCount} aggiunti, ${skippedTitle} scartati (titolo), ${skippedDupe} duplicati | totale=${items.length}`)
    }

    // Ordina: italiano prima, poi con cover, poi score
    const sorted = [...items].sort((a, b) => {
      const aIt = a.language === 'it' ? 0 : 1
      const bIt = b.language === 'it' ? 0 : 1
      if (aIt !== bIt) return aIt - bIt
      if (!!a.coverImage !== !!b.coverImage) return a.coverImage ? -1 : 1
      return (b.score ?? 0) - (a.score ?? 0)
    })

    console.log(`\n[BOOKS DEBUG] RISPOSTA FINALE (${sorted.length} libri):`)
    sorted.forEach((b, i) => {
      console.log(`  [${i+1}] "${b.title}" | lang=${b.language} | cover=${!!b.coverImage} | year=${b.year}`)
    })
    console.log('='.repeat(60) + '\n')

    return NextResponse.json(sorted, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[BOOKS DEBUG] ERRORE CRITICO:', err)
    return NextResponse.json([])
  }
}