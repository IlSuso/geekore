import { test, expect } from '@playwright/test'
import { sampleMasterPool } from '../../src/lib/reco/sampler'
import { composeRecommendationRails } from '../../src/lib/reco/rails'
import { computeTasteProfile } from '../../src/lib/reco/profile'
import { buildExposurePolicyForType } from '../../src/lib/reco/recruitment/exposure-policy'
import { buildRecruitmentSlots } from '../../src/lib/reco/recruitment/planner'
import type { Recommendation } from '../../src/lib/reco/types'
import type { UserEntry } from '../../src/lib/reco/engine-types'

function rec(id: string, matchScore: number, genre = 'Drama'): Recommendation {
  return {
    id,
    title: `Title ${id}`,
    type: 'movie',
    genres: [genre],
    matchScore,
    score: 4,
    why: 'Test',
  }
}

test.describe('recommendation sampler', () => {
  test('respects recent exposure cooldown and feedback blocks', () => {
    const now = new Date('2026-04-30T10:00:00.000Z')
    const items = [
      rec('recent', 95, 'Action'),
      rec('blocked', 94, 'Action'),
      rec('fresh-a', 93, 'Drama'),
      rec('fresh-b', 92, 'Comedy'),
      rec('fresh-c', 91, 'Mystery'),
      rec('fresh-d', 90, 'Fantasy'),
    ]

    const sampled = sampleMasterPool(items, {
      now,
      size: 4,
      exposures: [
        { rec_id: 'recent', rec_type: 'movie', shown_at: '2026-04-30T08:00:00.000Z' },
        { rec_id: 'blocked', rec_type: 'movie', shown_at: '2026-04-20T08:00:00.000Z', action: 'not_interested' },
      ],
    })

    expect(sampled.map(item => item.id)).not.toContain('recent')
    expect(sampled.map(item => item.id)).not.toContain('blocked')
    expect(sampled).toHaveLength(4)
  })

  test('falls back to older exposed items when the bucket is otherwise exhausted', () => {
    const now = new Date('2026-04-30T10:00:00.000Z')
    const items = [
      rec('fresh', 95, 'Action'),
      rec('old-a', 94, 'Drama'),
      rec('old-b', 93, 'Comedy'),
    ]

    const sampled = sampleMasterPool(items, {
      now,
      size: 3,
      exposures: [
        { rec_id: 'old-a', rec_type: 'movie', shown_at: '2026-04-20T08:00:00.000Z' },
        { rec_id: 'old-b', rec_type: 'movie', shown_at: '2026-04-21T08:00:00.000Z' },
      ],
    })

    expect(sampled.map(item => item.id)).toEqual(expect.arrayContaining(['fresh', 'old-a', 'old-b']))
  })

  test('rotates away from recently served pool items when the master has depth', () => {
    const now = new Date('2026-04-30T10:00:00.000Z')
    const items = Array.from({ length: 40 }, (_, idx) =>
      rec(`item-${idx + 1}`, idx < 20 ? 95 - (idx % 5) : 82 - (idx % 5), idx % 2 === 0 ? 'Drama' : 'Action')
    )
    const exposures = items.slice(0, 20).map(item => ({
      rec_id: item.id,
      rec_type: item.type,
      shown_at: '2026-04-30T09:00:00.000Z',
    }))

    const sampled = sampleMasterPool(items, { now, size: 20, exposures })
    const sampledIds = new Set(sampled.map(item => item.id))

    expect(sampled).toHaveLength(20)
    expect(items.slice(0, 20).filter(item => sampledIds.has(item.id))).toHaveLength(0)
    expect(items.slice(20).filter(item => sampledIds.has(item.id)).length).toBeGreaterThanOrEqual(15)
  })

  test('uses dynamic tier quotas for smaller requested batches', () => {
    const now = new Date('2026-04-30T10:00:00.000Z')
    const items = [
      ...Array.from({ length: 10 }, (_, idx) => rec(`high-${idx}`, 90, 'Drama')),
      ...Array.from({ length: 10 }, (_, idx) => rec(`mid-${idx}`, 70, 'Comedy')),
      ...Array.from({ length: 10 }, (_, idx) => rec(`low-${idx}`, 45, 'Mystery')),
    ]

    const sampled = sampleMasterPool(items, { now, size: 10, explorationRate: 0 })
    const high = sampled.filter(item => item.id.startsWith('high')).length
    const mid = sampled.filter(item => item.id.startsWith('mid')).length
    const low = sampled.filter(item => item.id.startsWith('low')).length

    expect(sampled).toHaveLength(10)
    expect(high).toBeGreaterThanOrEqual(4)
    expect(mid).toBeGreaterThanOrEqual(3)
    expect(low).toBeGreaterThanOrEqual(2)
  })

  test('keeps repeated refreshes fresh from a deep master pool without regeneration', () => {
    const items = Array.from({ length: 120 }, (_, idx) =>
      rec(`deep-${idx + 1}`, idx < 70 ? 88 - (idx % 8) : 68 - (idx % 8), idx % 3 === 0 ? 'Drama' : idx % 3 === 1 ? 'Action' : 'Mystery')
    )
    const exposures: Array<{ rec_id: string; rec_type: string; shown_at: string }> = []
    const uniqueServed = new Set<string>()

    for (let round = 0; round < 4; round++) {
      const now = new Date(`2026-04-30T1${round}:00:00.000Z`)
      const sampled = sampleMasterPool(items, { now, size: 20, exposures, explorationRate: 0 })
      expect(sampled).toHaveLength(20)
      for (const item of sampled) {
        uniqueServed.add(item.id)
        exposures.push({
          rec_id: item.id,
          rec_type: item.type,
          shown_at: now.toISOString(),
        })
      }
    }

    expect(uniqueServed.size).toBeGreaterThanOrEqual(75)
  })
})

