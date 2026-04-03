import { NextRequest, NextResponse } from 'next/server';

const STEAM_API_KEY = process.env.STEAM_API_KEY;

export async function GET(request: NextRequest) {
  const steamid = request.nextUrl.searchParams.get('steamid');

  if (!steamid) {
    return NextResponse.json({ success: false, error: 'SteamID mancante' }, { status: 400 });
  }

  if (!STEAM_API_KEY) {
    console.error("STEAM_API_KEY non trovata in .env.local");
    return NextResponse.json({ 
      success: false, 
      error: 'Chiave API Steam non configurata. Aggiungila in .env.local' 
    }, { status: 500 });
  }

  try {
    console.log(`Chiamata Steam API per GetOwnedGames - steamid: ${steamid}`);

    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamid}&format=json&include_appinfo=true`;

    const res = await fetch(url, { 
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Steam API error:", res.status, text);
      return NextResponse.json({ success: false, error: `Steam API error ${res.status}` }, { status: 502 });
    }

    const data = await res.json();

    if (!data.response || !data.response.games) {
      return NextResponse.json({ 
        success: true, 
        games: [], 
        message: 'Nessun gioco trovato' 
      });
    }

    const games = data.response.games.map((game: any) => ({
      appid: game.appid,
      name: game.name || 'Gioco sconosciuto',
      playtime_forever: game.playtime_forever ? Math.floor(game.playtime_forever / 60) : 0, // ore totali
      playtime_2weeks: game.playtime_2weeks ? Math.floor(game.playtime_2weeks / 60) : 0,
      img_icon_url: game.img_icon_url 
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
        : null,
    }));

    console.log(`✅ Importati ${games.length} giochi da Steam`);

    return NextResponse.json({
      success: true,
      games,
      count: games.length
    });

  } catch (error) {
    console.error("Errore chiamata Steam API:", error);
    return NextResponse.json({ 
      success: false, 
      error: 'Errore di connessione con Steam' 
    }, { status: 500 });
  }
}