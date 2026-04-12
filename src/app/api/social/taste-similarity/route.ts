// DESTINAZIONE: src/app/api/social/taste-similarity/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// V3: Taste Similarity Score tra utenti
//
// Calcola quanto due profili gusti si sovrappongono (0-100).
// Usato per:
//   - Mostrare "X% match" tra utenti nel profilo
//   - Pesare i consigli social (chi ha gusti simili conta di più)
//   - Sezione "Amici con gusti simili" nella For You
//
// GET /api/social/taste-similarity?userId=<uuid>
//   → restituisce la similarity con l'utente corrente
//
// GET /api/social/taste-similarity?batch=1
//   → restituisce similarities con tutti i following
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

interface GenreVector {
  [genre: string]: number
}

// Cosine similarity tra due vettori di generi
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

// Costruisce un vettore di generi dalle entries dell'utente
// (versione semplificata: no temporal decay, solo per comparazione)
function buildGenreVector(entries: any[]): GenreVector {
  const vec: GenreVector = {}
  for (const entry of entries) {
    const rating = entry.rating || 0
    const status = entry.status || ''
    const genres: string[] = entry.genres || []

    if (genres.length === 0) continue
    if (status === 'dropped' && rating < 2) continue // ignora dropped negativi

    // Peso semplice: rating × completion bonus
    let weight = rating > 0 ? rating : 3
    if (status === 'completed') weight *= 1.5
    if ((entry.rewatch_count || 0) >= 1) weight *= 2

    for (const genre of genres) {
      vec[genre] = (vec[genre] || 0) + weight
    }
  }

  // Normalizza per numero di titoli (evita che chi ha più titoli domini)
  const totalEntries = entries.length || 1
  for (const genre of Object.keys(vec)) {
    vec[genre] = vec[genre] / Math.sqrt(totalEntries)
  }

  return vec
}

// Trasforma similarity coseno (0-1) in score leggibile (0-100)
function toSimilarityScore(cosine: number): number {
  // Cosine similarity per gusti raramente supera 0.7 anche tra gemelli
  // Mappa: 0 → 0%, 0.3 → 50%, 0.6 → 85%, 0.8+ → 95-100%
  const normalized = Math.min(1, cosine / 0.8)
  const score = Math.round(normalized * 100)
  return Math.min(100, Math.max(0, score))
}

// Genera una label testuale per lo score
function getSimilarityLabel(score: number): string {
  if (score >= 85) return 'Taste gemello'
  if (score >= 70) return 'Molto simile'
  if (score >= 55) return 'Abbastanza in linea'
  if (score >= 40) return 'Qualcosa in comune'
  if (score >= 20) return 'Gusti diversi'
  return 'Molto diversi'
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'taste-sim' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get('userId')
  const isBatch = searchParams.get('batch') === '1'

  // Carica entries dell'utente corrente
  const { data: myEntries } = await supabase
    .from('user_media_entries')
    .select('genres, rating, status, rewatch_count, type')
    .eq('user_id', user.id)

  if (!myEntries || myEntries.length === 0) {
    return NextResponse.json({ score: 0, label: 'Nessun dato', profiles: [] })
  }

  const myVector = buildGenreVector(myEntries)

  // ── Modalità singola: confronta con un utente specifico ──────────────────
  if (targetUserId && !isBatch) {
    const { data: theirEntries } = await supabase
      .from('user_media_entries')
      .select('genres, rating, status, rewatch_count, type')
      .eq('user_id', targetUserId)

    if (!theirEntries || theirEntries.length === 0) {
      return NextResponse.json({ score: 0, label: 'Nessun dato', userId: targetUserId })
    }

    const theirVector = buildGenreVector(theirEntries)
    const cosine = cosineSimilarity(myVector, theirVector)
    const score = toSimilarityScore(cosine)

    // Top generi in comune
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

  // ── Modalità batch: confronta con tutti i following ───────────────────────
  if (isBatch) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds = (follows || []).map(f => f.following_id)
    if (followingIds.length === 0) {
      return NextResponse.json({ profiles: [] }, { headers: rl.headers })
    }

    // Limita a 20 per non fare troppe query
    const limitedIds = followingIds.slice(0, 20)

    // Carica entries di tutti i following in una sola query
    const { data: allEntries } = await supabase
      .from('user_media_entries')
      .select('user_id, genres, rating, status, rewatch_count, type')
      .in('user_id', limitedIds)

    // Raggruppa per utente
    const entriesByUser: Record<string, any[]> = {}
    for (const entry of (allEntries || [])) {
      if (!entriesByUser[entry.user_id]) entriesByUser[entry.user_id] = []
      entriesByUser[entry.user_id].push(entry)
    }

    // Carica profili
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', limitedIds)

    const profileMap: Record<string, any> = {}
    for (const p of (profiles || [])) profileMap[p.id] = p

    // Calcola similarity per ciascuno
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

  return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })
}