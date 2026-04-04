import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const url = new URL(request.url);
  const claimedId = url.searchParams.get('openid.claimed_id');

  if (!claimedId) {
    return NextResponse.redirect(new URL('/profile?error=steam_invalid', request.url));
  }

  const steamId64 = claimedId.replace('https://steamcommunity.com/openid/id/', '');
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Ottieni info Steam
    const steamApiKey = process.env.STEAM_API_KEY;
    let steamUsername = 'Steam User';
    let steamAvatar = '';

    if (steamApiKey) {
      const playerRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&steamids=${steamId64}`
      );
      const playerData = await playerRes.json();
      const player = playerData?.response?.players?.[0];
      
      if (player) {
        steamUsername = player.personaname || steamUsername;
        steamAvatar = player.avatarfull || player.avatarmedium || '';
      }
    }

    // Salva nel database
    const { error } = await supabase
      .from('steam_accounts')
      .upsert({
        user_id: user.id,
        steam_id64: steamId64,
        steam_username: steamUsername,
        steam_avatar: steamAvatar,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Errore DB Steam:', error);
      return NextResponse.redirect(new URL('/profile?error=db_error', request.url));
    }

    return NextResponse.redirect(new URL('/profile?steam_success=true', request.url));

  } catch (err) {
    console.error('Errore callback Steam:', err);
    return NextResponse.redirect(new URL('/profile?error=server_error', request.url));
  }
}