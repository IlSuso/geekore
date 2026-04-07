import { NextRequest, NextResponse } from 'next/server'

// Module-level token cache — persists across requests in the same server instance
let cachedToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, clientSecret: string): Promise<string | null> {
  const now = Date.now()
  // Reuse cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token
  }

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { search } = body

    // ── Validazione input ────────────────────────────────────────────────────
    if (!search || typeof search !== 'string') {
      return NextResponse.json({ error: 'Parametro search mancante' }, { status: 400 })
    }
    if (search.trim().length < 2) {
      return NextResponse.json({ error: 'Ricerca troppo corta (minimo 2 caratteri)' }, { status: 400 })
    }
    if (search.length > 200) {
      return NextResponse.json({ error: 'Ricerca troppo lunga (massimo 200 caratteri)' }, { status: 400 })
    }

    const cleanSearch = search.trim()

    // ── Variabili solo server-side (senza NEXT_PUBLIC_) ──────────────────────
    const clientId = process.env.IGDB_CLIENT_ID
    const clientSecret = process.env.IGDB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Configurazione IGDB mancante' }, { status: 500 })
    }

    // ── Token Twitch/IGDB (cached) ───────────────────────────────────────────
    const accessToken = await getIgdbToken(clientId, clientSecret)
    if (!accessToken) {
      return NextResponse.json({ error: 'Impossibile ottenere token IGDB' }, { status: 500 })
    }

    // ── Chiamata IGDB ────────────────────────────────────────────────────────
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: `
        search "${cleanSearch}";
        fields name, cover.url, first_release_date, summary, genres.name;
        limit 20;
      `,
    })

    if (!igdbRes.ok) {
      return NextResponse.json({ error: 'Errore risposta IGDB' }, { status: 502 })
    }

    const games = await igdbRes.json()

    if (!Array.isArray(games)) {
      return NextResponse.json({ error: 'Risposta IGDB non valida' }, { status: 502 })
    }

    const formattedGames = games.map((g: any) => ({
      id: g.id.toString(),
      title: g.name,
      type: 'game',
      coverImage: g.cover?.url
        ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}`
        : undefined,
      year: g.first_release_date
        ? new Date(g.first_release_date * 1000).getFullYear()
        : undefined,
      episodes: 1,
      description: g.summary ? g.summary.slice(0, 400) : undefined,
      genres: g.genres?.map((gen: any) => gen.name) as string[] | undefined,
      source: 'igdb',
    }))

    return NextResponse.json(formattedGames)

  } catch (error) {
    console.error('IGDB proxy error:', error)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}