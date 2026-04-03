import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const steamId = searchParams.get("steamId");

  if (!steamId) {
    return NextResponse.json({ error: "Missing SteamID" }, { status: 400 });
  }

  try {
    // 1. Recupero Giochi Posseduti
    const gamesRes = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&format=json`
    );
    const gamesData = await gamesRes.json();
    const ownedGames = gamesData.response.games || [];

    // 2. Prendiamo i top 12 giochi più giocati
    const topGames = ownedGames
      .sort((a: any, b: any) => b.playtime_forever - a.playtime_forever)
      .slice(0, 12);

    // 3. Recupero simultaneo dei trofei
    const gamesWithStats = await Promise.all(
      topGames.map(async (game: any) => {
        try {
          const statsRes = await fetch(
            `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&appid=${game.appid}`
          );
          const statsData = await statsRes.json();
          
          if (statsData.playerstats?.success) {
            const achievements = statsData.playerstats.achievements || [];
            const total = achievements.length;
            const achieved = achievements.filter((a: any) => a.achieved === 1).length;
            const percent = total > 0 ? Math.round((achieved / total) * 100) : 0;
            
            return { 
              ...game, 
              total, 
              achieved, 
              percent,
              status: percent === 100 ? "COMPLETED" : "IN_PROGRESS"
            };
          }
          return { ...game, total: 0, achieved: 0, percent: 0, status: "NO_DATA" };
        } catch {
          return { ...game, total: 0, achieved: 0, percent: 0, status: "ERROR" };
        }
      })
    );

    // Calcolo Core Power (Media completamento)
    const validGames = gamesWithStats.filter(g => g.total > 0);
    const corePower = validGames.length > 0 
      ? Math.round(validGames.reduce((acc, g) => acc + g.percent, 0) / validGames.length)
      : 0;

    return NextResponse.json({ 
      games: gamesWithStats,
      corePower: corePower
    });
  } catch (error) {
    return NextResponse.json({ error: "Steam API Failure" }, { status: 500 });
  }
}