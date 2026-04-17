import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const token = process.env.BGG_BEARER_TOKEN
  const bggHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

  const results: Record<string, any> = {
    token_present: !!token,
    token_length: token?.length ?? 0,
  }

  // Test 1: hot list
  try {
    const hotRes = await fetch('https://www.boardgamegeek.com/xmlapi2/hot?type=boardgame', {
      headers: bggHeaders, signal: AbortSignal.timeout(8000),
    })
    const hotText = await hotRes.text()
    const hotIds = [...hotText.matchAll(/<item[^>]*id="(\d+)"/g)].map(m => m[1])
    results.hot = {
      status: hotRes.status,
      ok: hotRes.ok,
      ids_found: hotIds.length,
      first_ids: hotIds.slice(0, 5),
      body_preview: hotText.slice(0, 300),
    }
  } catch (e: any) {
    results.hot = { error: e?.message ?? String(e) }
  }

  // Test 2: known game (Gloomhaven = 174430)
  try {
    const thingRes = await fetch('https://www.boardgamegeek.com/xmlapi2/thing?id=174430&stats=1', {
      headers: bggHeaders, signal: AbortSignal.timeout(10000),
    })
    const thingText = await thingRes.text()
    const nameMatch = thingText.match(/<name[^>]+type="primary"[^>]+value="([^"]+)"/)
    const ratingMatch = thingText.match(/<average[^>]+value="([0-9.]+)"/)
    results.thing_174430 = {
      status: thingRes.status,
      ok: thingRes.ok,
      name: nameMatch?.[1] ?? null,
      rating: ratingMatch?.[1] ?? null,
      body_preview: thingText.slice(0, 300),
    }
  } catch (e: any) {
    results.thing_174430 = { error: e?.message ?? String(e) }
  }

  // Test 3: senza token (confronto)
  try {
    const noAuthRes = await fetch('https://www.boardgamegeek.com/xmlapi2/hot?type=boardgame', {
      signal: AbortSignal.timeout(5000),
    })
    results.hot_no_auth = {
      status: noAuthRes.status,
      ok: noAuthRes.ok,
    }
  } catch (e: any) {
    results.hot_no_auth = { error: e?.message ?? String(e) }
  }

  return NextResponse.json(results)
}
