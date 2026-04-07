import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const VALID_CATEGORIES = ['all', 'gaming', 'cinema', 'anime', 'tv']
const CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 ore

export async function GET(request: Request) {
  const supabase = await createClient()
  try {
    const { searchParams } = new URL(request.url)
    const cat = searchParams.get('cat') || 'all'

    if (!VALID_CATEGORIES.includes(cat)) {
      return NextResponse.json({ error: 'Categoria non valida' }, { status: 400 })
    }

    let query = supabase.from('news_cache').select('data, updated_at, category')
    if (cat !== 'all') query = query.eq('category', cat)

    const { data, error } = await query
    if (error) throw error

    // Se la cache è vuota o scaduta, triggera sync in background
    const now = Date.now()
    const isCacheStale = !data || data.length === 0 ||
      data.some(row => !row.updated_at || now - new Date(row.updated_at).getTime() > CACHE_TTL_MS)

    if (isCacheStale) {
      // Sync in background — non blocca la risposta
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/news/sync`, { method: 'POST' }).catch(() => {})
    }

    let allNews: any[] = []
    if (data) {
      data.forEach(row => {
        const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
        if (Array.isArray(parsed)) allNews = [...allNews, ...parsed]
      })
    }

    // Ordina per data più recente prima
    allNews.sort((a, b) => {
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    return NextResponse.json(allNews)

  } catch (err) {
    console.error('News API error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
