// src/app/api/admin/repair-covers/users/route.ts
// Restituisce tutti i user_id distinti che hanno almeno un record con cover_image

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const adminDb = createAdminClient()
  const { data, error } = await adminDb
    .from('user_media_entries')
    .select('user_id')
    .not('cover_image', 'is', null)
    .in('type', ['movie', 'tv', 'anime', 'manga'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((data || []).map((r: any) => r.user_id))]
  return NextResponse.json({ user_ids: userIds, count: userIds.length })
}