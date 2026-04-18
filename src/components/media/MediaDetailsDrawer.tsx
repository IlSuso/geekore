'use client'
// DESTINAZIONE: src/components/media/MediaDetailsDrawer.tsx
// V4: layout compatto — header fisso + scroll centrale + footer sticky CTA

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  X, ExternalLink, Star, Clock, Users, Layers,
  Gamepad2, BookOpen, Film, Tv, Clapperboard, Check, Bookmark,
  Sparkles, Trophy, Monitor,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { StarRating } from '@/components/ui/StarRating'
import { translateGenre } from '@/lib/genres'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface MediaDetails {
  id: string
  title: string
  title_en?: string
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
  mechanics?: string[]
  designers?: string[]
  developers?: string[]
  themes?: string[]
  platforms?: string[]
  cast?: string[]
  watchProviders?: string[]
  italianSupportTypes?: string[]
  score?: number
  externalUrl?: string
  why?: string
  matchScore?: number
  isAwardWinner?: boolean
  studios?: string[]
  directors?: string[]
  authors?: string[]
  pageCount?: number
  publisher?: string
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
  if (id.startsWith('tmdb-anime-')) return `https://www.themoviedb.org/tv/${id.replace('tmdb-anime-', '')}`
  if (id.startsWith('anilist-anime-')) return `https://anilist.co/anime/${id.replace('anilist-anime-', '')}`
  if (id.startsWith('anilist-manga-') || id.startsWith('anilist-novel-')) return `https://anilist.co/manga/${id.replace(/anilist-(manga|novel)-/, '')}`
  if (/^\d+$/.test(id)) {
    if (media.type === 'movie') return `https://www.themoviedb.org/movie/${id}`
    if (media.type === 'tv' || media.type === 'anime') return `https://www.themoviedb.org/tv/${id}`
    return undefined // IGDB: no valid URL from numeric ID alone (slug needed)
  }
  if (media.source === 'tmdb' && media.type === 'movie') return `https://www.themoviedb.org/movie/${id}`
  if (media.source === 'tmdb' && media.type === 'tv') return `https://www.themoviedb.org/tv/${id}`
  return undefined
}

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
  anime: Film, manga: Layers, game: Gamepad2,
  tv: Tv, movie: Film, book: BookOpen,
}
const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500', manga: 'bg-orange-500', game: 'bg-green-500',
  tv: 'bg-purple-500', movie: 'bg-red-500', book: 'bg-amber-500',
}
const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco',
  tv: 'Serie TV', movie: 'Film', book: 'Libro',
}

