import { logger } from '@/lib/logger'
import { normalizeMediaCore } from '@/lib/mediaSanitizer'

export const SWIPE_QUEUE_TYPES = ['all', 'anime', 'manga', 'movie', 'tv', 'game', 'boardgame'] as const
export type SwipeQueueType = typeof SWIPE_QUEUE_TYPES[number]

const TYPED_QUEUE_TYPES = SWIPE_QUEUE_TYPES.filter(type => type !== 'all') as Exclude<SwipeQueueType, 'all'>[]
const QUEUE_TABLE: Record<SwipeQueueType, string> = {
  all: 'swipe_queue_all',
  anime: 'swipe_queue_anime',
  manga: 'swipe_queue_manga',
  movie: 'swipe_queue_movie',
  tv: 'swipe_queue_tv',
  game: 'swipe_queue_game',
  boardgame: 'swipe_queue_boardgame',
}
const inFlightRefills = new Map<string, Promise<RefillResult>>()

type SupabaseLike = {
  from: (table: string) => any
}

type RefillOptions = {
  supabase: SupabaseLike
  userId: string
  queue: SwipeQueueType
  origin: string
  locale?: 'it' | 'en'
  threshold?: number
  target?: number
}

type RefillResult = {
  queue: SwipeQueueType
  before: number
  inserted: number
  after: number
  skipped?: boolean
  needed?: number
  candidates?: number
  picked?: number
  mirrored?: number
  cursorsChecked?: number
}

type FetchCandidatesResult = {
  candidates: any[]
  cursorsChecked: number
}

function isActiveQueueRow(row: any, skippedIds: Set<string>, ownedIds: Set<string>, ownedTitles: Set<string>) {
  return !skippedIds.has(String(row?.external_id || ''))
    && !ownedIds.has(String(row?.external_id || ''))
    && !ownedTitles.has(String(row?.title || '').toLowerCase())
}

