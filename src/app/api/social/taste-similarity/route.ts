// DESTINAZIONE: src/app/api/social/taste-similarity/route.ts
// V3: Taste Similarity Score tra utenti

import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'

interface GenreVector {
  [genre: string]: number
}

function cosineSimilarity(a: GenreVector, b: GenreVector): number {
  const allGenres = new Set([...Object.keys(a), ...Object.keys(b)])
  if (!allGenres.size) return 0

  let dot = 0, normA = 0, normB = 0
  for (const genre of allGenres) {
    const va = a[genre] || 0
    const vb = b[genre] || 0
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function buildGenreVector(entries: any[]): GenreVector {
  const vec: GenreVector = {}
  for (const entry of entries) {
    const rating = entry.rating || 0
    const status = entry.status || ''
    const genres: string[] = entry.genres || []

    if (genres.length === 0) continue
    if (status === 'dropped' && rating < 2) continue

    let weight = rating > 0 ? rating : 3
    if (status === 'completed') weight *= 1.5
    if ((entry.rewatch_count || 0) >= 1) weight *= 2

    for (const genre of genres) {
      vec[genre] = (vec[genre] || 0) + weight
    }
  }

  const totalEntries = entries.length || 1
  for (const genre of Object.keys(vec)) {
    vec[genre] = vec[genre] / Math.sqrt(totalEntries)
  }

  return vec
}

function toSimilarityScore(cosine: number): number {
  const normalized = Math.min(1, cosine / 0.8)
  const score = Math.round(normalized * 100)
  return Math.min(100, Math.max(0, score))
}

function getSimilarityLabel(score: number): string {
  if (score >= 85) return 'Taste gemello'
  if (score >= 70) return 'Molto simile'
  if (score >= 55) return 'Abbastanza in linea'
  if (score >= 40) return 'Qualcosa in comune'
  if (score >= 20) return 'Gusti diversi'
  return 'Molto diversi'
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 30, windowMs: 60_000, prefix: 'taste-sim' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get('userId')
  const isBatch = searchParams.get('batch') === '1'

  const { data: myEntries } = await supabase
    .from('user_media_entries')
    .select('genres, rating, status, rewatch_count, type')
    .eq('user_id', user.id)
    .limit(10000)

  if (!myEntries || myEntries.length === 0) {
    return NextResponse.json({ score: 0, label: 'Nessun dato', profiles: [] }, { headers: rl.headers })
  }

  const myVector = buildGenreVector(myEntries)

  if (targetUserId && !isBatch) {
    const { data: theirEntries } = await supabase
      .from('user_media_entries')
      .select('genres, rating, status, rewatch_count, type')
      .eq('user_id', targetUserId)
      .limit(10000)

    if (!theirEntries || theirEntries.length === 0) {
      return NextResponse.json({ score: 0, label: 'Nessun dato', userId: targetUserId }, { headers: rl.headers })
    }

    const theirVector = buildGenreVector(theirEntries)
    const cosine = cosineSimilarity(myVector, theirVector)
    const score = toSimilarityScore(cosine)

    const commonGenres = Object.keys(myVector)
      .filter(g => theirVector[g])
      .sort((a, b) => (myVector[b] + theirVector[b]) - (myVector[a] + theirVector[a]))
      .slice(0, 5)

    return NextResponse.json({
      score,
      label: getSimilarityLabel(score),
      userId: targetUserId,
      commonGenres,
    }, { headers: rl.headers })
  }

  if (isBatch) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds = (follows || []).map(f => f.following_id)
    if (followingIds.length === 0) {
      return NextResponse.json({ profiles: [] }, { headers: rl.headers })
    }

    const limitedIds = followingIds.slice(0, 20)

    const { data: allEntries } = await supabase
      .from('user_media_entries')
      .select('user_id, genres, rating, status, rewatch_count, type')
      .in('user_id', limitedIds)
      .limit(10000)

    const entriesByUser: Record<string, any[]> = {}
    for (const entry of (allEntries || [])) {
      if (!entriesByUser[entry.user_id]) entriesByUser[entry.user_id] = []
      entriesByUser[entry.user_id].push(entry)
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', limitedIds)

    const profileMap: Record<string, any> = {}
    for (const p of (profiles || [])) profileMap[p.id] = p

    const similarities = limitedIds
      .filter(id => entriesByUser[id]?.length > 0)
      .map(id => {
        const theirVector = buildGenreVector(entriesByUser[id])
        const cosine = cosineSimilarity(myVector, theirVector)
        const score = toSimilarityScore(cosine)
        const commonGenres = Object.keys(myVector)
          .filter(g => theirVector[g])
          .sort((a, b) => (myVector[b] + theirVector[b]) - (myVector[a] + theirVector[a]))
          .slice(0, 3)

        return {
          userId: id,
          profile: profileMap[id] || null,
          score,
          label: getSimilarityLabel(score),
          commonGenres,
          entryCount: entriesByUser[id].length,
        }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)

    return NextResponse.json({ profiles: similarities }, { headers: rl.headers })
  }

  return NextResponse.json({ error: apiMessage(request, 'invalidParams') }, { status: 400, headers: rl.headers })
}
