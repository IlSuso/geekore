// app/api/igdb/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { search } = await request.json();

    // Ottieni token Twitch/IGDB
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_IGDB_CLIENT_ID || '',
        client_secret: process.env.NEXT_PUBLIC_IGDB_CLIENT_SECRET || '',
        grant_type: 'client_credentials',
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get IGDB token' }, { status: 500 });
    }

    // Chiamata IGDB
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.NEXT_PUBLIC_IGDB_CLIENT_ID || '',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: `
        search "${search}";
        fields name, cover.url, first_release_date, summary, rating;
        limit 20;
      `,
    });

    const games = await igdbRes.json();

    // Trasforma i risultati
    const formattedGames = games.map((g: any) => ({
      id: g.id.toString(),
      title: g.name,
      type: 'game',
      coverImage: g.cover?.url 
        ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}` 
        : undefined,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined,
      episodes: 1,
      source: 'igdb',
    }));

    return NextResponse.json(formattedGames);
  } catch (error) {
    console.error('IGDB proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}