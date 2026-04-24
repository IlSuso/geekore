'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Shuffle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SwipeMode } from '@/components/for-you/SwipeMode'
import type { SwipeItem } from '@/components/for-you/SwipeMode'

function triggerTasteDelta(options: {
  action: 'rating' | 'status_change' | 'wishlist_add' | 'rewatch' | 'progress'
  mediaId: string; mediaType: string; genres: string[]
  rating?: number; prevRating?: number; status?: string; prevStatus?: string
}) {
  fetch('/api/taste/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) }).catch(() => {})
}

const QUEUE_TABLE_MAP: Record<string, string> = {
  all: 'swipe_queue_all',
  anime: 'swipe_queue_anime',
  manga: 'swipe_queue_manga',
  movie: 'swipe_queue_movie',
  tv: 'swipe_queue_tv',
  game: 'swipe_queue_game',
  boardgame: 'swipe_queue_boardgame',
}

function rowToSwipeItem(row: any): SwipeItem {
  return {
    id: row.external_id,
    title: row.title,
    type: row.type as SwipeItem['type'],
    coverImage: row.cover_image,
    year: row.year,
    genres: row.genres || [],
    score: row.score,
    description: row.description,
    why: row.why,
    matchScore: row.match_score || 0,
    episodes: row.episodes,
    authors: row.authors,
    developers: row.developers,
    platforms: row.platforms,
    isAwardWinner: row.is_award_winner,
    isDiscovery: row.is_discovery,
    source: row.source,
  }
}

function toQueueRow(r: any, userId: string) {
  return {
    user_id: userId,
    external_id: r.id,
    title: r.title,
    type: r.type,
    cover_image: r.coverImage || r.cover_image,
    year: r.year,
    genres: r.genres || [],
    score: r.score ?? null,
    description: r.description ?? null,
    why: r.why ?? null,
    match_score: r.matchScore || 0,
    episodes: r.episodes ?? null,
    authors: r.authors || [],
    developers: r.developers || [],
    platforms: r.platforms || [],
    is_award_winner: r.isAwardWinner || false,
    is_discovery: r.isDiscovery || false,
    source: r.source ?? null,
  }
}

export default function SwipePage() {
  const supabase = createClient()
  const router = useRouter()
  const addedTitlesRef = useRef<Set<string>>(new Set())
  const [initialItems, setInitialItems] = useState<SwipeItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Load library titles for dedup
      const { data: entries } = await supabase
        .from('user_media_entries')
        .select('title')
        .eq('user_id', user.id)
      for (const e of entries || []) {
        if (e.title) addedTitlesRef.current.add((e.title as string).toLowerCase())
      }

      // Load skipped IDs
      const { data: skippedRows } = await supabase
        .from('swipe_skipped')
        .select('external_id')
        .eq('user_id', user.id)
      const skippedSet = new Set((skippedRows || []).map((r: any) => r.external_id as string))

      // Try loading from existing queue first
      const { data: queueRows } = await supabase
        .from('swipe_queue_all')
        .select('*')
        .eq('user_id', user.id)
        .order('inserted_at', { ascending: true })

      const existingRows = (queueRows || []).filter((r: any) => !skippedSet.has(r.external_id))

      if (existingRows.length >= 10) {
        setInitialItems(existingRows.map(rowToSwipeItem))
        setLoading(false)
        return
      }

      // Not enough in queue — fetch from recommendations API
      try {
        const res = await fetch('/api/recommendations?type=all')
        if (res.ok) {
          const json = await res.json()
          const freshRecs = (Object.values(json.recommendations || {}) as any[][]).flat()
          const existingIds = new Set(existingRows.map((r: any) => r.external_id as string))
          const validTypes = ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']
          const newRecs = freshRecs.filter((r: any) =>
            validTypes.includes(r.type) &&
            !skippedSet.has(r.id) &&
            !existingIds.has(r.id) &&
            !addedTitlesRef.current.has((r.title as string)?.toLowerCase())
          ).slice(0, 50 - existingRows.length)

          if (newRecs.length > 0) {
            const rows = newRecs.map((r: any) => toQueueRow(r, user.id))
            await supabase.from('swipe_queue_all').upsert(rows, { onConflict: 'user_id,external_id' })
            for (const type of validTypes) {
              const typed = rows.filter((r: any) => r.type === type)
              if (typed.length > 0) {
                await supabase.from(`swipe_queue_${type}`).upsert(typed, { onConflict: 'user_id,external_id' })
              }
            }
          }

          setInitialItems([
            ...existingRows.map(rowToSwipeItem),
            ...newRecs.map((r: any) => ({
              id: r.id, title: r.title, type: r.type as SwipeItem['type'],
              coverImage: r.coverImage, year: r.year, genres: r.genres || [],
              score: r.score, description: r.description, why: r.why,
              matchScore: r.matchScore || 0, episodes: r.episodes,
              authors: r.authors, developers: r.developers,
              platforms: r.platforms, isAwardWinner: r.isAwardWinner,
              isDiscovery: r.isDiscovery, source: r.source,
            }))
          ])
        }
      } catch {}

      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line

  const removeFromPool = useCallback(async (userId: string, externalId: string) => {
    const { data: poolRows } = await supabase
      .from('recommendations_pool')
      .select('media_type, data')
      .eq('user_id', userId)
    if (!poolRows) return
    const updates = poolRows
      .map(row => {
        const filtered = (row.data as any[]).filter((r: any) => r.id !== externalId)
        if (filtered.length === (row.data as any[]).length) return null
        return { media_type: row.media_type, data: filtered }
      })
      .filter(Boolean)
    for (const upd of updates) {
      supabase.from('recommendations_pool')
        .update({ data: upd!.data })
        .eq('user_id', userId)
        .eq('media_type', upd!.media_type)
        .then(() => {})
    }
  }, [supabase])

  const handleSwipeSeen = useCallback(async (item: SwipeItem, rating: number | null, skipPersist = false) => {
    if (!skipPersist && addedTitlesRef.current.has(item.title.toLowerCase())) {
      showToast(`"${item.title}" è già nella tua libreria`)
      return
    }

    showToast(`"${item.title}" aggiunto${rating ? ` · ${rating}★` : ''}`)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (skipPersist) {
      removeFromPool(user.id, item.id)
      fetch('/api/recommendations/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action: 'added' })
      }).catch(() => {})
      return
    }

    const isBoardgame = item.type === 'boardgame'
    const bggAchievementData = isBoardgame && ((item as any).complexity != null || (item as any).min_players != null || (item as any).playing_time != null)
      ? { bgg: { score: (item as any).score ?? null, complexity: (item as any).complexity ?? null, min_players: (item as any).min_players ?? null, max_players: (item as any).max_players ?? null, playing_time: (item as any).playing_time ?? null } }
      : null
    const insertData: any = {
      user_id: user.id, external_id: item.id, title: item.title,
      type: item.type, cover_image: item.coverImage, genres: item.genres,
      tags: isBoardgame ? ((item as any).mechanics || []) : [],
      authors: isBoardgame ? ((item as any).designers || []) : [],
      ...(bggAchievementData ? { achievement_data: bggAchievementData } : {}),
      status: 'completed',
    }
    if (rating !== null) insertData.rating = rating

    supabase.from('user_media_entries').upsert(insertData, { onConflict: 'user_id,external_id' }).then(({ error }) => {
      if (!error) addedTitlesRef.current.add(item.title.toLowerCase())
      fetch('/api/recommendations/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action: 'added' })
      }).catch(() => {})
      fetch('/api/recommendations?invalidateCache=true', { method: 'POST', keepalive: true }).catch(() => {})
    })

    removeFromPool(user.id, item.id)
    if (item.genres.length > 0) {
      triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: 'completed' })
      if (rating) triggerTasteDelta({ action: 'rating', mediaId: item.id, mediaType: item.type, genres: item.genres, rating })
    }
  }, [supabase, removeFromPool])

  const handleSwipeSkip = useCallback((_item: SwipeItem) => {
    // SwipeMode handles persistence itself via persistSkipped
  }, [])

  const handleSwipeRequestMore = useCallback(async (filter: string = 'all'): Promise<SwipeItem[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const table = QUEUE_TABLE_MAP[filter] ?? 'swipe_queue_all'
    const TARGET = 50
    const REFILL_TRIGGER = 20

    const { data: skippedRows } = await supabase
      .from('swipe_skipped')
      .select('external_id')
      .eq('user_id', user.id)
    const skippedSet = new Set((skippedRows || []).map((r: any) => r.external_id as string))

    const { data: queueRows } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', user.id)
      .order('inserted_at', { ascending: true })
    const existingRows = (queueRows || []).filter((r: any) => !skippedSet.has(r.external_id))
    const existingIds = new Set(existingRows.map((r: any) => r.external_id as string))

    if (existingRows.length >= REFILL_TRIGGER) {
      return existingRows.map(rowToSwipeItem)
    }

    try {
      const apiFilter = filter === 'all' ? 'all' : filter
      const res = await fetch(`/api/recommendations?type=${apiFilter}&refresh=1`)
      if (!res.ok) return existingRows.map(rowToSwipeItem)
      const json = await res.json()

      let freshRecs: any[] = []
      if (filter === 'all') {
        freshRecs = (Object.values(json.recommendations || {}) as any[][]).flat()
      } else {
        const typed = (json.recommendations?.[filter] || []) as any[]
        freshRecs = typed.length > 0
          ? typed
          : (Object.values(json.recommendations || {}) as any[][]).flat().filter((r: any) => r.type === filter)
      }

      const validTypes = ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']
      const newRecs = freshRecs.filter((r: any) =>
        validTypes.includes(r.type) &&
        !skippedSet.has(r.id) &&
        !existingIds.has(r.id) &&
        !addedTitlesRef.current.has((r.title as string)?.toLowerCase())
      ).slice(0, TARGET - existingRows.length)

      if (newRecs.length > 0) {
        const rows = newRecs.map((r: any) => toQueueRow(r, user.id))
        await supabase.from(table).upsert(rows, { onConflict: 'user_id,external_id' })
      }

      return [
        ...existingRows.map(rowToSwipeItem),
        ...newRecs.map((r: any) => ({
          id: r.id, title: r.title, type: r.type as SwipeItem['type'],
          coverImage: r.coverImage, year: r.year, genres: r.genres || [],
          score: r.score, description: r.description, why: r.why,
          matchScore: r.matchScore || 0, episodes: r.episodes,
          authors: r.authors, developers: r.developers,
          platforms: r.platforms, isAwardWinner: r.isAwardWinner,
          isDiscovery: r.isDiscovery, source: r.source,
        }))
      ]
    } catch {
      return existingRows.map(rowToSwipeItem)
    }
  }, [supabase])

  // Spacer desktop: la navbar è fixed top-0 (~68px), va compensata con uno spacer
  // Spacer mobile: la navbar è fixed bottom-0 (49px + safe-area)
  // Si usano div separati invece di padding sul container così non si sommano
  const DesktopNavSpacer = () => <div className="hidden md:block flex-shrink-0" style={{ height: '68px' }} />
  const MobileNavSpacer = () => (
    <div className="md:hidden flex-shrink-0" style={{ height: 'calc(49px + env(safe-area-inset-bottom, 0px))' }} />
  )

  if (loading) {
    return (
      <div className="bg-black flex flex-col" style={{ height: '100dvh' }}>
        <DesktopNavSpacer />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative">
              <div className="absolute inset-0 w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 blur-xl" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-violet-900/50">
                <Shuffle size={28} className="text-white" />
              </div>
            </div>
            <div>
              <p className="text-white font-semibold">Preparazione Swipe</p>
              <p className="text-zinc-500 text-sm mt-1">Sto cercando i titoli migliori per te…</p>
            </div>
          </div>
        </div>
        <MobileNavSpacer />
      </div>
    )
  }

  return (
    <div className="bg-black flex flex-col" style={{ height: '100dvh' }}>
      <DesktopNavSpacer />
      <SwipeMode
        standalone
        items={initialItems}
        onSeen={handleSwipeSeen}
        onSkip={handleSwipeSkip}
        onRequestMore={handleSwipeRequestMore}
        onClose={() => {}}
      />
      <MobileNavSpacer />
    </div>
  )
}
