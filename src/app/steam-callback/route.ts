import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  console.log("=== STEAM CALLBACK RICEVUTO ===");
  const url = request.url;
  console.log("URL completo:", url);

  const claimedId = request.nextUrl.searchParams.get('openid.claimed_id');
  const userId = request.nextUrl.searchParams.get('user_id');

  console.log("Claimed ID:", claimedId);
  console.log("User ID dal parametro:", userId);

  if (!claimedId || !userId) {
    return NextResponse.redirect(new URL('/profile?steam_error=missing_params', request.url));
  }

  // Estrai SteamID64
  const steamId64 = claimedId.replace('https://steamcommunity.com/openid/id/', '');

  try {
    const supabase = createClient();

    const { error } = await supabase
      .from('steam_accounts')
      .upsert(
        {
          user_id: userId,
          steam_id64: steamId64,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error("Errore salvataggio Steam:", error);
      return NextResponse.redirect(new URL('/profile?steam_error=db_error', request.url));
    }

    console.log("✅ SteamID64 salvato correttamente per utente:", userId);

    return NextResponse.redirect(
      new URL(`/profile?steam_success=true&steamid=${steamId64}`, request.url)
    );

  } catch (err) {
    console.error("Errore generale nel callback Steam:", err);
    return NextResponse.redirect(new URL('/profile?steam_error=server_error', request.url));
  }
}