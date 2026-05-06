import type { CSSProperties } from 'react'

export type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  anime: 'Anime',
  manga: 'Manga',
  movie: 'Film',
  tv: 'Serie TV',
  game: 'Videogiochi',
  boardgame: 'Giochi da tavolo',
}

export const MEDIA_TYPE_COLORS: Record<MediaType, string> = {
  anime: 'var(--type-anime)',
  manga: 'var(--type-manga)',
  movie: 'var(--type-movie)',
  tv: 'var(--type-tv)',
  game: 'var(--type-game)',
  boardgame: 'var(--type-board)',
}

export function normalizeMediaType(type?: string | null): MediaType | null {
  if (!type) return null
  if (type === 'board') return 'boardgame'
  if (type === 'series') return 'tv'
  if (type in MEDIA_TYPE_LABELS) return type as MediaType
  return null
}

export function getMediaTypeLabel(type?: string | null): string {
  const normalized = normalizeMediaType(type)
  return normalized ? MEDIA_TYPE_LABELS[normalized] : (type || 'Media')
}

export function getMediaTypeColor(type?: string | null): string {
  const normalized = normalizeMediaType(type)
  return normalized ? MEDIA_TYPE_COLORS[normalized] : 'var(--text-muted)'
}

export function getMediaTypeAccentStyle(type?: string | null): CSSProperties {
  const color = getMediaTypeColor(type)
  return {
    '--media-color': color,
  } as CSSProperties
}
