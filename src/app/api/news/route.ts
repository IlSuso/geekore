import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

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

    const suffix = `_${lang}`

    const categoriesNeeded = cat === 'all'
      ? ['cinema', 'tv', 'anime', 'gaming'].map(c => `${c}${suffix}`)
      : [`${cat}${suffix}`]

    const { data, error } = await supabase
      .from('news_cache')
      .select('data, updated_at, category')
      .in('category', categoriesNeeded)

    if (error) throw error

    const now = Date.now()
    const isCacheStale = !data || data.length === 0 ||
      data.some(row => !row.updated_at || now - new Date(row.updated_at).getTime() > CACHE_TTL_MS)

    if (isCacheStale) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/news/sync?lang=${lang}`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      }).catch(() => {})
    }

    let allNews: any[] = []
    if (data) {
      data.forEach(row => {
        const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
        if (Array.isArray(parsed)) allNews = [...allNews, ...parsed]
      })
    }

    allNews.sort((a, b) => {
      const dateA = a.nextEpisodeDate || a.date
      const dateB = b.nextEpisodeDate || b.date
      if (!dateA) return 1
      if (!dateB) return -1
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })

    return NextResponse.json(allNews)

  } catch (err) {
    // C2: usa logger invece di console.error
    logger.error('news/route', err)
    return NextResponse.json([], { status: 500 })
  }
}
