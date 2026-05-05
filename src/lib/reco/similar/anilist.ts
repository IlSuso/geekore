import { ANILIST_URL } from './constants'
import { toTitleCase } from './genreResolution'
import type { SimilarAdd, SimilarContext } from './types'
import { cleanDescriptionForDisplay } from '@/lib/text/descriptionCleanup'

export async function fetchAnilistManga(ctx: SimilarContext, add: SimilarAdd) {
  if (ctx.anilistGenres.length === 0 && ctx.rawTags.length === 0) return

  try {
    if (ctx.anilistGenres.length > 0) {
      const q = `query($g:[String]){Page(page:1,perPage:15){media(type:MANGA,genre_in:$g,sort:[SCORE_DESC]){id title{romaji english}coverImage{large}startDate{year}genres averageScore popularity chapters description tags{name}}}}`
      const res = await fetch(ANILIST_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, variables: { g: ctx.anilistGenres.slice(0, 3) } }),
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const json = await res.json()
        for (const m of json.data?.Page?.media || []) {
          const id = `anilist-manga-${m.id}`
          const recGenres: string[] = m.genres || []
          add({ id, title: m.title?.romaji || m.title?.english || '', type: 'manga',
            coverImage: m.coverImage?.extraLarge || m.coverImage?.large, year: m.startDate?.year, genres: recGenres,
            tags: (m.tags || []).map((t: any) => t.name),
            episodes: m.chapters ?? undefined,
            description: cleanDescriptionForDisplay(m.description),
            score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
            matchScore: 48 + ctx.profileBoost(recGenres), why: ctx.whyText(recGenres), _pop: m.popularity || 0 })
        }
      }
    }

    const mangaTagsSrc = (ctx.rawTags.length > 0 || ctx.rawKeywords.length > 0)
      ? [...ctx.rawTags, ...ctx.rawKeywords]
      : ctx.effectiveKeywords
    const anilistTags = [...new Set(mangaTagsSrc
      .slice(0, 10)
      .flatMap(t => [t, toTitleCase(t)])
    )]
    if (anilistTags.length > 0) {
      const q = `query($t:[String]){Page(page:1,perPage:15){media(type:MANGA,tag_in:$t,sort:[SCORE_DESC]){id title{romaji english}coverImage{large}startDate{year}genres averageScore popularity chapters description tags{name}}}}`
      const res = await fetch(ANILIST_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, variables: { t: anilistTags } }),
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const json = await res.json()
        for (const m of json.data?.Page?.media || []) {
          const id = `anilist-manga-${m.id}`
          const recGenres: string[] = m.genres || []
          const mangaTags2 = (m.tags || []).map((t: any) => t.name)
          add({ id, title: m.title?.romaji || m.title?.english || '', type: 'manga',
            coverImage: m.coverImage?.extraLarge || m.coverImage?.large, year: m.startDate?.year, genres: recGenres,
            tags: mangaTags2,
            episodes: m.chapters ?? undefined,
            description: cleanDescriptionForDisplay(m.description),
            score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
            matchScore: 55 + ctx.profileBoost(recGenres), why: ctx.whyText(recGenres, anilistTags), _pop: m.popularity || 0 })
        }
      }
    }
  } catch {}
}
