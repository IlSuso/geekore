'use client'
// DESTINAZIONE: src/components/media/MediaDetailsDrawer.tsx
// V3: salva studios/directors/authors in user_media_entries + taste delta real-time + wishlist genres

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import {
  X, ExternalLink, Star, Clock, Users, Layers,
  Gamepad2, BookOpen, Film, Tv, Dices, Clapperboard, Check, Bookmark,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { StarRating } from '@/components/ui/StarRating'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface MediaDetails {
  id: string
  title: string
  title_en?: string  // titolo inglese per switch lingua real-time
  type: string
  coverImage?: string
  year?: number
  episodes?: number
  totalSeasons?: number
  seasons?: Record<number, { episode_count: number }>
  description?: string
  genres?: string[]
  source?: string
  min_players?: number
  max_players?: number
  playing_time?: number
  complexity?: number
  bgg_rating?: number
  mechanics?: string[]
  designers?: string[]
  developers?: string[]
  themes?: string[]
  score?: number
  externalUrl?: string
  // V3: creator fields (da AniList/IGDB search)
  studios?: string[]
  directors?: string[]
  authors?: string[]
  relations?: Array<{
    relationType: string; id: string; type: string
    title: string; coverImage?: string; year?: number; genres: string[]
  }>
}

interface MediaDetailsDrawerProps {
  media: MediaDetails | null
  onClose: () => void
  isOwner?: boolean
  onAdd?: (media: MediaDetails) => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildExternalUrl(media: MediaDetails): string | undefined {
  if (media.externalUrl) return media.externalUrl
  const id = media.id
  if (id.startsWith('anilist-anime-')) return `https://anilist.co/anime/${id.replace('anilist-anime-', '')}`
  if (id.startsWith('anilist-manga-') || id.startsWith('anilist-novel-')) return `https://anilist.co/manga/${id.replace(/anilist-(manga|novel)-/, '')}`
  if (media.source === 'tmdb' && media.type === 'movie') return `https://www.themoviedb.org/movie/${id}`
  if (media.source === 'tmdb' && media.type === 'tv') return `https://www.themoviedb.org/tv/${id}`
  if (media.source === 'igdb') return `https://www.igdb.com/games/${id}`
  if (media.source === 'bgg') return `https://boardgamegeek.com/boardgame/${id}`
  return undefined
}

// V3: fire-and-forget taste delta
function triggerTasteDelta(options: {
  action: 'rating' | 'status_change' | 'wishlist_add'
  mediaId: string; mediaType: string; genres: string[]
  rating?: number; status?: string
}) {
  fetch('/api/taste/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  }).catch(() => {})
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: BookOpen, game: Gamepad2,
  tv: Tv, movie: Film, boardgame: Dices,
}
const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500', manga: 'bg-orange-500', game: 'bg-green-500',
  tv: 'bg-purple-500', movie: 'bg-red-500', boardgame: 'bg-yellow-500',
}
const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Board Game',
}

const RELATION_LABEL: Record<string, string> = {
  SEQUEL: 'Sequel', PREQUEL: 'Prequel', SIDE_STORY: 'Side story',
  SPIN_OFF: 'Spin-off', ALTERNATIVE: 'Alternativo',
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function UserDataSkeleton() {
  return (
    <div className="animate-pulse space-y-3 pt-2">
      <div className="space-y-2">
        <div className="h-3 bg-zinc-800 rounded-full w-24" />
        <div className="h-2 bg-zinc-800 rounded-full" />
        <div className="h-3 bg-zinc-800 rounded-full w-16" />
      </div>
      <div className="h-12 bg-zinc-800 rounded-2xl" />
      <div className="h-10 bg-zinc-800 rounded-2xl" />
    </div>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function MediaDetailsDrawer({ media, onClose, isOwner, onAdd }: MediaDetailsDrawerProps) {
  const [inCollection, setInCollection] = useState(false)
  const [inWishlist, setInWishlist] = useState(false)
  const [checkDone, setCheckDone] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formRating, setFormRating] = useState<number>(0)
  const [formEpisode, setFormEpisode] = useState<string>('0')
  const [formSeason, setFormSeason] = useState<string>('1')
  const [formEpisodeError, setFormEpisodeError] = useState<string | null>(null)
  const [formSeasonError, setFormSeasonError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (media) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [media])

  // Reset form quando cambia media
  useEffect(() => {
    setShowAddForm(false)
    setFormRating(0)
    setFormEpisode('0')
    setFormSeason('1')
    setFormEpisodeError(null)
    setFormSeasonError(null)
  }, [media?.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!media) { setCheckDone(false); return }
    setCheckDone(false)
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCheckDone(true); return }
      const [{ data: col }, { data: wish }] = await Promise.all([
        supabase.from('user_media_entries').select('id').eq('user_id', user.id).eq('external_id', media.id).maybeSingle(),
        supabase.from('wishlist').select('id').eq('user_id', user.id).eq('external_id', media.id).maybeSingle(),
      ])
      setInCollection(!!col)
      setInWishlist(!!wish)
      setCheckDone(true)
    }
    check()
  }, [media?.id])

  const handleAddToCollection = useCallback(async (opts?: { rating?: number; episode?: number; season?: number }) => {
    if (!media) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const isMovie = media.type === 'movie'

    // Calcola il massimo episodi per la stagione selezionata (o totale se non ha stagioni)
    const seasonNum = opts?.season ?? 1
    const maxEpThisSeason = media.seasons?.[seasonNum]?.episode_count ?? media.episodes ?? null
    const maxSeasons = media.totalSeasons ?? (media.seasons ? Object.keys(media.seasons).length : null)

    // Auto-completed: film sempre, oppure se ha indicato l'ultimo episodio dell'ultima stagione
    const isLastSeason = !maxSeasons || seasonNum >= maxSeasons
    const isLastEpisode = maxEpThisSeason !== null && opts?.episode !== undefined && opts.episode >= maxEpThisSeason
    const autoCompleted = isMovie || (isLastSeason && isLastEpisode)

    const status = autoCompleted ? 'completed' : 'watching'

    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id,
      external_id: media.id,
      title: media.title,
      title_en: media.title_en || media.title,  // salva titolo EN per switch lingua
      type: media.type,
      cover_image: media.coverImage,
      genres: media.genres || [],
      status,
      current_episode: opts?.episode ?? (isMovie ? null : 0),
      current_season: opts?.season ?? null,
      episodes: media.episodes ?? null,
      season_episodes: media.seasons ?? null,
      rating: opts?.rating ?? null,
      // V3: creator data
      studios: media.studios || [],
      directors: media.directors || [],
      authors: media.authors || [],
      developer: media.developers?.[0] || null,
      display_order: Date.now() + Math.round((opts?.rating ?? 0) * 1_000_000),
    })
    if (!error) {
      setInCollection(true)
      setShowAddForm(false)
      showToast(`"${media.title}" aggiunto alla collezione`)
      onAdd?.(media)

      if ((media.genres || []).length > 0) {
        triggerTasteDelta({
          action: 'status_change',
          mediaId: media.id,
          mediaType: media.type,
          genres: media.genres || [],
          status,
        })
        if (opts?.rating) {
          triggerTasteDelta({
            action: 'rating',
            mediaId: media.id,
            mediaType: media.type,
            genres: media.genres || [],
            rating: opts.rating,
          })
        }
      }
    }
  }, [media, onAdd])

  const handleToggleWishlist = useCallback(async () => {
    if (!media) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (inWishlist) {
      await supabase.from('wishlist').delete().eq('user_id', user.id).eq('external_id', media.id)
      setInWishlist(false)
      showToast('Rimosso dalla wishlist')
    } else {
      await supabase.from('wishlist').upsert({
        user_id: user.id, external_id: media.id,
        title: media.title, title_en: media.title_en || media.title, type: media.type, cover_image: media.coverImage,
        genres: media.genres || [],
        media_type: media.type,
        studios: media.studios || [],
      }, { onConflict: 'user_id,external_id' })
      setInWishlist(true)
      showToast('Aggiunto alla wishlist')

      if ((media.genres || []).length > 0) {
        triggerTasteDelta({
          action: 'wishlist_add',
          mediaId: media.id,
          mediaType: media.type,
          genres: media.genres || [],
        })
      }
    }
  }, [media, inWishlist])

  if (!media) return null

  const Icon = TYPE_ICON[media.type] || Film
  const externalUrl = buildExternalUrl(media)

  const creatorLabel = media.studios?.length
    ? media.studios.slice(0, 2).join(', ')
    : media.directors?.length
    ? media.directors.slice(0, 2).join(', ')
    : media.authors?.length
    ? media.authors.slice(0, 2).join(', ')
    : null

  const continuityRelations = (media.relations || [])
    .filter(r => ['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF'].includes(r.relationType))
    .slice(0, 4)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-x-0 top-16 bottom-0 z-[80] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-16 bottom-0 z-[90] w-full max-w-md bg-zinc-950 border-l border-zinc-800 overflow-y-auto
                   animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal
        aria-label={media.title}
      >
        {/* ── Bottone chiudi — figlio diretto del drawer, sopra tutto ── */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[100] w-9 h-9 bg-black/60 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-black/80 transition"
          aria-label="Chiudi"
        >
          <X size={18} />
        </button>

        {/* Header con cover — layout orizzontale */}
        <div className="relative bg-zinc-900 flex-shrink-0">
          {/* Banner sfocato in background */}
          {media.coverImage && (
            <div className="absolute inset-0 overflow-hidden">
              <Image src={media.coverImage} alt="" fill className="object-cover scale-110 blur-xl opacity-30" aria-hidden unoptimized={media.coverImage.startsWith('data:')} />
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/60 to-zinc-950" />
            </div>
          )}

          {/* Contenuto header */}
          <div className="relative z-10 flex gap-4 p-5 pt-6 pr-14">
            {/* Cover verticale */}
            <div className="flex-shrink-0 w-28 h-40 rounded-2xl overflow-hidden bg-zinc-800 shadow-2xl ring-1 ring-white/10">
              {media.coverImage ? (
                <Image src={media.coverImage} alt={media.title} fill className="object-cover" sizes="112px" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon size={40} className="text-zinc-600" />
                </div>
              )}
            </div>

            {/* Info a destra */}
            <div className="flex-1 min-w-0 flex flex-col justify-end pb-1">
              <span className={`self-start text-[10px] font-bold px-2.5 py-1 rounded-full text-white mb-2 ${TYPE_COLOR[media.type] || 'bg-zinc-700'}`}>
                {TYPE_LABEL[media.type] || media.type}
              </span>
              <h2 className="text-lg font-bold text-white leading-tight">{media.title}</h2>
              <div className="flex flex-col gap-0.5 mt-1.5">
                {media.year && <p className="text-sm text-zinc-400">{media.year}</p>}
                {creatorLabel && (
                  <p className="text-xs text-sky-400 flex items-center gap-1 truncate">
                    <Clapperboard size={10} />{creatorLabel}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contenuto */}
        <div className="p-5 space-y-6">

          {/* Score + stats */}
          <div className="flex flex-wrap gap-3">
            {media.score != null && (
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2">
                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                <span className="text-sm font-bold text-white">{media.score.toFixed(1)}</span>
                <span className="text-xs text-zinc-500">/ 5</span>
              </div>
            )}
            {media.bgg_rating != null && (
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2">
                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                <span className="text-sm font-bold text-white">{media.bgg_rating.toFixed(1)}</span>
                <span className="text-xs text-zinc-500">BGG</span>
              </div>
            )}
            {media.episodes != null && media.episodes > 1 && (
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2">
                <Layers size={14} className="text-zinc-400" />
                <span className="text-sm font-bold text-white">{media.episodes}</span>
                <span className="text-xs text-zinc-500">ep.</span>
              </div>
            )}
            {media.playing_time != null && (
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2">
                <Clock size={14} className="text-zinc-400" />
                <span className="text-sm font-bold text-white">{media.playing_time}</span>
                <span className="text-xs text-zinc-500">min</span>
              </div>
            )}
            {(media.min_players != null || media.max_players != null) && (
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2">
                <Users size={14} className="text-zinc-400" />
                <span className="text-sm font-bold text-white">
                  {media.min_players === media.max_players
                    ? media.min_players
                    : `${media.min_players ?? '?'}–${media.max_players ?? '?'}`}
                </span>
                <span className="text-xs text-zinc-500">giocatori</span>
              </div>
            )}
            {media.complexity != null && (
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2">
                <span className="text-sm font-bold text-white">{media.complexity.toFixed(1)}</span>
                <span className="text-xs text-zinc-500">complessità</span>
              </div>
            )}
          </div>

          {/* Descrizione */}
          {media.description && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Descrizione</h3>
              <p className="text-sm text-zinc-300 leading-relaxed">{media.description}</p>
            </div>
          )}

          {/* Generi */}
          {media.genres && media.genres.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Generi</h3>
              <div className="flex flex-wrap gap-1.5">
                {media.genres.map(g => (
                  <span key={g} className="text-xs bg-violet-500/15 text-violet-300 border border-violet-500/20 px-2.5 py-1 rounded-full">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* V3: Studios / Directors / Authors */}
          {(media.studios?.length || media.directors?.length || media.authors?.length) ? (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Clapperboard size={11} />
                {media.studios?.length ? 'Studio' : media.authors?.length ? 'Autori' : 'Registi'}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(media.studios?.length ? media.studios : media.directors?.length ? media.directors : media.authors || [])
                  .slice(0, 4)
                  .map(name => (
                    <span key={name} className="text-xs bg-sky-500/10 text-sky-300 border border-sky-500/20 px-2.5 py-1 rounded-full">
                      {name}
                    </span>
                  ))
                }
              </div>
            </div>
          ) : null}

          {/* Meccaniche (boardgame) */}
          {media.mechanics && media.mechanics.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Meccaniche</h3>
              <div className="flex flex-wrap gap-1.5">
                {media.mechanics.slice(0, 8).map(m => (
                  <span key={m} className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Temi (game) */}
          {media.themes && media.themes.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Temi</h3>
              <div className="flex flex-wrap gap-1.5">
                {media.themes.slice(0, 6).map(t => (
                  <span key={t} className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Designers / Developers */}
          {(media.designers?.length || media.developers?.length) ? (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                {media.designers?.length ? 'Designer' : 'Sviluppatori'}
              </h3>
              <p className="text-sm text-zinc-300">
                {(media.designers || media.developers || []).slice(0, 3).join(', ')}
              </p>
            </div>
          ) : null}

          {/* V3: Continuity / Relations */}
          {continuityRelations.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
                Nella stessa serie
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                {continuityRelations.map(rel => (
                  <div key={rel.id} className="flex-shrink-0 w-20">
                    <div className="relative h-28 rounded-xl overflow-hidden bg-zinc-800 mb-1.5">
                      {rel.coverImage
                        ? <Image src={rel.coverImage} alt={rel.title} fill className="object-cover" sizes="80px" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center text-zinc-700"><Tv size={36} /></div>
                      }
                      <div className="absolute top-1 left-1 bg-amber-500/90 text-[8px] font-bold px-1 py-0.5 rounded text-white">
                        {RELATION_LABEL[rel.relationType] || rel.relationType}
                      </div>
                    </div>
                    <p className="text-[9px] font-semibold text-zinc-300 line-clamp-2 leading-tight">{rel.title}</p>
                    {rel.year && <p className="text-[8px] text-zinc-600">{rel.year}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="pt-2">
            {!checkDone ? (
              <UserDataSkeleton />
            ) : (
              <div className="flex flex-col gap-3">
                {!inCollection ? (
                  <>
                    {showAddForm ? (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
                        {/* Voto */}
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Il tuo voto (opzionale)</p>
                          <StarRating value={formRating} onChange={setFormRating} size={28} />
                        </div>

                        {/* Stagione */}
                        {(media.type === 'tv' || media.type === 'anime') && (() => {
                          const maxSeasons = media.totalSeasons ?? (media.seasons ? Object.keys(media.seasons).length : null)
                          return (
                            <div>
                              <p className="text-xs text-zinc-500 mb-1">
                                Stagione{maxSeasons ? ` (max ${maxSeasons})` : ''}
                              </p>
                              <input
                                type="number"
                                min={1}
                                max={maxSeasons ?? undefined}
                                value={formSeason}
                                onChange={e => {
                                  const val = e.target.value
                                  setFormSeason(val)
                                  const n = parseInt(val)
                                  if (isNaN(n) || n < 1) {
                                    setFormSeasonError('Minimo 1')
                                  } else if (maxSeasons && n > maxSeasons) {
                                    setFormSeasonError(`Massimo ${maxSeasons}`)
                                  } else {
                                    setFormSeasonError(null)
                                  }
                                  setFormEpisode('0')
                                  setFormEpisodeError(null)
                                }}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-transparent focus:shadow-[0_0_0_2px_rgb(139,92,246)] focus:outline-none"
                              />
                              {formSeasonError && (
                                <p className="text-xs text-red-400 mt-1">{formSeasonError}</p>
                              )}
                            </div>
                          )
                        })()}

                        {/* Episodio/Capitolo */}
                        {media.type !== 'movie' && media.type !== 'boardgame' && (() => {
                          const seasonNum = parseInt(formSeason) || 1
                          const maxEp = media.seasons?.[seasonNum]?.episode_count ?? media.episodes ?? null
                          const label = media.type === 'manga' || media.type === 'novel' ? 'Capitolo corrente' : 'Episodio corrente'
                          return (
                            <div>
                              <p className="text-xs text-zinc-500 mb-1">
                                {label}{maxEp ? ` (max ${maxEp})` : ''}
                              </p>
                              <input
                                type="number"
                                min={0}
                                max={maxEp ?? undefined}
                                value={formEpisode}
                                onChange={e => {
                                  const val = e.target.value
                                  setFormEpisode(val)
                                  const n = parseInt(val)
                                  if (isNaN(n) || n < 0) {
                                    setFormEpisodeError('Il valore non può essere negativo')
                                  } else if (maxEp && n > maxEp) {
                                    setFormEpisodeError(`Massimo ${maxEp}`)
                                  } else {
                                    setFormEpisodeError(null)
                                  }
                                }}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-transparent focus:shadow-[0_0_0_2px_rgb(139,92,246)] focus:outline-none"
                              />
                              {formEpisodeError && (
                                <p className="text-xs text-red-400 mt-1">{formEpisodeError}</p>
                              )}
                            </div>
                          )
                        })()}

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setShowAddForm(false)}
                            className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500 transition-all"
                          >
                            Annulla
                          </button>
                          <button
                            disabled={!!formEpisodeError || !!formSeasonError}
                            onClick={() => handleAddToCollection({
                              rating: formRating || undefined,
                              episode: parseInt(formEpisode) || 0,
                              season: parseInt(formSeason) || 1,
                            })}
                            className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-40"
                          >
                            Conferma
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-white transition-all"
                      >
                        Aggiungi alla collezione
                      </button>
                    )}
                  </>
                ) : (
                  <div className="w-full py-3.5 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl text-emerald-400 font-semibold text-center text-sm flex items-center justify-center gap-2">
                    <Check size={15} /> Nella tua collezione
                  </div>
                )}

                <button
                  onClick={handleToggleWishlist}
                  className={`w-full py-3 rounded-2xl font-medium text-sm border transition-all ${
                    inWishlist
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {inWishlist
                    ? <><Star size={14} className="fill-current" /> Nella wishlist</>
                    : <><Bookmark size={14} /> Aggiungi alla wishlist</>
                  }
                </button>

                {externalUrl && (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-medium text-sm bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all"
                  >
                    <ExternalLink size={14} />
                    Apri su {media.source === 'bgg' ? 'BoardGameGeek' : media.source === 'igdb' ? 'IGDB' : media.source === 'anilist' ? 'AniList' : 'TMDb'}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}