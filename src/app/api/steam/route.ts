import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // 1. ESTRAZIONE PARAMETRI DALL'URL (Cruciale per SWR)
  const { searchParams } = new URL(request.url);
  const steamId = searchParams.get("steamId");
  const username = searchParams.get("username");
  const avatar = searchParams.get("avatar");

  if (!steamId) {
    return NextResponse.json({ error: "SteamID mancante" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // 2. FETCH DA STEAM (Giochi e Trofei)
    const apiKey = process.env.STEAM_API_KEY;
    const response = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&format=json`
    );
    const data = await response.json();
    const games = data.response.games || [];

    // TODO: implementare calcolo corePower reale basato su trofei/completamento
    // Per ora l'endpoint restituisce solo i giochi senza aggiornare la leaderboard
    return NextResponse.json({
      games: games.slice(0, 10),
    });

  } catch (error) {
    console.error("API Steam Error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}