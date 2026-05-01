// src/app/api/bgg/route.ts
// BoardGameGeek XML API v2
// Richiede Authorization: Bearer <token> per tutte le richieste.
// Flow: search (lista ID) → thing (dettagli per batch da 20, max 60 totali)

import { NextRequest, NextResponse } from 'next/server'
import { truncateAtSentence } from '@/lib/utils'
import { translateWithCache } from '@/lib/deepl'
import { logger } from '@/lib/logger'

const BGG_BASE = 'https://boardgamegeek.com/xmlapi2'

function bggHeaders(): HeadersInit {
  const token = process.env.BGG_BEARER_TOKEN
  return {
    'User-Agent': 'Geekore/1.0 (geekore.it)',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ── XML parsing leggero (no librerie esterne) ────────────────────────────────

function extractText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'))
  return m ? m[1].trim() : ''
}

function extractPrimaryName(xml: string): string {
  const m = xml.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/)
  return m ? m[1].trim() : ''
}

function extractLinks(xml: string, linkType: string): string[] {
  const re = new RegExp(`<link[^>]*type="${linkType}"[^>]*value="([^"]*)"`, 'gi')
  const results: string[] = []
  let m
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim())
  return results
}

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface BGGItem {
  id: string
  title: string
  type: 'boardgame'
  source: 'bgg'
  coverImage?: string
  year?: number
  description?: string
  genres?: string[]
  mechanics?: string[]
  designers?: string[]
  min_players?: number
  max_players?: number
  playing_time?: number
  complexity?: number
  score?: number
}

// ── Step 1: ricerca → lista ID ───────────────────────────────────────────────

async function searchBGG(query: string): Promise<string[]> {
  const url = `${BGG_BASE}/search?query=${encodeURIComponent(query)}&type=boardgame`
  const res = await fetch(url, {
    headers: bggHeaders(),
    next: { revalidate: 300 },
  })
  if (!res.ok) {
    logger.warn('BGG', 'search failed', { status: res.status })
    return []
  }
  const xml = await res.text()
  const itemRe = /<item[^>]*id="(\d+)"/g
  const ids: string[] = []
  let m
  while ((m = itemRe.exec(xml)) !== null) {
    ids.push(m[1])
    if (ids.length >= 60) break // 3 batch da 20 = 60 ID totali
  }
  return ids
}

// ── Step 2a: dettagli per un singolo batch di ID ─────────────────────────────

