import type { MediaType, UserEntry } from '@/lib/reco/engine-types'
import type { WishlistRawItem } from './inputs'

type OwnedByType = {
  ids: Set<string>
  titles: Set<string>
  tokenSets: Array<Set<string>>
}

const ALL_MEDIA_TYPES: MediaType[] = ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']
const ALWAYS_INCLUDE: MediaType[] = ['boardgame']

function normalizeTitle(t: string) {
  return t.toLowerCase()
    .replace(/^(the|a|an|il|lo|la|i|gli|le|un|uno|una)\s+/i, '')
    .replace(/[^a-z0-9]/g, '')
}

function titleTokens(t: string): Set<string> {
  return new Set(
    t.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 4)
  )
}

function hasTokenOverlap(a: Set<string>, b: Set<string>, threshold = 0.6): boolean {
  if (a.size === 0 || b.size === 0) return false
  let matches = 0
  for (const token of a) if (b.has(token)) matches++
  return matches / Math.min(a.size, b.size) >= threshold
}

export function buildOwnedContext(
  allEntries: UserEntry[],
  wishlistRaw: WishlistRawItem[],
  wishlistItems: UserEntry[],
) {
  const ownedByType = new Map<string, OwnedByType>()

  for (const type of ALL_MEDIA_TYPES) {
    ownedByType.set(type, { ids: new Set(), titles: new Set(), tokenSets: [] })
  }

  for (const e of allEntries) {
    const type = e.type || 'movie'
    const bucket = ownedByType.get(type)
    if (!bucket) continue
    if (e.external_id) bucket.ids.add(e.external_id)
    if (e.appid) bucket.ids.add(String(e.appid))
    if (e.title) {
      bucket.titles.add(normalizeTitle(e.title))
      bucket.tokenSets.push(titleTokens(e.title))
    }
    if (e.title_en) {
      bucket.titles.add(normalizeTitle(e.title_en))
      bucket.tokenSets.push(titleTokens(e.title_en))
    }
  }

  for (const w of wishlistRaw) {
    const type = w.media_type || 'movie'
    const bucket = ownedByType.get(type)
    if (!bucket) continue
    if (w.external_id) bucket.ids.add(w.external_id)
    if (w.title) {
      bucket.titles.add(normalizeTitle(w.title))
      bucket.tokenSets.push(titleTokens(w.title))
    }
  }

  const isAlreadyOwned = (type: string, id: string, title: string): boolean => {
    const bucket = ownedByType.get(type)
    if (!bucket) return false
    if (bucket.ids.has(id)) return true

    const norm = normalizeTitle(title)
    if (norm && bucket.titles.has(norm)) return true

    const tokens = titleTokens(title)
    if (tokens.size >= 2) {
      for (const existing of bucket.tokenSets) {
        if (hasTokenOverlap(tokens, existing)) return true
      }
    }

    return false
  }

  const ownedIds = new Set<string>([
    ...allEntries.map(e => e.external_id).filter((x): x is string => Boolean(x)),
    ...allEntries.map(e => String(e.appid ?? '')).filter(Boolean),
    ...wishlistItems.map(w => w.external_id).filter((x): x is string => Boolean(x)),
  ])

  return { ownedIds, isAlreadyOwned }
}

export function selectTypesToFetch({
  requestedType,
  isOnboardingCall,
  onboardingTypes,
  allEntries,
  wishlistItems,
}: {
  requestedType: string
  isOnboardingCall: boolean
  onboardingTypes?: MediaType[]
  allEntries: UserEntry[]
  wishlistItems: UserEntry[]
}): MediaType[] {
  const allTypesInCollection = new Set<string>([
    ...allEntries.map(e => e.type),
    ...wishlistItems.map(w => w.type),
  ])

  const typesToFetch: MediaType[] = isOnboardingCall
    ? (onboardingTypes && onboardingTypes.length > 0 ? onboardingTypes : ALL_MEDIA_TYPES)
    : ALL_MEDIA_TYPES.filter(t => allTypesInCollection.has(t) || ALWAYS_INCLUDE.includes(t))

  if (requestedType !== 'all' && !typesToFetch.includes(requestedType as MediaType)) {
    typesToFetch.push(requestedType as MediaType)
  }

  return typesToFetch
}
