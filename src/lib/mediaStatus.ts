export type MediaStatus =
  | 'planned'
  | 'watching'
  | 'reading'
  | 'playing'
  | 'in_progress'
  | 'completed'
  | 'paused'
  | 'dropped'
  | 'rewatching'
  | 'rereading'
  | 'replaying'

export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = {
  planned: 'Da iniziare',
  watching: 'In visione',
  reading: 'In lettura',
  playing: 'In gioco',
  in_progress: 'In corso',
  completed: 'Completato',
  paused: 'In pausa',
  dropped: 'Droppato',
  rewatching: 'Rewatch',
  rereading: 'Reread',
  replaying: 'Replay',
}

export const MEDIA_STATUS_COLORS: Record<MediaStatus, string> = {
  planned: 'var(--text-muted)',
  watching: 'var(--type-anime)',
  reading: 'var(--type-manga)',
  playing: 'var(--type-game)',
  in_progress: 'var(--accent)',
  completed: 'var(--type-game)',
  paused: 'var(--type-board)',
  dropped: 'var(--type-movie)',
  rewatching: 'var(--type-tv)',
  rereading: 'var(--type-manga)',
  replaying: 'var(--type-game)',
}

export function normalizeMediaStatus(status?: string | null): MediaStatus | null {
  if (!status) return null
  const normalized = status.toLowerCase().trim().replace(/[-\s]+/g, '_')

  if (normalized === 'plan_to_watch' || normalized === 'plan_to_read' || normalized === 'plan_to_play') return 'planned'
  if (normalized === 'watching') return 'watching'
  if (normalized === 'reading') return 'reading'
  if (normalized === 'playing') return 'playing'
  if (normalized === 'current' || normalized === 'ongoing' || normalized === 'in_progress') return 'in_progress'
  if (normalized === 'complete' || normalized === 'completed' || normalized === 'finished') return 'completed'
  if (normalized === 'pause' || normalized === 'paused' || normalized === 'on_hold') return 'paused'
  if (normalized === 'drop' || normalized === 'dropped') return 'dropped'
  if (normalized === 'rewatching') return 'rewatching'
  if (normalized === 'rereading') return 'rereading'
  if (normalized === 'replaying') return 'replaying'

  return null
}

export function getMediaStatusLabel(status?: string | null): string {
  const normalized = normalizeMediaStatus(status)
  return normalized ? MEDIA_STATUS_LABELS[normalized] : (status || 'Stato')
}

export function getMediaStatusColor(status?: string | null): string {
  const normalized = normalizeMediaStatus(status)
  return normalized ? MEDIA_STATUS_COLORS[normalized] : 'var(--text-muted)'
}
