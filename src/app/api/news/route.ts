// DESTINAZIONE: src/app/api/news/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_CATEGORIES = ['all', 'gaming', 'cinema', 'anime', 'boardgames']

export async function GET(request: Request) {
  const supabase = await createClient()
  try {
    const { searchParams } = new URL(request.url)
    const cat = searchParams.get('cat') || 'all'

    // ── Validazione input ────────────────────────────────────────────────────
    if (!VALID_CATEGORIES.includes(cat)) {
      return NextResponse.json({ error: 'Categoria non valida' }, { status: 400 })
    }

    let query = supabase.from('news_cache').select('data')
    if (cat !== 'all') query = query.eq('category', cat)

    const { data, error } = await query
    if (error) throw error

    let allNews: any[] = []
    data.forEach(row => {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      if (Array.isArray(parsed)) allNews = [...allNews, ...parsed]
    })

    return NextResponse.json(allNews)

  } catch (err) {
    console.error('News API error:', err)
    return NextResponse.json([], { status: 500 })
  }
}