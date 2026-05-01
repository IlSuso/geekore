import { logger } from '@/lib/logger'
// src/app/api/steam/route.ts
// ── Aggiornamenti ────────────────────────────────────────────────────────────
//   • S3: Validazione Steam ID64 — deve essere un numero di esattamente 17
//     cifre che inizia con 7656119 (range SteamID64 valido).
//     Previene injection e chiamate inutili all'API Steam.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAsync } from "@/lib/rateLimit";

const STEAM_ID64_REGEX = /^7656119\d{10}$/

export async function GET(request: Request) {
  const rl = await rateLimitAsync(request, { limit: 10, windowMs: 60_000, prefix: 'steam-get' })
  if (!rl.ok) {
    return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  }

  const { searchParams } = new URL(request.url);
  const steamId = searchParams.get("steamId");

  if (!steamId) {
    return NextResponse.json({ error: "SteamID mancante" }, { status: 400, headers: rl.headers });
  }

  if (!STEAM_ID64_REGEX.test(steamId)) {
    return NextResponse.json(
      { error: "Steam ID non valido. Deve essere un numero di 17 cifre." },
      { status: 400, headers: rl.headers }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401, headers: rl.headers });
  }

  try {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "STEAM_API_KEY non configurata" }, { status: 500, headers: rl.headers });
    }

    const response = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&format=json`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Errore API Steam" }, { status: 502, headers: rl.headers });
    }

    const data = await response.json();
    const games = data.response.games || [];

    return NextResponse.json({ games: games.slice(0, 10) }, { headers: rl.headers });
  } catch (error: any) {
    logger.error('API Steam Error:', error?.name === 'TimeoutError' ? 'timeout' : error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: "Errore interno" }, { status: error?.name === 'TimeoutError' ? 504 : 500, headers: rl.headers });
  }
}