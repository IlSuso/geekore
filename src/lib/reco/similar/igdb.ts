import { IGDB_VALID, TAG_TO_IGDB_THEME } from './constants'
import type { SimilarAdd, SimilarContext } from './types'

let cachedIgdbToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, secret: string): Promise<string | null> {
  const now = Date.now()
  if (cachedIgdbToken && cachedIgdbToken.expiresAt > now + 60_000) return cachedIgdbToken.token
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(6000),
    })
    const data = await res.json()
    if (!data.access_token) return null
    cachedIgdbToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
    return cachedIgdbToken.token
  } catch { return null }
}

function resolveIgdbQueryGenres(ctx: SimilarContext): string[] {
  const crossToIgdbFallback: Record<string, string> = {
    'Horror': 'Adventure', 'Thriller': 'Adventure', 'Science Fiction': 'Shooter',
    'Sci-Fi': 'Shooter', 'Mystery': 'Adventure', 'Psychological': 'Adventure',
    'Slice of Life': 'Simulation', 'Romance': 'Simulation', 'Drama': 'Adventure',
    'Fantasy': 'Role-playing (RPG)', 'Comedy': 'Adventure', 'Sports': 'Sport',
    'Crime': 'Adventure', 'War': 'Shooter', 'History': 'Strategy',
  }

  return ctx.igdbGenres.length > 0
    ? ctx.igdbGenres
    : ctx.crossGenres.filter(g => IGDB_VALID.has(g)).length > 0
      ? ctx.crossGenres.filter(g => IGDB_VALID.has(g))
      : [...new Set(ctx.crossGenres.map(g => crossToIgdbFallback[g]).filter(Boolean) as string[])]
}

export async function fetchIgdbGames(ctx: SimilarContext, add: SimilarAdd) {
  if (!ctx.igdbClientId || !ctx.igdbClientSecret) return

  try {
    const token = await getIgdbToken(ctx.igdbClientId, ctx.igdbClientSecret)
    if (!token) return

    const randomOffset = Math.floor(Math.random() * 40)
    const makeIgdbFetch = async (whereClause: string, useOffset = false) => {
      const offset = useOffset ? randomOffset : 0
      const body = `
        fields name,cover.url,first_release_date,genres.name,themes.name,keywords.name,
               rating,rating_count,involved_companies.company.name,involved_companies.developer,
               summary;
        where ${whereClause} & rating_count > 20 & rating >= 50 & cover != null;
        sort rating desc; limit 30; offset ${offset};`
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': ctx.igdbClientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body, signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return
      const games = await res.json()
      if (!Array.isArray(games)) return
      for (const g of games) {
        const recGenres: string[] = (g.genres || []).map((x: any) => x.name)
        const developer = (g.involved_companies || [])
          .filter((ic: any) => ic.developer).map((ic: any) => ic.company?.name).filter(Boolean)[0]
        add({
          id: g.id.toString(), title: g.name || '', type: 'game',
          coverImage: g.cover?.url ? `https:${g.cover.url.replace('t_thumb','t_1080p')}` : undefined,
          year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined,
          genres: recGenres,
          tags: (g.themes || []).map((t: any) => t.name),
          keywords: (g.keywords || []).map((k: any) => k.name),
          score: g.rating ? Math.min(g.rating / 20, 5) : undefined,
          description: g.summary || undefined,
          matchScore: 55 + ctx.profileBoost(recGenres),
          why: ctx.whyText(recGenres), creatorBoost: developer, _pop: g.rating_count || 0,
        })
      }
    }

    const igdbQueryGenres = resolveIgdbQueryGenres(ctx)
    if (igdbQueryGenres.length > 0) {
      const genreQ = igdbQueryGenres.slice(0, 2).map(g => `"${g}"`).join(',')
      await makeIgdbFetch(`genres.name = (${genreQ})`, true)
    }

    const igdbKeywords = [...ctx.rawKeywords, ...ctx.rawTags].slice(0, 8)
    if (igdbKeywords.length > 0) {
      const kwQ = igdbKeywords.map(k => `"${k}"`).join(',')
      const themeIds = [...new Set(igdbKeywords
        .map(k => TAG_TO_IGDB_THEME[k] || TAG_TO_IGDB_THEME[k.toLowerCase()])
        .filter(Boolean) as number[]
      )]
      const themeClause = themeIds.length > 0
        ? `themes = (${themeIds.join(',')}) | keywords.name = (${kwQ})`
        : `keywords.name = (${kwQ})`
      await makeIgdbFetch(`(${themeClause})`)
    }
  } catch {}
}
