import { test, expect } from '@playwright/test'
import { sampleMasterPool } from '../../src/lib/reco/sampler'
import { composeRecommendationRails } from '../../src/lib/reco/rails'
import type { Recommendation } from '../../src/lib/reco/types'

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
})
