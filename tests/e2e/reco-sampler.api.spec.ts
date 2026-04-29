import { test, expect } from '@playwright/test'
import { sampleMasterPool } from '../../src/lib/reco/sampler'
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