const RELATION_LABEL: Record<string, string> = {
  SEQUEL: 'Sequel', PREQUEL: 'Prequel', SIDE_STORY: 'Side story',
  SPIN_OFF: 'Spin-off', ALTERNATIVE: 'Alternativo',
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
  const [descExpanded, setDescExpanded] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (media) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [media])

  useEffect(() => {
    setShowAddForm(false)
    setFormRating(0)
    setFormEpisode('0')
    setFormSeason('1')
    setFormEpisodeError(null)
    setFormSeasonError(null)
    setDescExpanded(false)
  }, [media?.id])

  useEffect(() => {
    if (showAddForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [showAddForm])

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

    const seasonNum = opts?.season ?? 1
    const maxEpThisSeason = media.seasons?.[seasonNum]?.episode_count ?? media.episodes ?? null
    const maxSeasons = media.totalSeasons ?? (media.seasons ? Object.keys(media.seasons).length : null)

    const isLastSeason = !maxSeasons || seasonNum >= maxSeasons
    const isLastEpisode = maxEpThisSeason !== null && opts?.episode !== undefined && opts.episode >= maxEpThisSeason
    const autoCompleted = isMovie || (isLastSeason && isLastEpisode)

    const status = autoCompleted ? 'completed' : 'watching'

    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id,
      external_id: media.id,
      title: media.title,
      title_en: media.title_en || media.title,
      type: media.type,
      cover_image: media.coverImage,
      genres: media.genres || [],
      status,
      current_episode: opts?.episode ?? (isMovie ? null : 0),
      current_season: opts?.season ?? null,
      episodes: media.episodes ?? null,
      season_episodes: media.seasons ?? null,
      rating: opts?.rating ?? null,
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

  const isManga = media.type === 'manga' || media.type === 'novel'

  const creatorList = isManga
    ? (media.authors?.length ? media.authors : media.developers?.length ? media.developers : media.studios?.length ? media.studios : null)
    : (media.studios?.length ? media.studios : media.directors?.length ? media.directors : media.authors?.length ? media.authors : null)

  const creatorLabel = creatorList?.slice(0, 2).join(', ') ?? null
  const creatorTitle = isManga
    ? (media.authors?.length ? 'Autori' : media.developers?.length ? 'Autori' : 'Editori')
    : (media.studios?.length ? 'Studio' : media.directors?.length ? 'Registi' : media.authors?.length ? 'Autori' : 'Registi')

  const continuityRelations = (media.relations || [])
    .filter(r => ['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF'].includes(r.relationType))
    .slice(0, 4)

  const isLongDesc = (media.description?.length ?? 0) > 200

  const timeLabel = (media.type === 'anime' || media.type === 'tv') ? 'min/ep' : 'min'

  const sourceLabel = (() => {
    const id = media.id
    if (id.startsWith('anilist-')) return 'AniList'
    if (id.startsWith('igdb-')) return 'IGDB'
    return 'TMDb'
  })()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer — flex column: header | scroll | footer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-[200] w-full max-w-md bg-zinc-950 border-l border-zinc-800
                   flex flex-col animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal
        aria-label={media.title}
      >
        {/* Bottone chiudi */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-[100] w-8 h-8 bg-black/60 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-black/80 transition"
          aria-label="Chiudi"
        >
          <X size={16} />
        </button>

        {/* ── HEADER (non scorribile) ────────────────────────────────── */}
        <div className="flex gap-4 p-5 pr-12 border-b border-zinc-800/60 flex-shrink-0">
          {/* Locandina compatta */}
          <div className="flex-shrink-0 w-20 h-28 rounded-xl overflow-hidden bg-zinc-800 shadow-lg ring-1 ring-white/10">
            {media.coverImage ? (
              <img src={media.coverImage} alt={media.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon size={28} className="text-zinc-600" />
              </div>
            )}
          </div>

          {/* Info a destra */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full text-white ${TYPE_COLOR[media.type] || 'bg-zinc-700'}`}>
                {TYPE_LABEL[media.type] || media.type}
              </span>
              {media.isAwardWinner && (
                <span className="flex items-center gap-0.5 text-[9px] bg-amber-500/20 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full">
                  <Trophy size={8} />Acclamato
                </span>
              )}
              {media.matchScore != null && (
                <span className="text-[9px] bg-violet-500/20 border border-violet-500/30 text-violet-300 px-1.5 py-0.5 rounded-full">
                  {media.matchScore}% match
                </span>
              )}
            </div>

            <h2 className="text-base font-bold text-white leading-tight line-clamp-2">{media.title}</h2>

            {/* Stats inline: anno · score · ep · durata · giocatori · complessità */}
            <div className="flex items-center gap-1 flex-wrap">
              {media.year && (
                <span className="text-[10px] text-zinc-400">{media.year}</span>
              )}
              {(media.score != null) && (
                <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5">
                  <Star size={9} className="text-yellow-400 fill-yellow-400" />
                  <span className="text-[10px] font-bold text-white">{media.score!.toFixed(1)}</span>
                </div>
              )}
              {media.episodes != null && media.episodes > 1 && (
                <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5">
                  <Layers size={9} className="text-zinc-400" />
                  <span className="text-[10px] font-bold text-white">{media.episodes}</span>
                  <span className="text-[10px] text-zinc-500">ep.</span>
                </div>
              )}
              {media.playing_time != null && (
                <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5">
                  <Clock size={9} className="text-zinc-400" />
                  <span className="text-[10px] font-bold text-white">{media.playing_time}</span>
                  <span className="text-[10px] text-zinc-500">{timeLabel}</span>
                </div>
              )}
              {(media.min_players != null || media.max_players != null) && (
                <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5">
                  <Users size={9} className="text-zinc-400" />
                  <span className="text-[10px] font-bold text-white">
                    {media.min_players === media.max_players
                      ? media.min_players
                      : `${media.min_players ?? '?'}–${media.max_players ?? '?'}`}
                  </span>
                </div>
              )}
              {media.complexity != null && (
                <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5">
                  <span className="text-[10px] font-bold text-white">{media.complexity.toFixed(1)}</span>
                  <span className="text-[10px] text-zinc-500">cmplx</span>
                </div>
              )}
            </div>

            {creatorLabel && (
              <p className="text-[10px] text-sky-400 flex items-center gap-1 truncate">
                <Clapperboard size={9} />{creatorLabel}
              </p>
            )}
          </div>
        </div>

        {/* ── CONTENUTO SCORREVOLE ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Generi */}
            {media.genres && media.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {media.genres.map(g => (
                  <span key={g} className="text-xs bg-violet-500/15 text-violet-300 border border-violet-500/20 px-2.5 py-1 rounded-full">
                    {translateGenre(g)}
                  </span>
                ))}
              </div>
            )}

            {/* Perché te lo consigliamo */}
            {media.why && (
              <div className="flex gap-2.5 bg-violet-500/8 border border-violet-500/20 rounded-xl p-3.5">
                <Sparkles size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-violet-200 leading-relaxed">{media.why}</p>
              </div>
            )}

            {/* Stats grid */}
            {(() => {
              const cells: JSX.Element[] = []
              if (media.matchScore != null) cells.push(
                <div key="match" className="bg-violet-500/10 border border-violet-500/25 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Match</p>
                  <p className="text-lg font-bold text-violet-300">{media.matchScore}%</p>
                </div>
              )
              if (media.score != null) cells.push(
                <div key="score" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Voto</p>
                  <div className="flex items-center justify-center gap-1">
                    <Star size={11} className="text-yellow-400 fill-yellow-400" />
                    <p className="text-lg font-bold text-white">{(media.score!).toFixed(1)}</p>
                    <span className="text-[10px] text-zinc-600">/5</span>
                  </div>
                </div>
              )
              if (media.year) cells.push(
                <div key="year" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Anno</p>
                  <p className="text-lg font-bold text-white">{media.year}</p>
                </div>
              )
              if (media.episodes != null && media.episodes > 1) cells.push(
                <div key="eps" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">
                    {media.type === 'manga' ? 'Cap.' : 'Ep.'}
                  </p>
                  <p className="text-lg font-bold text-white">{media.episodes}</p>
                </div>
              )
              if (media.totalSeasons != null && media.totalSeasons > 1) cells.push(
                <div key="seasons" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Stagioni</p>
                  <p className="text-lg font-bold text-white">{media.totalSeasons}</p>
                </div>
              )
              if (media.playing_time) cells.push(
                <div key="time" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Durata</p>
                  <p className="text-lg font-bold text-white">{media.playing_time}<span className="text-[10px] text-zinc-600 ml-0.5">m</span></p>
                </div>
              )
              if (media.pageCount) cells.push(
                <div key="pages" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Pagine</p>
                  <p className="text-lg font-bold text-white">{media.pageCount}</p>
                </div>
              )
              if (media.complexity) cells.push(
                <div key="cmplx" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Difficoltà</p>
                  <p className="text-lg font-bold text-white">{media.complexity.toFixed(1)}<span className="text-[10px] text-zinc-600">/5</span></p>
                </div>
              )
              if (media.min_players != null || media.max_players != null) cells.push(
                <div key="players" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Giocatori</p>
                  <p className="text-lg font-bold text-white">
                    {media.min_players === media.max_players
                      ? media.min_players
                      : `${media.min_players ?? '?'}–${media.max_players ?? '?'}`}
                  </p>
                </div>
              )
              if (cells.length === 0) return null
              return (
                <div className={`grid gap-2 ${cells.length <= 2 ? 'grid-cols-2' : cells.length === 3 ? 'grid-cols-3' : 'grid-cols-3'}`}>
                  {cells}
                </div>
              )
            })()}

            {/* Descrizione con expand */}
            {media.description && (
              <div>
                <p className={`text-sm text-zinc-300 leading-relaxed ${!descExpanded ? 'line-clamp-4' : ''}`}>
                  {media.description}
                </p>
                {isLongDesc && (
                  <button
                    onClick={() => setDescExpanded(v => !v)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 mt-1.5 transition-colors"
                  >
                    {descExpanded ? 'Meno ▲' : 'Leggi di più ▼'}
                  </button>
                )}
              </div>
            )}

            {/* Studios / Directors / Authors */}
            {creatorList && creatorList.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5 flex items-center gap-1">
                  <Clapperboard size={10} />{creatorTitle}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {creatorList.slice(0, 5).map(name => (
                    <span key={name} className="text-xs bg-sky-500/10 text-sky-300 border border-sky-500/20 px-2.5 py-1 rounded-full">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sviluppatori (games) — mostrati solo se non già in creatorList */}
            {media.developers && media.developers.length > 0 && !isManga && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Sviluppatori</h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.developers.slice(0, 4).map(name => (
                    <span key={name} className="text-xs bg-sky-500/10 text-sky-300 border border-sky-500/20 px-2.5 py-1 rounded-full">{name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Editori (manga only, shown separately from authors) */}
            {isManga && media.developers?.length && media.studios?.length ? (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Editori</h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.studios.slice(0, 3).map(name => (
                    <span key={name} className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">{name}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Editore (books) */}
            {media.type === 'book' && media.publisher && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Editore</h3>
                <span className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">{media.publisher}</span>
              </div>
            )}

            {/* Cast */}
            {media.cast && media.cast.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Cast</h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.cast.map(name => (
                    <span key={name} className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">{name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Piattaforme (gaming) */}
            {media.platforms && media.platforms.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5 flex items-center gap-1">
                  <Monitor size={10} />Piattaforme
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.platforms.slice(0, 8).map(p => (
                    <span key={p} className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Disponibile su (streaming) */}
            {media.watchProviders && media.watchProviders.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Disponibile su</h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.watchProviders.map(p => (
                    <span key={p} className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-full">{p}</span>
                  ))}
                </div>
                <p className="text-[9px] text-zinc-600 mt-1.5">Powered by JustWatch</p>
              </div>
            )}

            {/* Supporto italiano */}
            {media.italianSupportTypes && media.italianSupportTypes.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Lingua italiana</h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.italianSupportTypes.map(t => (
                    <span key={t} className="text-xs bg-green-500/10 text-green-300 border border-green-500/20 px-2.5 py-1 rounded-full">
                      🇮🇹 {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Continuity / Relations */}
            {continuityRelations.length > 0 && (
              <div>
                <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                  Nella stessa serie
                </h3>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                  {continuityRelations.map(rel => (
                    <div key={rel.id} className="flex-shrink-0 w-16">
                      <div className="relative h-24 rounded-xl overflow-hidden bg-zinc-800 mb-1">
                        {rel.coverImage
                          ? <Image src={rel.coverImage} alt={rel.title} fill className="object-cover" sizes="64px" loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center text-zinc-700"><Tv size={28} /></div>
                        }
                        <div className="absolute top-1 left-1 bg-amber-500/90 text-[7px] font-bold px-1 py-0.5 rounded text-white">
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

            {/* Form aggiunta (appare in fondo al contenuto) */}
            {showAddForm && (
              <div ref={formRef} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Il tuo voto (opzionale)</p>
                  <StarRating value={formRating} onChange={setFormRating} size={28} />
                </div>

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
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                      />
                      {formSeasonError && (
                        <p className="text-xs text-red-400 mt-1">{formSeasonError}</p>
                      )}
                    </div>
                  )
                })()}

                {media.type !== 'movie' && (() => {
                  const seasonNum = parseInt(formSeason) || 1
                  const maxEp = media.seasons?.[seasonNum]?.episode_count ?? media.episodes ?? null
                  const label = media.type === 'manga' || media.type === 'novel' ? 'Capitolo corrente' : media.type === 'book' ? 'Pagina corrente' : 'Episodio corrente'
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
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                      />
                      {formEpisodeError && (
                        <p className="text-xs text-red-400 mt-1">{formEpisodeError}</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

          </div>
        </div>

        {/* ── FOOTER STICKY (CTA) ────────────────────────────────────── */}
        <div className="flex-shrink-0 p-3 border-t border-zinc-800/80 bg-zinc-950 space-y-2">
          {!checkDone ? (
            <div className="animate-pulse space-y-2">
              <div className="h-10 bg-zinc-800 rounded-2xl" />
              <div className="h-9 bg-zinc-800 rounded-2xl" />
            </div>
          ) : (
            <>
              {showAddForm ? (
                <div className="flex gap-2">
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
              ) : !inCollection ? (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-white transition-all"
                >
                  Aggiungi alla collezione
                </button>
              ) : (
                <div className="w-full py-2.5 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl text-emerald-400 font-semibold text-center text-sm flex items-center justify-center gap-2">
                  <Check size={14} /> Nella tua collezione
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleToggleWishlist}
                  className={`flex-1 py-2 rounded-xl font-medium text-xs border transition-all flex items-center justify-center gap-1.5 ${
                    inWishlist
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  <Bookmark size={12} fill={inWishlist ? 'currentColor' : 'none'} />
                  {inWishlist ? 'In wishlist' : 'Wishlist'}
                </button>

                {externalUrl && (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 rounded-xl font-medium text-xs bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink size={12} />
                    {sourceLabel}
                  </a>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </>
  )
}
