import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();

  const url = new URL(request.url);
  const claimedId = url.searchParams.get('openid.claimed_id');

  console.log('=== STEAM CALLBACK RICEVUTO ===');
  console.log('Claimed ID:', claimedId);

  if (!claimedId) {
    return NextResponse.redirect(new URL('/profile?steam_error=missing_params', request.url));
  }

  const steamId64 = claimedId.replace('https://steamcommunity.com/openid/id/', '');

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.log('❌ Utente non autenticato nella callback');
    return NextResponse.redirect(new URL('/login', request.url));
  }

  console.log('✅ Utente autenticato nella callback →', user.id);

  try {
    const { error } = await supabase
      .from('steam_accounts')
      .upsert({
        user_id: user.id,
        steam_id64: steamId64,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Errore DB Steam:', error);
      return NextResponse.redirect(new URL('/profile?steam_error=db_error', request.url));
    }

    console.log('✅ Steam collegato con successo');

    return NextResponse.redirect(new URL('/profile?steam_success=true', request.url));

  } catch (err) {
    console.error('Errore callback Steam:', err);
    return NextResponse.redirect(new URL('/profile?steam_error=server_error', request.url));
  }
}