import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { search } = await request.json();

  const clientId = process.env.NEXT_PUBLIC_IGDB_CLIENT_ID;
  const clientSecret = process.env.NEXT_PUBLIC_IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'IGDB keys not configured' }, { status: 500 });
  }

  try {
    // Ottieni token
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    });

    const tokenData = await tokenRes.json();

    // Cerca giochi
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'text/plain',
      },
      body: `search "${search}"; fields name, cover.url, first_release_date; limit 15;`,
    });

    const games = await igdbRes.json();

    return NextResponse.json(games);
  } catch (error) {
    console.error('IGDB error:', error);
    return NextResponse.json({ error: 'Failed to fetch from IGDB' }, { status: 500 });
  }
}