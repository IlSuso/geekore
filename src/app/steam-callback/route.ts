import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log("=== STEAM CALLBACK RICEVUTO ===");
  console.log("URL completo:", request.url);

  const claimedId = request.nextUrl.searchParams.get('openid.claimed_id');
  const userId = request.nextUrl.searchParams.get('user_id');

  console.log("Claimed ID:", claimedId);
  console.log("User ID:", userId);

  if (!claimedId || !userId) {
    console.log("ERRORE: Parametri mancanti");
    return NextResponse.redirect(new URL('/profile?steam_error=missing_params', request.url));
  }

  const steamId64 = claimedId.split('/').pop();

  console.log("SteamID64:", steamId64);

  // Per ora solo redirect con successo (senza salvataggio, per test)
  console.log("SUCCESSO: SteamID64 ricevuto:", steamId64, "per utente", userId);

  return NextResponse.redirect(new URL('/profile?steam_success=true&steamid=' + steamId64, request.url));
}