function cleanString(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

function validQueue(value: unknown): value is SwipeQueueType {
  return typeof value === 'string' && (SWIPE_QUEUE_TYPES as readonly string[]).includes(value)
}

function hasGoodCover(item: any) {
  const cover = cleanString(item?.coverImage || item?.cover_image || item?.localized?.it?.coverImage || item?.localized?.en?.coverImage, 1000)
  if (!cover) return false
  const lower = cover.toLowerCase()
  return !lower.includes('placeholder') && !lower.includes('no-image') && !lower.includes('n/a')
}

function isLikelyTrash(item: any) {
  const title = cleanString(item?.title || item?.title_en || item?.title_it || item?.title_original)?.toLowerCase() || ''
  if (!title) return true
  const blocked = ['soundtrack', 'artbook', 'demo', 'dedicated server', 'sdk', 'trailer', 'wallpaper', 'upgrade', 'starter pack']
  if (blocked.some(bit => title.includes(bit))) return true
  const score = Number(item?.score)
  if (Number.isFinite(score) && score > 0) {
    const normalized = score > 10 ? score / 20 : score
    if (normalized < 3.1) return true
  }
  return false
}

function toQueueRow(raw: any, userId: string, index: number) {
  const core = normalizeMediaCore({
    ...raw,
    id: raw?.id || raw?.external_id,
    cover_image: raw?.cover_image || raw?.coverImage,
    match_score: raw?.match_score ?? raw?.matchScore,
  })
  if (!core) return null

  const localized = raw?.localized && typeof raw.localized === 'object' ? raw.localized : {}
  return {
    user_id: userId,
    ...core,
    title_original: raw?.title_original ?? raw?.titleOriginal ?? core.title,
    title_en: raw?.title_en ?? raw?.titleEn ?? localized?.en?.title ?? null,
    title_it: raw?.title_it ?? raw?.titleIt ?? localized?.it?.title ?? null,
    description_en: raw?.description_en ?? raw?.descriptionEn ?? localized?.en?.description ?? null,
    description_it: raw?.description_it ?? raw?.descriptionIt ?? localized?.it?.description ?? null,
    localized,
    is_award_winner: raw?.is_award_winner === true || raw?.isAwardWinner === true,
    is_discovery: true,
    inserted_at: new Date(Date.now() + index).toISOString(),
  }
}

function compactQueueRow(row: any) {
  return {
    user_id: row.user_id,
    external_id: row.external_id,
    title: row.title,
    type: row.type,
    cover_image: row.cover_image,
    genres: row.genres,
    year: row.year,
    score: row.score,
    episodes: row.episodes,
    match_score: row.match_score,
    why: row.why,
    source: row.source,
    inserted_at: row.inserted_at,
  }
}

async function upsertRows(supabase: SupabaseLike, table: string, rows: any[]) {
  if (rows.length === 0) return { inserted: 0, degraded: false }
  const full = await supabase.from(table).upsert(rows, { onConflict: 'user_id,external_id' })
  if (!full.error) return { inserted: rows.length, degraded: false }

  const compact = await supabase.from(table).upsert(rows.map(compactQueueRow), { onConflict: 'user_id,external_id' })
  if (!compact.error) return { inserted: rows.length, degraded: true }

  logger.warn('swipe.refill', 'queue upsert failed', { table, error: compact.error })
  return { inserted: 0, degraded: true }
}

async function loadExistingContext(supabase: SupabaseLike, userId: string, queue: SwipeQueueType) {
  const table = QUEUE_TABLE[queue]
  const [{ data: queueRows }, { data: skippedRows }, { data: ownedRows }] = await Promise.all([
    supabase.from(table).select('external_id,title,type').eq('user_id', userId).order('inserted_at', { ascending: true }),
    supabase.from('swipe_skipped').select('external_id').eq('user_id', userId),
    supabase.from('user_media_entries').select('external_id,title').eq('user_id', userId),
  ])

  const skippedIds = new Set<string>((skippedRows || []).map((row: any) => String(row.external_id || '')).filter(Boolean))
  const ownedIds = new Set<string>((ownedRows || []).map((row: any) => String(row.external_id || '')).filter(Boolean))
  const ownedTitles = new Set<string>((ownedRows || []).map((row: any) => String(row.title || '').toLowerCase()).filter(Boolean))
  const activeRows = (queueRows || []).filter((row: any) => isActiveQueueRow(row, skippedIds, ownedIds, ownedTitles))
  const existingIds = new Set(activeRows.map((row: any) => String(row.external_id || '')).filter(Boolean))
  return { activeRows, existingIds, skippedIds, ownedIds, ownedTitles }
}

async function rebuildAllQueueFromTyped(options: RefillOptions, before: number): Promise<RefillResult> {
  const target = options.target ?? 50
  const [{ data: skippedRows }, { data: ownedRows }, ...typedResults] = await Promise.all([
    options.supabase.from('swipe_skipped').select('external_id').eq('user_id', options.userId),
    options.supabase.from('user_media_entries').select('external_id,title').eq('user_id', options.userId),
    ...TYPED_QUEUE_TYPES.map(type =>
      options.supabase
        .from(QUEUE_TABLE[type])
        .select('*')
        .eq('user_id', options.userId)
        .order('inserted_at', { ascending: true })
        .limit(target),
    ),
  ])

  const skippedIds = new Set<string>((skippedRows || []).map((row: any) => String(row.external_id || '')).filter(Boolean))
  const ownedIds = new Set<string>((ownedRows || []).map((row: any) => String(row.external_id || '')).filter(Boolean))
  const ownedTitles = new Set<string>((ownedRows || []).map((row: any) => String(row.title || '').toLowerCase()).filter(Boolean))
  const byType = new Map<Exclude<SwipeQueueType, 'all'>, any[]>()

  typedResults.forEach((result: any, index: number) => {
    const type = TYPED_QUEUE_TYPES[index]
    byType.set(
      type,
      (result?.data || [])
        .filter((row: any) => isActiveQueueRow(row, skippedIds, ownedIds, ownedTitles))
        .slice(0, target),
    )
  })

  const rows: any[] = []
  const seen = new Set<string>()
  while (rows.length < target * TYPED_QUEUE_TYPES.length) {
    let added = false
    for (const type of TYPED_QUEUE_TYPES) {
      const next = byType.get(type)?.shift()
      if (!next) continue
      const id = String(next.external_id || '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      rows.push({
        ...next,
        user_id: options.userId,
        inserted_at: new Date(Date.now() + rows.length).toISOString(),
      })
      added = true
    }
    if (!added) break
  }

  const result = await upsertRows(options.supabase, QUEUE_TABLE.all, rows)
  return {
    queue: 'all',
    before,
    needed: Math.max(0, target * TYPED_QUEUE_TYPES.length - before),
    candidates: rows.length,
    picked: rows.length,
    inserted: result.inserted,
    after: rows.length,
  }
}

