import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_CATEGORIES = ['all', 'gaming', 'cinema', 'anime', 'boardgames']

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const cat = searchParams.get('cat') || 'all'

    if (!VALID_CATEGORIES.includes(cat)) {
      return NextResponse.json({ error: 'Categoria non valida' }, { status: 400 })
    }

    const supabase = await createClient()

    let query = supabase.from('news_cache').select('data')
    if (cat !== 'all') query = query.eq('category', cat)

    const { data, error } = await query
    if (error) throw error

    const allNews: any[] = []
    for (const row of data ?? []) {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      if (Array.isArray(parsed)) allNews.push(...parsed)
    }

    return NextResponse.json(allNews)
  } catch (err) {
    console.error('News API error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
