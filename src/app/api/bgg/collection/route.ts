// src/app/api/bgg/collection/route.ts
// Recupera la collezione BGG di un utente tramite username pubblico.
// BGG restituisce 202 se la richiesta è in coda (va riprovata dal client).

import { NextRequest, NextResponse } from 'next/server'

const BGG_BASE = 'https://boardgamegeek.com/xmlapi2'

function bggHeaders(): HeadersInit {
  const token = process.env.BGG_BEARER_TOKEN
  return {
    'User-Agent': 'Geekore/1.0 (geekore.it)',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

interface BGGCollectionItem {
  objectid: string
  name: string
  thumbnail?: string
  image?: string
  categories: string[]
  rating?: number
  numplays?: number
  yearpublished?: number
  minplayers?: number
  maxplayers?: number
  playingtime?: number
}

function parseCollectionXML(xml: string): BGGCollectionItem[] {
  const items: BGGCollectionItem[] = []
  const itemRe = /<item[^>]*objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/gi
  let m

  while ((m = itemRe.exec(xml)) !== null) {
    const objectid = m[1]
    const chunk = m[2]

    // Nome principale
    const nameM = chunk.match(/<name[^>]*sortindex="1"[^>]*>([^<]+)<\/name>/)
    const name = nameM ? nameM[1].trim() : ''
    if (!name) continue

    // Cover
    const thumbnail = (chunk.match(/<thumbnail>([^<]+)<\/thumbnail>/) || [])[1]?.trim()
    const image = (chunk.match(/<image>([^<]+)<\/image>/) || [])[1]?.trim()

    // Anno
    const yearM = chunk.match(/<yearpublished>(\d+)<\/yearpublished>/)
    const yearpublished = yearM ? parseInt(yearM[1]) : undefined

    // Giocatori / tempo
    const minpM = chunk.match(/<minplayers>(\d+)<\/minplayers>/)
    const maxpM = chunk.match(/<maxplayers>(\d+)<\/maxplayers>/)
    const timeM = chunk.match(/<playingtime>(\d+)<\/playingtime>/)

    // Rating personale
    const ratingM = chunk.match(/<rating[^>]*value="([^"]+)"/)
    const ratingRaw = ratingM ? ratingM[1] : 'N/A'
    const rating = ratingRaw !== 'N/A' ? parseFloat(ratingRaw) : undefined

    // Numero di partite registrate
    const numplaysM = chunk.match(/<numplays>(\d+)<\/numplays>/)

    items.push({
      objectid,
      name,
      thumbnail: thumbnail || image || undefined,
      image: image || undefined,
      categories: [],
      rating: rating && !isNaN(rating) ? rating : undefined,
      numplays: numplaysM ? parseInt(numplaysM[1]) : undefined,
      yearpublished,
      minplayers: minpM ? parseInt(minpM[1]) : undefined,
      maxplayers: maxpM ? parseInt(maxpM[1]) : undefined,
      playingtime: timeM ? parseInt(timeM[1]) : undefined,
    })
  }

  return items
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')?.trim()
  if (!username) return NextResponse.json({ error: 'Username mancante' }, { status: 400 })

  const url = `${BGG_BASE}/collection?username=${encodeURIComponent(username)}&stats=1&own=1&excludesubtype=boardgameexpansion`

  try {
    const res = await fetch(url, {
      headers: bggHeaders(),
      // No cache — questa richiesta è specifica per utente
    })

    // BGG restituisce 202 quando la richiesta è in coda
    if (res.status === 202) {
      return NextResponse.json({ retrying: true }, { status: 202 })
    }

    if (!res.ok) {
      return NextResponse.json({ error: `BGG error: ${res.status}` }, { status: res.status })
    }

    const xml = await res.text()

    // Controlla se BGG ha restituito un errore nel body XML
    if (xml.includes('<error>')) {
      const errM = xml.match(/<message>([^<]+)<\/message>/)
      const errMsg = errM ? errM[1] : 'Utente non trovato o collezione privata'
      return NextResponse.json({ error: errMsg }, { status: 404 })
    }

    const items = parseCollectionXML(xml)

    // Estrai il totale dichiarato da BGG per confronto
    const totalM = xml.match(/totalitems="(\d+)"/)
    const total = totalM ? parseInt(totalM[1]) : items.length

    return NextResponse.json({ items, total })
  } catch (err) {
    console.error('[BGG Collection]', err)
    return NextResponse.json({ error: 'Errore di rete' }, { status: 500 })
  }
}
