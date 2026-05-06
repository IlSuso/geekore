// src/app/api/bgg/collection/route.ts
// Recupera la collezione BGG di un utente tramite username pubblico.
// BGG restituisce 202 se la richiesta è in coda (va riprovata dal client).

import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { logger } from '@/lib/logger'

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
  if (!username) return NextResponse.json({ error: apiMessage(req, 'missingUsername') }, { status: 400 })

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

    // Arricchimento server-side con /thing (meccaniche, designer, complexity, bgg_score)
    // Le richieste a BGG devono essere server-side per policy — max 20 ID per batch, 5s tra batch
    const allIds = items.map(it => it.objectid)
    const enriched: Record<string, any> = {}

    for (let i = 0; i < allIds.length; i += 20) {
      const batch = allIds.slice(i, i + 20)
      try {
        const thingUrl = `${BGG_BASE}/thing?id=${batch.join(',')}&stats=1`
        const thingRes = await fetch(thingUrl, {
          headers: bggHeaders(),
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(10000),
        })
        if (thingRes.ok) {
          const thingXml = await thingRes.text()
          const itemRe = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
          let m
          while ((m = itemRe.exec(thingXml)) !== null) {
            const chunk = m[0]
            const idM = chunk.match(/\bid="(\d+)"/)
            if (!idM) continue
            const mechanics: string[] = []
            const mechRe = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]+)"/gi
            let cm
            while ((cm = mechRe.exec(chunk)) !== null) mechanics.push(cm[1])
            const designers: string[] = []
            const desRe = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]+)"/gi
            while ((cm = desRe.exec(chunk)) !== null) {
              if (cm[1] !== '(Uncredited)') designers.push(cm[1])
            }
            // Categorie aggiuntive (per genres)
            const categories: string[] = []
            const catRe = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]+)"/gi
            while ((cm = catRe.exec(chunk)) !== null) categories.push(cm[1])

            const ratingM = chunk.match(/<average[^>]*value="([\d.]+)"/)
            const bggScore = ratingM ? Math.round(parseFloat(ratingM[1]) * 10) / 10 : null
            const weightM = chunk.match(/<averageweight[^>]*value="([\d.]+)"/)
            const complexity = weightM ? Math.round(parseFloat(weightM[1]) * 10) / 10 : null
            const minpM = chunk.match(/<minplayers[^>]*value="(\d+)"/)
            const maxpM = chunk.match(/<maxplayers[^>]*value="(\d+)"/)
            const timeM = chunk.match(/<playingtime[^>]*value="(\d+)"/)
            const rankM = chunk.match(/<rank[^>]*name="boardgame"[^>]*value="([\d]+)"/)

            enriched[idM[1]] = {
              objectid: idM[1],
              mechanics,
              designers: designers.slice(0, 5),
              categories,
              bggScore,
              complexity,
              min_players: minpM ? parseInt(minpM[1]) : null,
              max_players: maxpM ? parseInt(maxpM[1]) : null,
              playing_time: timeM ? parseInt(timeM[1]) : null,
              bgg_rank: rankM ? parseInt(rankM[1]) : null,
            }
          }
        }
      } catch { /* ignora errori batch singolo */ }
      // Rispetta rate limit BGG: 5 secondi tra batch (policy ufficiale)
      if (i + 20 < allIds.length) {
        await new Promise(r => setTimeout(r, 5000))
      }
    }

    // Unisci enriched negli items
    const enrichedItems = items.map(it => ({
      ...it,
      ...(enriched[it.objectid] || {}),
      // Merge categorie: usa quelle da /thing se disponibili (più complete)
      categories: enriched[it.objectid]?.categories?.length
        ? enriched[it.objectid].categories
        : it.categories,
    }))

    return NextResponse.json({ items: enrichedItems, total, enriched: Object.values(enriched) })
  } catch (err) {
    logger.error('BGG Collection', 'Import failed', err)
    return NextResponse.json({ error: apiMessage(req, 'networkError') }, { status: 500 })
  }
}
