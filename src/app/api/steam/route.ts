import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const steamId = searchParams.get('steamId');
  const apiKey = process.env.STEAM_API_KEY;

  if (!steamId || !apiKey) return NextResponse.json({ error: 'Missing config' }, { status: 400 });

  try {
    const gamesRes = await fetch(
      `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=true`
    );
    const gamesData = await gamesRes.json();
    const allGames = gamesData.response.games || [];

    // Prendiamo i primi 5 per performance
    const topGames = allGames
      .sort((a: any, b: any) => b.playtime_forever - a.playtime_forever)
      .slice(0, 5);

    const gamesWithData = await Promise.all(topGames.map(async (game: any) => {
      try {
        const achRes = await fetch(
          `http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${game.appid}&key=${apiKey}&steamid=${steamId}`
        );
        const achData = await achRes.json();
        
        if (achData.playerstats?.success && achData.playerstats.achievements) {
          const achieved = achData.playerstats.achievements.filter((a: any) => a.achieved === 1).length;
          const total = achData.playerstats.achievements.length;
          return { ...game, achieved, total, percent: Math.round((achieved / total) * 100) };
        }
      } catch (e) { /* ignore game if private */ }
      return { ...game, achieved: 0, total: 0, percent: 0 };
    }));

    return NextResponse.json({ games: gamesWithData });
  } catch (error) {
    return NextResponse.json({ error: 'Steam API Fail' }, { status: 500 });
  }
}