// src/app/api/books/route.ts
// Google Books API + Open Library fallback per copertine mancanti
// Key env: GOOGLE_BOOKS_API_KEY
// Filtro: solo libri pubblicati da case editrici italiane (lista esaustiva)

import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1'
const OPEN_LIBRARY_COVERS = 'https://covers.openlibrary.org/b'

// ── Case editrici italiane ─────────────────────────────────────────────────────
// Lista normalizzata (lowercase) per confronto case-insensitive

const ITALIAN_PUBLISHERS = new Set([
  // Grandi gruppi e marchi principali
  'mondadori', 'rizzoli', 'einaudi', 'feltrinelli', 'adelphi', 'garzanti',
  'longanesi', 'bompiani', 'piemme', 'tea', 'corbaccio', 'neri pozza',
  'sellerio', 'guanda', 'fazi', 'minimum fax', 'e/o', 'iperborea',
  'la nave di teseo', 'nave di teseo', 'marsilio', 'laterza',
  'il mulino', 'bollati boringhieri', 'einaudi ragazzi',
  'mondadori electa', 'electa', 'skira', 'electa mondadori',

  // Narrativa e saggistica
  'salani', 'piemme', 'de agostini', 'dea planeta', 'planeta de agostini',
  'nord', 'harmony', 'harlequin mondadori', 'sperling & kupfer',
  'sperling kupfer', 'rcs libri', 'rizzoli lizard', 'bur', 'oscar mondadori',
  'mondolibri', 'sonzogno', 'baldini+castoldi', 'baldini castoldi',
  'castelvecchi', 'newton compton', 'newton compton editori',
  'leggereditore', 'legger', 'il saggiatore', 'saggiatore',
  'ponte alle grazie', 'utet', 'utet grandi opere', 'paravia',
  'zanichelli', 'hoepli', 'egea', 'etas', 'rizzoli etas',

  // Ragazzi e giovani adulti
  'giunti', 'giunti junior', 'giunti ragazzi', 'giunti editore',
  'emme edizioni', 'Il castoro', 'castoro', 'lapis', 'gallucci',
  'carthusia', 'topipittori', 'terre di mezzo', 'babalibri',
  'giralangolo', 'coccodrillo', 'fatatrac', 'la coccinella',
  'el', 'edizioni el', 'einaudi ragazzi', 'biancoenero',
  'salani ragazzi', 'mondadori ragazzi', 'rizzoli ragazzi',
  'feltrinelli kids', 'feltrinelli ragazzi',

  // Fumetti e graphic novel
  'panini', 'panini comics', 'panini books', 'bonelli',
  'sergio bonelli', 'star comics', 'magic press', 'dynit manga',
  'j-pop', 'jpop', 'rw edizioni', 'rw goen', 'edizioni bd',
  'tunué', 'tunue', 'bao publishing', 'bao', 'coconino press',
  'black velvet', 'saldapress', 'eris edizioni', 'fanucci',

  // Fantascienza, fantasy, thriller, horror
  'urania', 'mondadori urania', 'gargoyle', 'delos books',
  'multiplayer edizioni', 'multiplayer', 'zona 42', 'edizioni inkiostro',
  'inkiostro', 'kipple officina libraria', 'kipple',
  'acheron books', 'dunwich edizioni', 'dunwich',

  // Saggistica e accademica
  'carocci', 'carocci editore', 'nis', 'carrocci',
  'franco angeli', 'francoangeli', 'vita e pensiero',
  'il mulino', 'bonanno', 'liguori', 'edizioni scientifiche italiane',
  'esi', 'cedam', 'giuffrè', 'giuffre', 'kluwer italia',
  'ipsoa', 'il sole 24 ore', 'sole 24 ore',

  // Cucina, hobby, lifestyle
  'gribaudo', 'slow food editore', 'slow food', 'gambero rosso',
  'guido tommasi', 'tommasi', 'cucina italiana', 'giunti demetra',
  'demetra', 'macro edizioni', 'macro', 'red edizioni', 'red!',

  // Religiosi e spirituali
  'san paolo', 'edizioni san paolo', 'paoline', 'emi',
  'edizioni dehoniane', 'dehoniane', 'cittadella editrice', 'cittadella',
  'queriniana', 'ancora', 'ancora editrice',

  // Locali / indipendenti notevoli
  'palermo university press', 'siciliano', 'flaccovio',
  'rubbettino', 'meridiana', 'avagliano', 'donzelli',
  'editori riuniti', 'meltemi', 'manifestolibri',
  'derive approdi', 'edizioni alegre', 'alegre',
  'nottetempo', 'clichy', 'edizioni clichy',
  'stilo editrice', 'stilo', 'progedit', 'schena editore',
  'wingsbert house', 'iacobelli', 'round robin',
  'racconti edizioni', 'racconti', 'miraggi edizioni', 'miraggi',
  'wojtek', 'edicola ediciones', 'effequ', 'e/o edizioni',
  'oblomov edizioni', 'oblomov', 'marcos y marcos',
  'isbn edizioni', 'isbn', 'excelsior 1881', 'excelsior',
  'rizzoli international', 'mondadori portfolio',
  'vallardi', 'a. vallardi', 'gherardo casini', 'casini',
  'idea libri', 'idea', 'white star', 'whitestar',
  'edizioni white star', 'de vecchi', 'reverdito',
  'gribaudo', 'nord-sud', 'nord sud', 'giochi matematici',
  'sprea', 'sprea editori',
])

/**
 * Restituisce true se l'editore è riconoscibile come italiano.
 * Confronto flessibile: basta che uno dei token della lista sia
 * contenuto nella stringa dell'editore (e viceversa).
 */
function isItalianPublisher(publisher: string | undefined): boolean {
  if (!publisher) return false
  const p = publisher.toLowerCase().trim()
  for (const known of ITALIAN_PUBLISHERS) {
    if (p.includes(known)) return true
  }
  return false
}

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

      // Filtra subito per casa editrice italiana
      if (!isItalianPublisher(info.publisher)) continue

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

      // Descrizione pulita
      const rawDesc = (info.description || '')
        .replace(/<[^>]+>/g, '')
        .trim()
      const description = rawDesc.slice(0, 500) || undefined

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

    // Filtra: tieni solo i libri il cui titolo inizia con la query (case-insensitive)
    const qLower = q.toLowerCase()
    const filtered = items.filter(item => item.title.toLowerCase().startsWith(qLower))

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