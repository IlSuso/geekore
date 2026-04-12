import { logger } from '@/lib/logger'
// src/app/api/steam/route.ts
// ── Aggiornamenti ────────────────────────────────────────────────────────────
//   • S3: Validazione Steam ID64 — deve essere un numero di esattamente 17
//     cifre che inizia con 7656119 (range SteamID64 valido).
//     Previene injection e chiamate inutili all'API Steam.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";

// S3: Steam ID64 — 17 cifre, prefisso universo Steam (765611900000000 base)
const STEAM_ID64_REGEX = /^7656119\d{10}$/

export async function GET(request: Request) {
  // Rate limit: 10 req/min per IP su questo endpoint leggero
  const rl = rateLimit(request, { limit: 10, windowMs: 60_000, prefix: 'steam-get' })
  if (!rl.ok) {
    return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  }

  const { searchParams } = new URL(request.url);
  const steamId = searchParams.get("steamId");
  const username = searchParams.get("username");
  const avatar = searchParams.get("avatar");

  if (!steamId) {
    return NextResponse.json({ error: "SteamID mancante" }, { status: 400 });
  }

  // S3: Valida formato Steam ID64
  if (!STEAM_ID64_REGEX.test(steamId)) {
    return NextResponse.json(
      { error: "Steam ID non valido. Deve essere un numero di 17 cifre." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verifica autenticazione
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "STEAM_API_KEY non configurata" }, { status: 500 });
    }

    // Usa encodeURIComponent per sicurezza anche dopo la validazione regex
    const response = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&format=json`
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Errore API Steam" }, { status: 502 });
    }

    const data = await response.json();
    const games = data.response.games || [];

    return NextResponse.json({
      games: games.slice(0, 10),
    });

  } catch (error) {
    // Non loggare il steamId in produzione (dati personali)
    logger.error('API Steam Error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}