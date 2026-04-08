import { NextRequest, NextResponse } from 'next/server'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, clientSecret: string): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token
  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  })
  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token
  if (!accessToken) return null
  cachedToken = { token: accessToken, expiresAt: now + (tokenData.expires_in || 3600) * 1000 }
  return accessToken
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { search } = body

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
    const clientId = process.env.IGDB_CLIENT_ID
    const clientSecret = process.env.IGDB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Configurazione IGDB mancante' }, { status: 500 })
    }

    const accessToken = await getIgdbToken(clientId, clientSecret)
    if (!accessToken) {
      return NextResponse.json({ error: 'Impossibile ottenere token IGDB' }, { status: 500 })
    }

    // Richiediamo tutti i metadati profondi disponibili
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: `
        search "${cleanSearch}";
        fields name, cover.url, first_release_date, summary,
               genres.name, themes.name, keywords.name,
               player_perspectives.name,
               game_modes.name,
               involved_companies.company.name, involved_companies.developer,
               rating, rating_count;
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
      // Metadati profondi — salvati nel DB, non mostrati all'utente
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

    return NextResponse.json(formattedGames)

  } catch (error) {
    console.error('IGDB proxy error:', error)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}