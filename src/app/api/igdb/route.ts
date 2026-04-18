// src/app/api/igdb/route.ts
// SEC1: Aggiunto AbortSignal.timeout(8000) su tutte le fetch esterne
// C2:  logger invece di console.error

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { freeTranslateBatch } from '@/lib/deepl'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, clientSecret: string): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token

  // SEC1: timeout sul fetch del token OAuth Twitch
  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(8000),
  })
  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token
  if (!accessToken) return null
  cachedToken = {
    token: accessToken,
    expiresAt: now + (tokenData.expires_in || 3600) * 1000,
  }
  return accessToken
}

// Caratteri consentiti nella ricerca (previene injection IGDB)
const SAFE_SEARCH_RE = /^[\p{L}\p{N}\s\-_:.,'!?&()]+$/u

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'igdb' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Troppe richieste. Riprova tra qualche secondo.' },
      { status: 429, headers: rl.headers }
    )
  }

  try {
    const body = await request.json()
    const { search } = body

    if (!search || typeof search !== 'string') {
      return NextResponse.json({ error: 'Parametro search mancante' }, { status: 400, headers: rl.headers })
    }

    const trimmed = search.trim()

    if (trimmed.length < 2) {
      return NextResponse.json({ error: 'Ricerca troppo corta (minimo 2 caratteri)' }, { status: 400, headers: rl.headers })
    }
    if (trimmed.length > 100) {
      return NextResponse.json({ error: 'Ricerca troppo lunga (massimo 100 caratteri)' }, { status: 400, headers: rl.headers })
    }
    if (!SAFE_SEARCH_RE.test(trimmed)) {
      return NextResponse.json({ error: 'Caratteri non consentiti nella ricerca' }, { status: 400, headers: rl.headers })
    }

    const cleanSearch = trimmed
    const clientId = process.env.IGDB_CLIENT_ID
    const clientSecret = process.env.IGDB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Configurazione IGDB mancante' }, { status: 500, headers: rl.headers })
    }

    const accessToken = await getIgdbToken(clientId, clientSecret)
    if (!accessToken) {
      return NextResponse.json({ error: 'Impossibile ottenere token IGDB' }, { status: 500, headers: rl.headers })
    }

    const safeSearch = cleanSearch.replace(/"/g, '\\"')

    // SEC1: timeout sulla ricerca IGDB
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: `
        search "${safeSearch}";
        fields name, cover.url, first_release_date, summary,
               genres.name, themes.name, keywords.name,
               player_perspectives.name,
               game_modes.name,
               involved_companies.company.name, involved_companies.developer,
               rating, rating_count;
        limit 20;
      `,
      signal: AbortSignal.timeout(8000),
    })

    if (!igdbRes.ok) {
      return NextResponse.json({ error: 'Errore risposta IGDB' }, { status: 502, headers: rl.headers })
    }

    const games = await igdbRes.json()
    if (!Array.isArray(games)) {
      return NextResponse.json({ error: 'Risposta IGDB non valida' }, { status: 502, headers: rl.headers })
    }

    const formattedGames = games.map((g: any) => ({
      id: g.id.toString(),
      title: g.name,
      type: 'game',
      coverImage: g.cover?.url ? `https:${g.cover.url.replace('t_thumb', 't_1080p')}` : undefined,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined,
      episodes: 1,
      description: g.summary ? g.summary.slice(0, 400) : undefined,
      genres: g.genres?.map((gen: any) => gen.name) as string[] | undefined,
      themes: g.themes?.map((t: any) => t.name) as string[] | undefined,
      keywords: g.keywords?.map((k: any) => k.name) as string[] | undefined,
      player_perspectives: g.player_perspectives?.map((p: any) => p.name) as string[] | undefined,
      game_modes: g.game_modes?.map((m: any) => m.name) as string[] | undefined,
      developers: g.involved_companies
        ?.filter((c: any) => c.developer)
        .map((c: any) => c.company?.name)
        .filter(Boolean) as string[] | undefined,
      source: 'igdb',
    }))

    const cacheItems = formattedGames
      .filter(g => g.description)
      .map(g => ({ id: `igdb:${g.id}`, text: g.description! }))
    const translations = await translateWithCache(cacheItems)
    formattedGames.forEach(g => {
      if (g.description) g.description = translations[`igdb:${g.id}`] || g.description
    })

    return NextResponse.json(formattedGames, { headers: rl.headers })
  } catch (error: any) {
    if (error?.name === 'TimeoutError') {
      logger.error('igdb', 'Timeout richiesta IGDB')
      return NextResponse.json({ error: 'Timeout API IGDB' }, { status: 504 })
    }
    logger.error('igdb', error)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || searchParams.get('search') || ''
  const lang = searchParams.get('lang') || 'it'
  if (!q || q.trim().length < 2) return NextResponse.json([])

  const syntheticRequest = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...Object.fromEntries(request.headers) },
    body: JSON.stringify({ search: q.trim() }),
  })
  const postResponse = await POST(syntheticRequest as NextRequest)
  if (!postResponse.ok || lang !== 'it') return postResponse

  const games: any[] = await postResponse.json()
  if (!Array.isArray(games) || games.length === 0) return NextResponse.json(games)

  const toTranslate = games.filter((g: any) => g.description)
  if (toTranslate.length > 0) {
    const texts = toTranslate.map((g: any) => g.description)
    const translated = await freeTranslateBatch(texts, 'IT')
    toTranslate.forEach((g: any, i: number) => {
      if (translated[i] && translated[i] !== g.description) g.description = translated[i]
    })
  }
  return NextResponse.json(games)
}