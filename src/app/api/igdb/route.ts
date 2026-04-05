// DESTINAZIONE: src/app/api/igdb/route.ts

import { NextRequest, NextResponse } from 'next/server'

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

    // ── Token Twitch/IGDB ────────────────────────────────────────────────────
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
        fields name, cover.url, first_release_date, summary, rating;
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
      source: 'igdb',
    }))

    return NextResponse.json(formattedGames)

  } catch (error) {
    console.error('IGDB proxy error:', error)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}