test.describe('recommendation rails', () => {
  test('builds netflix-style mixed rows from the served pool', () => {
    const recommendations = {
      movie: [
        { ...rec('movie-a', 96, 'Drama'), isAwardWinner: true, year: 2026 },
        { ...rec('movie-b', 91, 'Drama'), isDiscovery: true },
        { ...rec('movie-c', 88, 'Thriller'), isSerendipity: true },
        { ...rec('movie-d', 84, 'Drama'), isAwardWinner: true },
      ],
      game: [
        { ...rec('game-a', 94, 'Fantasy'), type: 'game' as const, isSeasonal: true },
        { ...rec('game-b', 82, 'Fantasy'), type: 'game' as const, isDiscovery: true },
        { ...rec('game-c', 79, 'Adventure'), type: 'game' as const, isAwardWinner: true },
        { ...rec('game-d', 76, 'Fantasy'), type: 'game' as const, isDiscovery: true },
        { ...rec('game-e', 74, 'Drama'), type: 'game' as const, isSeasonal: true, isDiscovery: true },
      ],
    }

    const rails = composeRecommendationRails(recommendations, { globalGenres: [{ genre: 'Drama', score: 10 }] })

    expect(rails.map(rail => rail.id)).toEqual(expect.arrayContaining(['top-match', 'fresh', 'discovery', 'genre-drama']))
    expect(rails[0].items.some(item => item.type === 'movie')).toBeTruthy()
    expect(rails[0].items.some(item => item.type === 'game')).toBeTruthy()
  })

  test('deduplicates items inside each editorial row', () => {
    const recommendations = {
      movie: [
        { ...rec('same', 96, 'Drama'), isDiscovery: true },
        { ...rec('same', 95, 'Drama'), isDiscovery: true },
        { ...rec('other-a', 94, 'Drama'), isDiscovery: true },
        { ...rec('other-b', 93, 'Drama'), isDiscovery: true },
        { ...rec('other-c', 92, 'Drama'), isDiscovery: true },
      ],
    }

    const rails = composeRecommendationRails(recommendations, { globalGenres: [{ genre: 'Drama', score: 10 }] })
    const discovery = rails.find(rail => rail.id === 'discovery')

    expect(discovery).toBeTruthy()
    expect(discovery?.items.map(item => item.id)).toEqual(['same', 'other-a', 'other-b', 'other-c'])
  })

  test('adds because-title and quick-pick rails when profile context supports them', () => {
    const recommendations = {
      movie: [
        { ...rec('drama-a', 96, 'Drama') },
        { ...rec('drama-b', 92, 'Drama') },
        { ...rec('drama-c', 88, 'Drama') },
        { ...rec('drama-d', 84, 'Drama') },
      ],
      tv: [
        { ...rec('short-a', 90, 'Comedy'), type: 'tv' as const, episodes: 8 },
        { ...rec('short-b', 87, 'Comedy'), type: 'tv' as const, episodes: 10 },
        { ...rec('short-c', 83, 'Comedy'), type: 'tv' as const, episodes: 6 },
        { ...rec('short-d', 80, 'Comedy'), type: 'tv' as const, episodes: 12 },
      ],
    }

    const rails = composeRecommendationRails(recommendations, {
      globalGenres: [{ genre: 'Drama', score: 10 }],
      genreToTitles: {
        Drama: [{ title: 'Loved Thing', type: 'movie', recency: 1, rating: 5 }],
      },
      topTitlesForContext: [{ title: 'Loved Thing', type: 'movie', rating: 5, rewatchCount: 1 }],
    })

    expect(rails.map(rail => rail.kind)).toEqual(expect.arrayContaining(['because-title', 'quick-picks']))
    expect(rails.find(rail => rail.kind === 'because-title')?.title).toContain('Loved Thing')
  })
})

