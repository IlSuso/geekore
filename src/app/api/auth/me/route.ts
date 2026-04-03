import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Errore in /api/auth/me:", error);
    return NextResponse.json({ user: null }, { status: 500 });
  }
}