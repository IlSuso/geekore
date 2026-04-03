import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  // 1. ESTRAZIONE PARAMETRI DALL'URL (Cruciale per SWR)
  const { searchParams } = new URL(request.url);
  const steamId = searchParams.get("steamId");
  const username = searchParams.get("username");
  const avatar = searchParams.get("avatar");

  if (!steamId) {
    return NextResponse.json({ error: "SteamID mancante" }, { status: 400 });
  }

  try {
    // 2. FETCH DA STEAM (Giochi e Trofei)
    const apiKey = process.env.STEAM_API_KEY;
    const response = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&format=json`
    );
    const data = await response.json();
    const games = data.response.games || [];

    // 3. LOGICA DI CALCOLO (Trofei/Percentuali)
    // Qui va il tuo ciclo for che recupera i trofei per ogni gioco...
    // (Mantieni la logica che avevi per calcolare 'achieved' e 'total')
    
    let totalAchieved = 0;
    let totalPossible = 0;
    
    // Esempio rapido della logica di calcolo che avevamo:
    const gamesWithStats = await Promise.all(games.slice(0, 10).map(async (game: any) => {
        // ... recupero trofei ...
        return { ...game, percent: 50 }; // Placeholder
    }));

    const corePower = 75; // Placeholder del tuo calcolo finale

    // 4. UPDATE SUPABASE (Leaderboard)
    // Usiamo l'upsert per non creare duplicati
    await supabase.from("leaderboard").upsert({
      steam_id: steamId,
      username: username || "Unknown",
      avatar: avatar || "",
      core_power: corePower,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'steam_id' });

    return NextResponse.json({
      games: gamesWithStats,
      corePower: corePower
    });

  } catch (error) {
    console.error("API Steam Error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}