test.describe('taste profile', () => {
  test('spreads one title weight across expanded genres instead of overcounting it', () => {
    const entries: UserEntry[] = [
      {
        title: 'Focused Drama',
        type: 'movie',
        status: 'completed',
        rating: 5,
        genres: ['Drama'],
        updated_at: '2026-04-29T10:00:00.000Z',
      },
      {
        title: 'Genre Soup',
        type: 'movie',
        status: 'completed',
        rating: 5,
        genres: ['Fantasy', 'Adventure', 'Action', 'Mystery', 'Horror', 'Comedy', 'Romance', 'Thriller', 'Science Fiction'],
        updated_at: '2026-04-29T10:00:00.000Z',
      },
    ]

    const profile = computeTasteProfile(entries, {}, [], [])
    const scores = Object.fromEntries(profile.globalGenres.map(item => [item.genre, item.score]))

    expect(scores.Drama).toBeGreaterThan(scores.Fantasy)
    expect(scores.Fantasy).toBeGreaterThan(0)
  })

  test('downweights planned entries compared with completed entries', () => {
    const entries: UserEntry[] = [
      {
        title: 'Completed Drama',
        type: 'movie',
        status: 'completed',
        rating: 5,
        genres: ['Drama'],
        updated_at: '2026-04-29T10:00:00.000Z',
      },
      {
        title: 'Planned Fantasy',
        type: 'movie',
        status: 'planned',
        rating: 5,
        genres: ['Fantasy'],
        updated_at: '2026-04-29T10:00:00.000Z',
      },
    ]

    const profile = computeTasteProfile(entries, {}, [], [])
    const scores = Object.fromEntries(profile.globalGenres.map(item => [item.genre, item.score]))

    expect(scores.Drama).toBeGreaterThan(scores.Fantasy)
  })

  test('dampens very large media-type buckets so one collection slice does not dominate everything', () => {
    const gameEntries: UserEntry[] = Array.from({ length: 36 }, (_, idx) => ({
      title: `Action Game ${idx}`,
      type: 'game',
      status: 'completed',
      rating: 5,
      current_episode: 20,
      genres: ['Action'],
      updated_at: '2026-04-29T10:00:00.000Z',
    }))
    const movieEntries: UserEntry[] = Array.from({ length: 4 }, (_, idx) => ({
      title: `Drama Movie ${idx}`,
      type: 'movie',
      status: 'completed',
      rating: 5,
      genres: ['Drama'],
      updated_at: '2026-04-29T10:00:00.000Z',
    }))

    const profile = computeTasteProfile([...gameEntries, ...movieEntries], {}, [], [])
    const scores = Object.fromEntries(profile.globalGenres.map(item => [item.genre, item.score]))

    expect(scores.Action).toBeGreaterThan(scores.Drama)
    expect(scores.Action / scores.Drama).toBeLessThan(8)
  })
})