async function fetchBGGBatch(ids: string[]): Promise<BGGItem[]> {
  const url = `${BGG_BASE}/thing?id=${ids.join(',')}&stats=1`
  const res = await fetch(url, {
    headers: bggHeaders(),
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    logger.warn('BGG', 'thing failed', { status: res.status })
    return []
  }
  const xml = await res.text()

  const itemRe = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
  const items: BGGItem[] = []
  let m

  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[0]
    const idM = chunk.match(/\bid="(\d+)"/)
    if (!idM) continue

    const name = extractPrimaryName(chunk)
    if (!name) continue

    // Cover: preferisci image (alta risoluzione) su thumbnail
    const image = extractText(chunk, 'image').replace(/^\s+|\s+$/g, '')
    const thumbnail = extractText(chunk, 'thumbnail').replace(/^\s+|\s+$/g, '')
    const cover = (image || thumbnail) || undefined

    // Anno
    const yearStr = extractAttr(chunk, 'yearpublished', 'value')
    const year = yearStr ? parseInt(yearStr) : undefined

    // Descrizione: decodifica entità HTML base
    const rawDesc = extractText(chunk, 'description')
    const description = rawDesc
      .replace(/&#10;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()
    const trimmedDesc = description ? truncateAtSentence(description, 400) || undefined : undefined

    // Categorie → generi, meccaniche, designer
    const genres = extractLinks(chunk, 'boardgamecategory')
    const mechanics = extractLinks(chunk, 'boardgamemechanic')
    const designers = extractLinks(chunk, 'boardgamedesigner')
      .filter(d => d !== '(Uncredited)')
      .slice(0, 5)

    // Giocatori e tempo
    const minPlayers = parseInt(extractAttr(chunk, 'minplayers', 'value')) || undefined
    const maxPlayers = parseInt(extractAttr(chunk, 'maxplayers', 'value')) || undefined
    const playingTime = parseInt(extractAttr(chunk, 'playingtime', 'value')) || undefined

    // Rating BGG normalizzato su /5 (BGG usa scala 1-10)
    const ratingM = chunk.match(/<average[^>]*value="([\d.]+)"/)
    const score = ratingM ? Math.round((parseFloat(ratingM[1]) / 2) * 10) / 10 : undefined

    // Complessità/weight (da 1 a 5)
    const weightM = chunk.match(/<averageweight[^>]*value="([\d.]+)"/)
    const complexity = weightM ? Math.round(parseFloat(weightM[1]) * 10) / 10 : undefined

    items.push({
      id: `bgg-${idM[1]}`,
      title: name,
      type: 'boardgame',
      source: 'bgg',
      coverImage: cover,
      year: isNaN(year!) ? undefined : year,
      description: trimmedDesc,
      genres: genres.length > 0 ? genres : undefined,
      mechanics: mechanics.length > 0 ? mechanics : undefined,
      designers: designers.length > 0 ? designers : undefined,
      min_players: minPlayers,
      max_players: maxPlayers,
      playing_time: playingTime,
      complexity,
      score,
    })
  }

  return items
}

// ── Step 2b: divide gli ID in batch da 20 (limite hard BGG) e li richiede in parallelo ─

async function fetchBGGDetails(ids: string[]): Promise<BGGItem[]> {
  if (!ids.length) return []

  const BATCH_SIZE = 20 // limite hard BGG: max 20 ID per richiesta /thing
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    batches.push(ids.slice(i, i + BATCH_SIZE))
  }

  const results = await Promise.allSettled(batches.map(b => fetchBGGBatch(b)))
  const all: BGGItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value)
  }
  return all
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  try {
    const ids = await searchBGG(q)
    if (!ids.length) return NextResponse.json([])

    // Fetch dettagli — tutti e 60 gli ID trovati dalla search, in batch paralleli
    const items = await fetchBGGDetails(ids)

    // Traduci descrizioni in italiano se la lingua richiesta è IT
    const lang = req.headers.get('x-lang') || req.nextUrl.searchParams.get('lang') || 'it'
    if (lang === 'it') {
      const toTranslate = items.filter(r => r.description)
      if (toTranslate.length > 0) {
        const descItems = toTranslate.map(r => ({ id: r.id, text: r.description! }))
        const translated = await translateWithCache(descItems, 'IT', 'EN')
        toTranslate.forEach(r => {
          if (translated[r.id]) r.description = translated[r.id]
        })
      }
    }

    // Normalizza: rimuove accenti, punteggiatura, spazi multipli — NON rimuove stop words
    // così "the crew" matcha "The Crew: ...", "The Crew 2", ecc.
    const normalizeQ = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

    const qNorm = normalizeQ(q)

    // Ordine: prima i titoli che iniziano con la query, poi quelli che la contengono
    const starts: BGGItem[] = []
    const contains: BGGItem[] = []
    for (const item of items) {
      const t = normalizeQ(item.title)
      if (t.startsWith(qNorm)) starts.push(item)
      else if (t.includes(qNorm)) contains.push(item)
    }
    const ranked = [...starts, ...contains]

    // Ordina dentro ogni gruppo: con cover prima, poi score BGG decrescente
    const sortGroup = (g: BGGItem[]) => g.sort((a, b) => {
      if (!!a.coverImage !== !!b.coverImage) return a.coverImage ? -1 : 1
      return (b.score ?? 0) - (a.score ?? 0)
    })
    const sorted = [...sortGroup(starts), ...sortGroup(contains)]

    return NextResponse.json(sorted, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    })
  } catch (err) {
    logger.error('BGG', 'API failed', err)
    return NextResponse.json([])
  }
}
