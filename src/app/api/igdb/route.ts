import { NextRequest, NextResponse } from 'next/server'

// In-memory token cache — IGDB tokens are valid for ~60 days
let cachedToken: { value: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < cachedToken.expiresAt) {
    return cachedToken.value
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to obtain IGDB token')

  // Cache for expires_in minus 5 minutes buffer
  const ttlMs = ((data.expires_in ?? 5_184_000) - 300) * 1000
  cachedToken = { value: data.access_token, expiresAt: now + ttlMs }
  return cachedToken.value
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { search } = body

    if (!search || typeof search !== 'string') {
      return NextResponse.json({ error: 'Parametro search mancante' }, { status: 400 })
    }
    const trimmed = search.trim()
    if (trimmed.length < 2) {
      return NextResponse.json({ error: 'Ricerca troppo corta (minimo 2 caratteri)' }, { status: 400 })
    }
    if (trimmed.length > 200) {
      return NextResponse.json({ error: 'Ricerca troppo lunga (massimo 200 caratteri)' }, { status: 400 })
    }

    const clientId = process.env.IGDB_CLIENT_ID
    const clientSecret = process.env.IGDB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Configurazione IGDB mancante' }, { status: 500 })
    }

    const accessToken = await getIgdbToken(clientId, clientSecret)

    // Escape quotes in the search term to prevent query injection
    const safeSearch = trimmed.replace(/"/g, '\\"')

    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: `search "${safeSearch}"; fields name,cover.url,first_release_date,rating; limit 20;`,
    })

    if (!igdbRes.ok) {
      // Token might have been revoked — clear cache and return error
      cachedToken = null
      return NextResponse.json({ error: 'Errore risposta IGDB' }, { status: 502 })
    }

    const games = await igdbRes.json()
    if (!Array.isArray(games)) {
      return NextResponse.json({ error: 'Risposta IGDB non valida' }, { status: 502 })
    }

    const formattedGames = games.map((g: any) => ({
      id: String(g.id),
      title: g.name,
      type: 'game',
      coverImage: g.cover?.url
        ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}`
        : undefined,
      year: g.first_release_date
        ? new Date(g.first_release_date * 1000).getFullYear()
        : undefined,
      episodes: 1,
      source: 'igdb',
    }))

    return NextResponse.json(formattedGames)
  } catch (error) {
    console.error('IGDB proxy error:', error)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}
