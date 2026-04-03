import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const steamId = searchParams.get('steamId');
  const apiKey = process.env.STEAM_API_KEY;

  if (!steamId || !apiKey) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

  try {
    // 1. Prendi i giochi
    const gamesRes = await fetch(
      `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=true`
    );
    const gamesData = await gamesRes.json();
    const allGames = gamesData.response.games || [];

    // 2. Ordina per tempo di gioco e prendi i primi 3 per i trofei (per non rallentare troppo)
    const topGames = allGames
      .sort((a: any, b: any) => b.playtime_forever - a.playtime_forever)
      .slice(0, 3);

    const gamesWithAchievements = await Promise.all(topGames.map(async (game: any) => {
      const achRes = await fetch(
        `http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${game.appid}&key=${apiKey}&steamid=${steamId}`
      );
      const achData = await achRes.json();
      
      if (achData.playerstats?.success) {
        const achieved = achData.playerstats.achievements.filter((a: any) => a.achieved === 1).length;
        const total = achData.playerstats.achievements.length;
        return { ...game, achieved, total, percent: Math.round((achieved / total) * 100) };
      }
      return { ...game, achieved: 0, total: 0, percent: 0 };
    }));

    return NextResponse.json({ games: gamesWithAchievements });
  } catch (error) {
    return NextResponse.json({ error: 'Steam API Error' }, { status: 500 });
  }
}