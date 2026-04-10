import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'   // ← Aggiunto

// ── Tipi, costanti, funzioni helper (computeTasteProfile, buildWhy, fetcher, ecc.) ──
// (tutto il resto del file rimane identico)

// ── Handler principale ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── Rate Limiting (blocco patch aggiunto esattamente come richiesto) ───────
  const rateLimitResult = await rateLimit(request);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
      { 
        status: 429,
        headers: rateLimitResult.retryAfter 
          ? { 'Retry-After': rateLimitResult.retryAfter.toString() }
          : {}
      }
    );
  }
  // ───────────────────────────────────────────────────────────────────────────

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const requestedType = searchParams.get('type') || 'all'
    const forceRefresh = searchParams.get('refresh') === '1'

    // Legge tutta la collezione con updated_at per il peso temporale
    const { data: entries } = await supabase
      .from('user_media_entries')
      .select('type, rating, genres, current_episode, is_steam, title, external_id, appid, updated_at, tags, keywords, themes, player_perspectives')
      .eq('user_id', user.id)

    const allEntries = entries || []

    // Cache check: invalida sempre se la collezione è cambiata di recente
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('recommendations_cache')
        .select('data, expires_at, generated_at')
        .eq('user_id', user.id)
        .eq('media_type', requestedType === 'all' ? 'anime' : requestedType)
        .single()

      if (cached && new Date(cached.expires_at) > new Date()) {
        const cacheGeneratedAt = new Date(cached.generated_at)
        const lastUpdate = allEntries.reduce((latest, e) => {
          const t = new Date(e.updated_at || 0)
          return t > latest ? t : latest
        }, new Date(0))

        if (lastUpdate <= cacheGeneratedAt) {
          if (requestedType === 'all') {
            const { data: allCached } = await supabase
              .from('recommendations_cache')
              .select('media_type, data')
              .eq('user_id', user.id)

            if (allCached && allCached.length > 0) {
              const recommendations: Record<string, any[]> = {}
              for (const c of allCached) recommendations[c.media_type] = c.data
              return NextResponse.json({ recommendations, cached: true })
            }
          } else {
            return NextResponse.json({ recommendations: { [requestedType]: cached.data }, cached: true })
          }
        }
      }
    }

    const { data: preferences } = await supabase
      .from('user_preferences').select('*').eq('user_id', user.id).single()

    const { data: wishlist } = await supabase
      .from('wishlist').select('external_id').eq('user_id', user.id)

    // Calcola taste profile con pesi temporali
    const tasteProfile = computeTasteProfile(allEntries, preferences)

    const ownedIds = new Set<string>([
      ...allEntries.map(e => e.external_id).filter(Boolean),
      ...allEntries.map(e => e.appid).filter(Boolean),
      ...(wishlist || []).map(w => w.external_id).filter(Boolean),
    ])

    const tmdbToken = process.env.NEXT_PUBLIC_TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    const typesToFetch: MediaType[] = requestedType === 'all'
      ? ['anime', 'manga', 'movie', 'tv', 'game']
      : [requestedType as MediaType]

    const results = await Promise.allSettled(
      typesToFetch.map(async type => {
        const genres = getGenresForType(type, tasteProfile)
        switch (type) {
          case 'anime': return { type, items: await fetchAnimeRecs(genres, ownedIds, tasteProfile) }
          case 'manga': return { type, items: await fetchMangaRecs(genres, ownedIds, tasteProfile) }
          case 'movie': return { type, items: await fetchMovieRecs(genres, ownedIds, tasteProfile, tmdbToken) }
          case 'tv':    return { type, items: await fetchTvRecs(genres, ownedIds, tasteProfile, tmdbToken) }
          case 'game':  return { type, items: await fetchGameRecs(genres, ownedIds, tasteProfile, igdbClientId, igdbClientSecret) }
        }
      })
    )

    const recommendations: Record<string, Recommendation[]> = {}
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        recommendations[result.value.type] = result.value.items
      }
    }

    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

    await Promise.allSettled(
      typesToFetch.map(type =>
        supabase.from('recommendations_cache').upsert({
          user_id: user.id,
          media_type: type,
          data: recommendations[type] || [],
          taste_snapshot: tasteProfile.topGenres,
          generated_at: now,
          expires_at: expiresAt,
        }, { onConflict: 'user_id,media_type' })
      )
    )

    return NextResponse.json({
      recommendations,
      tasteProfile: {
        globalGenres: tasteProfile.globalGenres,
        topGenres: tasteProfile.topGenres,
        collectionSize: tasteProfile.collectionSize,
        recentWindow: tasteProfile.recentWindow,
      },
      cached: false,
    })

  } catch (error) {
    console.error('Recommendations error:', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}