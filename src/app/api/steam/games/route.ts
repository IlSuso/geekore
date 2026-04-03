import { NextRequest, NextResponse } from 'next/server';

const STEAM_API_KEY = process.env.STEAM_API_KEY;

// Controlla se un'immagine Steam esiste davvero (alcuni giochi non hanno library_600x900)
async function imageExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

// Recupera l'immagine migliore disponibile per un gioco dalla Steam Store API
async function getBestImage(appid: number): Promise<string> {
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;

  // 1. Prova library_600x900 (portrait, la migliore per card)
  const portrait = `${base}/library_600x900.jpg`;
  if (await imageExists(portrait)) return portrait;

  // 2. Prova library_600x900_2x
  const portrait2x = `${base}/library_600x900_2x.jpg`;
  if (await imageExists(portrait2x)) return portrait2x;

  // 3. Fallback: recupera capsule_231x87 o header dalla Store API
  try {
    const storeRes = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`
    );
    const storeData = await storeRes.json();
    const appData = storeData?.[String(appid)]?.data;

    if (appData?.header_image) return appData.header_image;
  } catch {
    // ignora errori della Store API
  }

  // 4. Ultimo fallback: header.jpg diretto
  return `${base}/header.jpg`;
}

export async function GET(request: NextRequest) {
  const steamid = request.nextUrl.searchParams.get('steamid');

  if (!steamid) {
    return NextResponse.json({ success: false, error: 'Missing steamid' }, { status: 400 });
  }

  if (!STEAM_API_KEY) {
    return NextResponse.json({ success: false, error: 'STEAM_API_KEY not configured' }, { status: 500 });
  }

  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamid}&format=json&include_appinfo=true&include_played_free_games=true`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.response?.games) {
      return NextResponse.json({ success: false, error: 'No games found' });
    }

    // Risolve le immagini in parallelo (max 10 alla volta per non saturare Steam)
    const rawGames = data.response.games;

    const chunkSize = 10;
    const gamesWithImages: any[] = [];

    for (let i = 0; i < rawGames.length; i += chunkSize) {
      const chunk = rawGames.slice(i, i + chunkSize);
      const resolved = await Promise.all(
        chunk.map(async (game: any) => ({
          appid: game.appid,
          name: game.name,
          // Restituisce i minuti raw — la divisione per 60 avviene nel frontend
          playtime_forever: game.playtime_forever,
          cover_image: await getBestImage(game.appid),
        }))
      );
      gamesWithImages.push(...resolved);
    }

    return NextResponse.json({
      success: true,
      games: gamesWithImages,
      count: gamesWithImages.length,
    });
  } catch (error) {
    console.error('Steam API error:', error);
    return NextResponse.json({ success: false, error: 'Steam API error' }, { status: 502 });
  }
}