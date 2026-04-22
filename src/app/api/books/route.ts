// src/app/api/books/route.ts
// Google Books API + Open Library fallback per copertine mancanti
// Key env: GOOGLE_BOOKS_API_KEY
// Filtro lingua: langRestrict=it (solo edizioni in italiano)

import { NextRequest, NextResponse } from 'next/server'
import { truncateAtSentence } from '@/lib/utils'

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1'
const OPEN_LIBRARY_COVERS = 'https://covers.openlibrary.org/b'

// ── Cover helpers ─────────────────────────────────────────────────────────────

function openLibraryCoverByISBN(isbn: string): string {
  return `${OPEN_LIBRARY_COVERS}/isbn/${isbn}-L.jpg`
}

/**
 * Risolve la migliore copertina disponibile:
 * 1. Google Books imageLinks (thumbnail → upgrade zoom per qualità)
 * 2. Open Library via ISBN-13
 * 3. Open Library via ISBN-10
 * 4. undefined
 */
function resolveCoverUrl(volumeInfo: any): string | undefined {
  // 1. Google Books — upgrade da thumbnail (zoom=1) a qualità maggiore (zoom=3)
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

  // 2. Fallback Open Library via ISBN
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

  // Usa intitle: per cercare solo nel titolo, langRestrict=it per libri italiani
  // Chiamate sequenziali da 40 risultati ciascuna, max 5 chiamate (200 totali)
  // Si ferma non appena si raggiungono 15 titoli validi
  const TARGET = 15
  const MAX_CALLS = 5
  const PAGE_SIZE = 40

  // Due query parallele per ogni "pagina":
  // - query globale (tutti i libri per rilevanza)  
  // - query con langRestrict=it (forza edizioni italiane)
  // Così si pescano sia i titoli italiani che eventuali edizioni straniere
  const makeParams = (startIndex: number, langIt: boolean) => {
    const p = new URLSearchParams({
      q: `intitle:${q}`,
      maxResults: String(PAGE_SIZE),
      startIndex: String(startIndex),
      printType: 'books',
      orderBy: 'relevance',
      ...(langIt ? { langRestrict: 'it' } : {}),
      ...(GOOGLE_BOOKS_KEY ? { key: GOOGLE_BOOKS_KEY } : {}),
    })
    return `${GOOGLE_BOOKS_BASE}/volumes?${p}`
  }

  // Normalizza per confronto titolo (definita qui perché serve nel loop)
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

  const dbg = (msg: string, data?: any) => {
    if (data !== undefined) {
      console.log(`[Books DEBUG] ${msg}`, JSON.stringify(data, null, 2))
    } else {
      console.log(`[Books DEBUG] ${msg}`)
    }
  }

  dbg('=== INIZIO RICERCA ===', { q, qNorm })

  try {
    const items: BookItem[] = []
    const seenIds = new Set<string>()

    for (let call = 0; call < MAX_CALLS; call++) {
      if (items.length >= TARGET) {
        dbg(`Target ${TARGET} raggiunto, stop prima della chiamata ${call + 1}`)
        break
      }

      const startIndex = call * PAGE_SIZE
      dbg(`Chiamata #${call + 1} — startIndex=${startIndex} (2 query parallele: globale + langRestrict=it)`)

      // Fetch parallelo: query globale + query italiana
      let results: any[] = []
      try {
        const [resGlobal, resIt] = await Promise.allSettled([
          fetch(makeParams(startIndex, false), { next: { revalidate: 300 } }),
          fetch(makeParams(startIndex, true), { next: { revalidate: 300 } }),
        ])

        for (const [label, r] of [['globale', resGlobal], ['it', resIt]] as [string, PromiseSettledResult<Response>][]) {
          if (r.status !== 'fulfilled' || !r.value.ok) {
            dbg(`Query ${label} fallita`, { status: r.status === 'fulfilled' ? r.value.status : 'network error' })
            continue
          }
          let data: any
          try { data = await r.value.json() } catch { continue }
          dbg(`Query ${label} risposta`, { totalItems: data.totalItems, itemsReturned: Array.isArray(data.items) ? data.items.length : 0 })
          if (Array.isArray(data.items)) results.push(...data.items)
        }
      } catch {
        break
      }

      // Deduplica tra le due query (stesso id Google Books)
      const seenPageIds = new Set<string>()
      results = results.filter(v => {
        if (seenPageIds.has(v.id)) return false
        seenPageIds.add(v.id)
        return true
      })

      const rawVolumes = results

      if (rawVolumes.length === 0) {
        dbg(`Chiamata #${call + 1} — nessun volume restituito, stop loop`)
        break
      }

      // Log titoli grezzi ricevuti
      dbg(`Chiamata #${call + 1} — titoli grezzi ricevuti (${rawVolumes.length})`, 
        rawVolumes.map(v => ({
          id: v.id,
          title: v.volumeInfo?.title,
          language: v.volumeInfo?.language,
          normalizedTitle: v.volumeInfo?.title ? normalize(v.volumeInfo.title) : null,
          startsWithQuery: v.volumeInfo?.title ? normalize(v.volumeInfo.title).startsWith(qNorm) : false,
        }))
      )

      let addedThisPage = 0
      let skippedNoTitle = 0
      let skippedLang = 0
      let skippedTitle = 0
      let skippedDupe = 0

      for (const vol of rawVolumes) {
        if (items.length >= TARGET) {
          dbg(`Target ${TARGET} raggiunto nel loop interno`)
          break
        }

        const info = vol.volumeInfo

        if (!info?.title) { skippedNoTitle++; continue }

        // Preferenza italiana: accetta it + en + altre lingue comuni
        // NON filtriamo hard per lingua — mostriamo tutto ciò che l'utente ha cercato
        const lang = info.language || 'unknown'

        const normalizedBookTitle = normalize(info.title)
        if (!normalizedBookTitle.startsWith(qNorm)) {
          skippedTitle++
          dbg(`SCARTATO (titolo non match) | titolo="${info.title}" | normalizzato="${normalizedBookTitle}" | query="${qNorm}"`)
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
        addedThisPage++
        dbg(`AGGIUNTO | "${info.title}" | lang=${lang} | cover=${!!coverImage}`)
      }

      dbg(`Chiamata #${call + 1} — riepilogo filtri`, {
        skippedNoTitle,
        skippedLang,
        skippedTitle,
        skippedDupe,
        addedThisPage,
        totalSoFar: items.length,
      })
    } // fine loop chiamate

    dbg(`=== FINE LOOP === items trovati: ${items.length}`)

    const filtered = items

    // Ordina: italiano prima, poi con cover, poi per score decrescente
    const sorted = [...filtered].sort((a, b) => {
      const aIt = a.language === 'it' ? 0 : 1
      const bIt = b.language === 'it' ? 0 : 1
      if (aIt !== bIt) return aIt - bIt
      if (!!a.coverImage !== !!b.coverImage) return a.coverImage ? -1 : 1
      return (b.score ?? 0) - (a.score ?? 0)
    })

    dbg(`=== RISPOSTA FINALE ===`, sorted.map(s => ({ id: s.id, title: s.title, cover: !!s.coverImage })))

    return NextResponse.json(sorted, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    })
  } catch (err) {
    console.error('[Books API]', err)
    return NextResponse.json([])
  }
}