async function fetchCandidateWindow(
  origin: string,
  queue: SwipeQueueType,
  locale: 'it' | 'en',
  startCursor: number,
  cursorCount: number,
  seen: Set<string>,
): Promise<FetchCandidatesResult> {
  const section = queue === 'all' ? 'all' : queue
  const candidates: any[] = []
  let cursorsChecked = 0

  for (let cursor = startCursor; cursor < startCursor + cursorCount; cursor++) {
    cursorsChecked++
    const res = await fetch(`${origin}/api/trending?section=${section}&lang=${locale}&cursor=${cursor}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null)
    if (!res?.ok) continue
    const payload = await res.json().catch(() => null)
    const pageItems = queue === 'all'
      ? Object.values(payload || {}).flat() as any[]
      : Array.isArray(payload) ? payload : []

    for (const item of pageItems) {
      const id = String(item?.id || item?.external_id || '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      candidates.push(item)
    }
  }

  return { candidates, cursorsChecked }
}

async function gatherEnoughCandidates(
  origin: string,
  queue: SwipeQueueType,
  locale: 'it' | 'en',
  startCursor: number,
  existing: Awaited<ReturnType<typeof loadExistingContext>>,
  needed: number,
) {
  const allCandidates: any[] = []
  const seen = new Set<string>()
  let cursorsChecked = 0
  let picked: any[] = []

  // Go deeper when a user has skipped a lot. Keep a cap so a single refill stays
  // cheap on free plans and does not hammer external APIs.
  const maxCursorWindows = queue === 'boardgame' ? 8 : 5
  const cursorWindowSize = queue === 'boardgame' ? 3 : 4

  for (let windowIndex = 0; windowIndex < maxCursorWindows; windowIndex++) {
    const windowStart = startCursor + windowIndex * cursorWindowSize
    const result = await fetchCandidateWindow(origin, queue, locale, windowStart, cursorWindowSize, seen)
    cursorsChecked += result.cursorsChecked
    allCandidates.push(...result.candidates)
    picked = pickCandidates(allCandidates, queue, existing, needed)
    if (picked.length >= needed) break
    if (result.candidates.length === 0 && windowIndex >= 1) break
  }

  return {
    candidates: allCandidates,
    picked,
    cursorsChecked,
  }
}

function pickCandidates(candidates: any[], queue: SwipeQueueType, existing: Awaited<ReturnType<typeof loadExistingContext>>, limit: number) {
  const seen = new Set<string>()
  const clean = candidates
    .filter((item: any) => queue === 'all' || item?.type === queue)
    .filter((item: any) => {
      const id = String(item?.id || item?.external_id || '')
      const title = String(item?.title || '').toLowerCase()
      if (!id || seen.has(id)) return false
      seen.add(id)
      return hasGoodCover(item)
        && !isLikelyTrash(item)
        && !existing.existingIds.has(id)
        && !existing.skippedIds.has(id)
        && !existing.ownedIds.has(id)
        && !existing.ownedTitles.has(title)
    })

  if (queue !== 'all') return clean.slice(0, limit)

  const buckets = new Map<string, any[]>()
  for (const type of TYPED_QUEUE_TYPES) buckets.set(type, [])
  for (const item of clean) if (buckets.has(item.type)) buckets.get(item.type)!.push(item)

  const counts = new Map<string, number>()
  for (const type of TYPED_QUEUE_TYPES) counts.set(type, existing.activeRows.filter((row: any) => row.type === type).length)
  const out: any[] = []
  while (out.length < limit) {
    const nextType = [...TYPED_QUEUE_TYPES]
      .filter(type => (buckets.get(type)?.length || 0) > 0)
      .sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0))[0]
    if (!nextType) break
    const next = buckets.get(nextType)!.shift()
    if (!next) break
    out.push(next)
    counts.set(nextType, (counts.get(nextType) || 0) + 1)
  }
  return out
}

async function runSwipeQueueRefill(options: RefillOptions): Promise<RefillResult> {
  const queue = validQueue(options.queue) ? options.queue : 'all'
  const threshold = options.threshold ?? 20
  const target = options.target ?? 50
  const locale = options.locale || 'it'
  const existing = await loadExistingContext(options.supabase, options.userId, queue)

  if (queue === 'all') {
    for (const type of TYPED_QUEUE_TYPES) {
      await ensureSwipeQueueRefill({ ...options, queue: type, threshold: target - 1, target })
    }
    return rebuildAllQueueFromTyped(options, existing.activeRows.length)
  }

  if (existing.activeRows.length > threshold) {
    return { queue, before: existing.activeRows.length, inserted: 0, after: existing.activeRows.length, skipped: true }
  }

  const needed = Math.max(0, target - existing.activeRows.length)
  if (needed === 0) return { queue, before: existing.activeRows.length, inserted: 0, after: existing.activeRows.length, skipped: true }

  const startCursor = Math.floor((existing.skippedIds.size + existing.ownedIds.size) / 45)
  const { candidates, picked, cursorsChecked } = await gatherEnoughCandidates(options.origin, queue, locale, startCursor, existing, needed)
  const rows = picked.map((item, index) => toQueueRow(item, options.userId, index)).filter(Boolean)
  const primary = await upsertRows(options.supabase, QUEUE_TABLE[queue], rows)

  return {
    queue,
    before: existing.activeRows.length,
    needed,
    candidates: candidates.length,
    picked: rows.length,
    cursorsChecked,
    inserted: primary.inserted,
    after: existing.activeRows.length + primary.inserted,
  }
}

export async function ensureSwipeQueueRefill(options: RefillOptions) {
  const queue = validQueue(options.queue) ? options.queue : 'all'
  const key = `${options.userId}:${queue}`
  const current = inFlightRefills.get(key)
  if (current) return current

  const refill = runSwipeQueueRefill({ ...options, queue })
    .finally(() => {
      inFlightRefills.delete(key)
    })
  inFlightRefills.set(key, refill)
  return refill
}

export async function ensureAllSwipeQueuesForUser(options: Omit<RefillOptions, 'queue'>) {
  const results = []
  for (const queue of SWIPE_QUEUE_TYPES) {
    results.push(await ensureSwipeQueueRefill({ ...options, queue }))
  }
  return results
}
