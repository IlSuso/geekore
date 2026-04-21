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
  const params = new URLSearchParams({
    q: `intitle:${q}`,
    maxResults: '40',
    printType: 'books',
    orderBy: 'relevance',
    langRestrict: 'it',
    ...(GOOGLE_BOOKS_KEY ? { key: GOOGLE_BOOKS_KEY } : {}),
  })

  try {
    const res = await fetch(`${GOOGLE_BOOKS_BASE}/volumes?${params}`, {
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      console.error('[Books API] Google Books error:', res.status, await res.text())
      return NextResponse.json([])
    }

    const data = await res.json()
    const items: BookItem[] = []

    for (const vol of data.items || []) {
      const info = vol.volumeInfo
      if (!info?.title) continue

      // Filtro hard: solo edizioni realmente in italiano e disponibili in Italia
      if (info.language !== 'it') continue
      if (vol.saleInfo?.country && vol.saleInfo.country !== 'IT') continue

      // Anno pubblicazione (prende solo i primi 4 caratteri per gestire formati tipo "2021-03")
      const rawYear = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : undefined
      const year = rawYear && !isNaN(rawYear) ? rawYear : undefined

      // Cover (Google Books → Open Library fallback)
      const coverImage = resolveCoverUrl(info)

      // ISBN per link esterno e fallback cover
      const identifiers: Array<{ type: string; identifier: string }> =
        info.industryIdentifiers || []
      const isbn =
        identifiers.find(i => i.type === 'ISBN_13')?.identifier ||
        identifiers.find(i => i.type === 'ISBN_10')?.identifier

      // Rating Google Books (da 1 a 5) → normalizzato su 10
      const score = info.averageRating
        ? Math.round(info.averageRating * 2 * 10) / 10
        : undefined

      // Descrizione pulita, tagliata al punto come gli altri media
      const rawDesc = (info.description || '').replace(/<[^>]+>/g, '').trim()
      const description = rawDesc ? truncateAtSentence(rawDesc, 400) || undefined : undefined

      // Generi/categorie da Google Books
      const genres: string[] = info.categories || []

      items.push({
        id: `book-${vol.id}`,
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

    // Normalizza: lowercase + rimuovi punteggiatura per confronto titolo
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
    const qNorm = normalize(q)
    const filtered = items.filter(item => normalize(item.title).startsWith(qNorm))

    // Ordina: con cover prima, poi per score decrescente
    const sorted = [...filtered].sort((a, b) => {
      if (!!a.coverImage !== !!b.coverImage) return a.coverImage ? -1 : 1
      return (b.score ?? 0) - (a.score ?? 0)
    })

    return NextResponse.json(sorted, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    })
  } catch (err) {
    console.error('[Books API]', err)
    return NextResponse.json([])
  }
}