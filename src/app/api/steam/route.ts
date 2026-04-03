import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

// Inizializzazione interna per evitare file mancanti
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const formatGameName = (name: string) => {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const steamId = searchParams.get("steamId");
  const username = searchParams.get("username");
  const avatar = searchParams.get("avatar");

  if (!steamId) return NextResponse.json({ error: "Missing SteamID" }, { status: 400 });

  try {
    const gamesRes = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&format=json`
    );
    const gamesData = await gamesRes.json();
    const ownedGames = gamesData.response.games || [];

    const topGames = ownedGames
      .sort((a: any, b: any) => b.playtime_forever - a.playtime_forever)
      .slice(0, 12);

    const gamesWithStats = await Promise.all(
      topGames.map(async (game: any) => {
        try {
          const statsRes = await fetch(
            `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&appid=${game.appid}`
          );
          const statsData = await statsRes.json();
          let total = 0, achieved = 0, percent = 0;

          if (statsData.playerstats?.success) {
            const achievements = statsData.playerstats.achievements || [];
            total = achievements.length;
            achieved = achievements.filter((a: any) => a.achieved === 1).length;
            percent = total > 0 ? Math.round((achieved / total) * 100) : 0;
          }
          return { ...game, name: formatGameName(game.name), total, achieved, percent };
        } catch {
          return { ...game, name: formatGameName(game.name), total: 0, achieved: 0, percent: 0 };
        }
      })
    );

    const validGames = gamesWithStats.filter(g => g.total > 0);
    const corePower = validGames.length > 0 
      ? Math.round(validGames.reduce((acc, g) => acc + g.percent, 0) / validGames.length)
      : 0;

    // SCRITTURA SU SUPABASE
    if (username && avatar) {
      await supabase.from('leaderboard').upsert({
        steam_id: steamId,
        username: username,
        avatar_url: avatar,
        completion_rate: corePower,
        updated_at: new Date().toISOString()
      }, { onConflict: 'steam_id' });
    }

    return NextResponse.json({ games: gamesWithStats, corePower });
  } catch (error) {
    return NextResponse.json({ error: "Steam API Failure" }, { status: 500 });
  }
}