test.describe('master pool recruitment', () => {
  test('blocks only recent or negative exposures during master generation', () => {
    const policy = buildExposurePolicyForType(
      'movie',
      [
        { rec_id: 'recent', rec_type: 'movie', shown_at: '2026-04-25T10:00:00.000Z' },
        { rec_id: 'old-liked', rec_type: 'movie', shown_at: '2026-03-01T10:00:00.000Z' },
        { rec_id: 'negative', rec_type: 'movie', shown_at: '2026-03-01T10:00:00.000Z', action: 'not_interested' },
        { rec_id: 'other-type', rec_type: 'tv', shown_at: '2026-04-25T10:00:00.000Z' },
      ],
      new Set(['movie:recent', 'movie:old-liked', 'movie:negative', 'tv:other-type']),
      { recentWindowDays: 21 }
    )

    expect(policy.hardBlockedIds.has('recent')).toBe(true)
    expect(policy.hardBlockedIds.has('negative')).toBe(true)
    expect(policy.hardBlockedIds.has('old-liked')).toBe(false)
    expect(policy.historicalShownIds.has('old-liked')).toBe(true)
  })

  test('uses negative-only hard blocks by default for master recruitment', () => {
    const now = Date.now()
    const daysAgo = (days: number) => new Date(now - days * 86400000).toISOString()
    const policy = buildExposurePolicyForType(
      'movie',
      [
        { rec_id: 'two-days', rec_type: 'movie', shown_at: daysAgo(2) },
        { rec_id: 'ten-days', rec_type: 'movie', shown_at: daysAgo(10) },
        { rec_id: 'negative-old', rec_type: 'movie', shown_at: daysAgo(10), action: 'already_seen' },
      ],
      new Set(['movie:two-days', 'movie:ten-days', 'movie:negative-old'])
    )

    expect(policy.hardBlockedIds.has('two-days')).toBe(false)
    expect(policy.hardBlockedIds.has('ten-days')).toBe(false)
    expect(policy.hardBlockedIds.has('negative-old')).toBe(true)
    expect(policy.recentShownIds.size).toBe(0)
  })

  test('adds global and adjacent taste slots for cross-media recruitment', () => {
    const entries: UserEntry[] = [
      { title: 'A', type: 'movie', rating: 5, status: 'completed', genres: ['Fantasy', 'Adventure'] },
      { title: 'B', type: 'game', rating: 5, status: 'completed', genres: ['Role-playing (RPG)'], themes: ['survival'] },
      { title: 'C', type: 'tv', rating: 4, status: 'completed', genres: ['Mystery'] },
    ]
    const profile = computeTasteProfile(entries, null, [], [])
    const plan = buildRecruitmentSlots('anime', profile, 40)

    expect(plan.slots.length).toBeGreaterThan(0)
    expect(plan.diagnostics.crossMediaSlots + plan.diagnostics.adjacencySlots).toBeGreaterThan(0)
    expect(plan.diagnostics.plannedQuota).toBeGreaterThan(0)
  })
})
