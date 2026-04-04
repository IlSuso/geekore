import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const callbackUrl = `${siteUrl}/api/steam/callback`;

  const steamAuthUrl = `https://steamcommunity.com/openid/login?` +
    `openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select&` +
    `openid.identity=http://specs.openid.net/auth/2.0/identifier_select&` +
    `openid.mode=checkid_setup&` +
    `openid.ns=http://specs.openid.net/auth/2.0&` +
    `openid.return_to=${encodeURIComponent(callbackUrl)}&` +
    `openid.realm=${encodeURIComponent(siteUrl)}`;

  return NextResponse.redirect(steamAuthUrl);
}