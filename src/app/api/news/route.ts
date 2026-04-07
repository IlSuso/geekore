import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const VALID_CATEGORIES = ['all', 'gaming', 'cinema', 'anime', 'tv']
const CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 ore

export async function GET(request: Request) {
  const supabase = await createClient()
  try {
    const { searchParams } = new URL(request.url)
    const cat  = searchParams.get('cat')  || 'all'
    const lang = searchParams.get('lang') === 'en' ? 'en' : 'it'

    if (!VALID_CATEGORIES.includes(cat)) {
      return NextResponse.json({ error: 'Categoria non valida' }, { status: 400 })
    }

    const suffix = `_${lang}` // es. cinema_it

    // Build query: fetch categories with lang suffix
    const categoriesNeeded = cat === 'all'
      ? ['cinema', 'tv', 'anime', 'gaming'].map(c => `${c}${suffix}`)
      : [`${cat}${suffix}`]

    const { data, error } = await supabase
      .from('news_cache')
      .select('data, updated_at, category')
      .in('category', categoriesNeeded)

    if (error) throw error

    // Se cache vuota o scaduta → sync in background
    const now = Date.now()
    const isCacheStale = !data || data.length === 0 ||
      data.some(row => !row.updated_at || now - new Date(row.updated_at).getTime() > CACHE_TTL_MS)

    if (isCacheStale) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/news/sync?lang=${lang}`, { method: 'GET' }).catch(() => {})
    }

    let allNews: any[] = []
    if (data) {
      data.forEach(row => {
        const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
        if (Array.isArray(parsed)) allNews = [...allNews, ...parsed]
      })
    }

    // Ordina per data più recente
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
