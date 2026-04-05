import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    await supabase
      .from('news_cache')
      .update({ updated_at: new Date().toISOString() })
      .eq('category', 'all')
    return NextResponse.json({ status: 'updated' })
  } catch (err) {
    console.error('Sync API Error:', err)
    return NextResponse.json({ status: 'error', message: 'Check server logs' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Sync endpoint is alive. Use POST to sync.' })
}
