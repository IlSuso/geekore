'use client'
// src/components/media/MediaDetailsDrawer.tsx
// Drawer laterale che mostra i dettagli completi di un media.
// Si apre cliccando sulla cover nella collezione o nei risultati discover.

import { useEffect, useState, useCallback } from 'react'
import {
  X, ExternalLink, Star, Clock, Users, Layers,
  Gamepad2, BookOpen, Film, Tv, Dices, ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

// ─── Tipi ────────────────────────────────────────────────────────────────────

export interface MediaDetails {
  id: string
  title: string
  type: string
  coverImage?: string
  year?: number
  episodes?: number
  description?: string
  genres?: string[]
  source?: string
  // Boardgame extras
  min_players?: number
  max_players?: number
  playing_time?: number
  complexity?: number
  bgg_rating?: number
  mechanics?: string[]
  designers?: string[]
  // Game extras
  developers?: string[]
  themes?: string[]
  // Rating
  score?: number
  // Link esterno
  externalUrl?: string
}

interface MediaDetailsDrawerProps {
  media: MediaDetails | null
  onClose: () => void
  isOwner?: boolean
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function buildExternalUrl(media: MediaDetails): string | undefined {
  if (media.externalUrl) return media.externalUrl
  const id = media.id
  if (id.startsWith('anilist-anime-')) {
    const num = id.replace('anilist-anime-', '')
    return `https://anilist.co/anime/${num}`
  }
  if (id.startsWith('anilist-manga-') || id.startsWith('anilist-novel-')) {
    const num = id.replace(/anilist-(manga|novel)-/, '')
    return `https://anilist.co/manga/${num}`
  }
  if (id.startsWith('bgg-')) {
    const num = id.replace('bgg-', '')
    return `https://boardgamegeek.com/boardgame/${num}`
  }
  // TMDb movie/tv — id numerico puro
  if (media.type === 'movie' && /^\d+$/.test(id)) {
    return `https://www.themoviedb.org/movie/${id}`
  }
  if (media.type === 'tv' && /^\d+$/.test(id)) {
    return `https://www.themoviedb.org/tv/${id}`
  }
  // IGDB game — id numerico puro
  if (media.type === 'game' && /^\d+$/.test(id)) {
    return `https://www.igdb.com/games/${id}`
  }
  return undefined
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: BookOpen, game: Gamepad2,
  tv: Tv, movie: Film, boardgame: Dices,
}

const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500',
  manga: 'bg-orange-500',
  game: 'bg-green-500',
  tv: 'bg-purple-500',
  movie: 'bg-red-500',
  boardgame: 'bg-yellow-500',
}

const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Board Game',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function MediaDetailsDrawer({ media, onClose, isOwner }: MediaDetailsDrawerProps) {
  const [inCollection, setInCollection] = useState(false)
  const [inWishlist, setInWishlist] = useState(false)
  const [checkDone, setCheckDone] = useState(false)
  const supabase = createClient()

  // Blocca scroll body quando aperto
  useEffect(() => {
    if (media) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [media])

  // Chiudi con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Controlla se già in collezione o wishlist
  useEffect(() => {
    if (!media) { setCheckDone(false); return }
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

  const handleAddToCollection = useCallback(async () => {
    if (!media) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id,
      external_id: media.id,
      title: media.title,
      type: media.type,
      cover_image: media.coverImage,
      genres: media.genres || [],
      status: media.type === 'movie' ? 'completed' : 'watching',
      current_episode: 1,
    })
    if (!error) {
      setInCollection(true)
      showToast(`"${media.title}" aggiunto alla collezione`)
    }
  }, [media])

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
        title: media.title, type: media.type, cover_image: media.coverImage,
      }, { onConflict: 'user_id,external_id' })
      setInWishlist(true)
      showToast('Aggiunto alla wishlist')
    }
  }, [media, inWishlist])

  if (!media) return null

  const Icon = TYPE_ICON[media.type] || Film
  const externalUrl = buildExternalUrl(media)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-[90] w-full max-w-md bg-zinc-950 border-l border-zinc-800 overflow-y-auto
                   animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal
        aria-label={media.title}
      >
        {/* Header con cover */}
        <div className="relative h-72 bg-zinc-900 flex-shrink-0 overflow-hidden">
          {media.coverImage ? (
            <img
              src={media.coverImage}
              alt={media.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon size={64} className="text-zinc-700" />
            </div>
          )}
          {/* Gradiente bottom */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 bg-black/60 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-black/80 transition"
            aria-label="Chiudi"
          >
            <X size={18} />
          </button>

          {/* Badge tipo */}
          <div className="absolute top-4 left-4">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full text-white ${TYPE_COLOR[media.type] || 'bg-zinc-700'}`}>
              {TYPE_LABEL[media.type] || media.type}
            </span>
          </div>

          {/* Titolo in overlay */}
          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="text-xl font-bold text-white leading-tight line-clamp-2">{media.title}</h2>
            {media.year && <p className="text-sm text-zinc-400 mt-1">{media.year}</p>}
          </div>
        </div>

        {/* Contenuto */}
        <div className="p-5 space-y-6">

          {/* Score + stats veloci */}
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

          {/* Meccaniche (boardgame) */}
          {media.mechanics && media.mechanics.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Meccaniche</h3>
              <div className="flex flex-wrap gap-1.5">
                {media.mechanics.slice(0, 8).map(m => (
                  <span key={m} className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">
                    {m}
                  </span>
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
                  <span key={t} className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">
                    {t}
                  </span>
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

          {/* CTA */}
          {checkDone && (
            <div className="flex flex-col gap-3 pt-2">
              {!inCollection ? (
                <button
                  onClick={handleAddToCollection}
                  className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-white transition-all"
                >
                  Aggiungi alla collezione
                </button>
              ) : (
                <div className="w-full py-3.5 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl text-emerald-400 font-semibold text-center text-sm">
                  ✓ Nella tua collezione
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
                {inWishlist ? '★ Nella wishlist' : '☆ Aggiungi alla wishlist'}
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
    </>
  )
}