'use client'
// DESTINAZIONE: src/components/media/MediaDetailsDrawer.tsx
// V5: + boardgame (meccaniche, designer, link BGG) + book (autori, pagine, ISBN, link Google Books)

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'
import {
  X, ExternalLink, Star, Clock, Users, Layers,
  Gamepad2, Film, Tv, Clapperboard, Check, Bookmark,
  Sparkles, Trophy, Monitor, Dices, Hash, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StarRating } from '@/components/ui/StarRating'
import { translateGenre } from '@/lib/genres'
import { optimizeCover } from '@/lib/imageOptimizer'

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
  // Stats generali
  score?: number
  playing_time?: number
  // Boardgame specifics
  min_players?: number
  max_players?: number
  complexity?: number
  mechanics?: string[]
  designers?: string[]
  // Game / Anime / TV
  developers?: string[]
  themes?: string[]
  platforms?: string[]
  cast?: string[]
  watchProviders?: string[]
  italianSupportTypes?: string[]
  studios?: string[]
  directors?: string[]
  // Manga
  authors?: string[]
  pages?: number
  isbn?: string
  publisher?: string
  // Per Te
  externalUrl?: string
  why?: string
  matchScore?: number
  isAwardWinner?: boolean
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

// Piattaforma — calcolata una sola volta
const IS_IOS     = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
// Su iOS: swipe dal bordo sinistro segue il dito (interattivo, come Instagram).
// Su Android: la back gesture è un evento di sistema — non intercettiamo il touch.
const IOS_EDGE_SWIPE_ZONE = 30   // px dal bordo sinistro che attiva lo swipe su iOS
const IOS_DISMISS_THRESHOLD = 80  // px di dx per confermare chiusura

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildExternalUrl(media: MediaDetails): string | undefined {
  if (media.externalUrl) return media.externalUrl
  const id = media.id
  // BGG
  if (id.startsWith('bgg-')) return `https://boardgamegeek.com/boardgame/${id.replace('bgg-', '')}`
  // AniList
  if (id.startsWith('anilist-anime-')) return `https://anilist.co/anime/${id.replace('anilist-anime-', '')}`
  if (id.startsWith('anilist-manga-') || id.startsWith('anilist-novel-')) return `https://anilist.co/manga/${id.replace(/anilist-(manga|novel)-/, '')}`
  // TMDB
  if (id.startsWith('tmdb-anime-')) return `https://www.themoviedb.org/tv/${id.replace('tmdb-anime-', '')}`
  if (media.source === 'tmdb' && media.type === 'movie') return `https://www.themoviedb.org/movie/${id}`
  if (media.source === 'tmdb' && media.type === 'tv') return `https://www.themoviedb.org/tv/${id}`
  return undefined
}

function buildSourceLabel(media: MediaDetails): string {
  const id = media.id
  if (id.startsWith('bgg-')) return 'BGG'
  if (id.startsWith('anilist-')) return 'AniList'
  if (id.startsWith('igdb-')) return 'IGDB'
  return 'TMDb'
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
  tv: Tv, movie: Film, boardgame: Dices,
}
const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500', manga: 'bg-orange-500', game: 'bg-green-500',
  tv: 'bg-purple-500', movie: 'bg-red-500',
  boardgame: 'bg-amber-500',
}
const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Videogioco',
  tv: 'Serie TV', movie: 'Film',
  boardgame: 'Gioco da Tavolo',
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
  const formRef    = useRef<HTMLDivElement>(null)
  const supabase   = createClient()

  const historyPushedRef = useRef(false)
  const closingRef       = useRef(false)  // true while our own history.back() is in flight
  const isClosingRef     = useRef(false)  // guards against double-close
  const onCloseRef       = useRef(onClose)
  onCloseRef.current     = onClose
  const [drawerOffset, setDrawerOffset] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 450
  )
  const [drawerAnimate, setDrawerAnimate] = useState(false)

  // iOS edge-swipe refs (dichiarati dentro il componente come richiesto da React)
  const iosSwipeTouchId   = useRef<number | null>(null)
  const iosSwipeStartX    = useRef(0)
  const iosSwipeStartY    = useRef(0)
  const iosSwipeConfirmed = useRef(false)

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    const isAndroid = /android/i.test(navigator.userAgent)
    if (!isAndroid && historyPushedRef.current) {
      // iOS: avevamo fatto pushState, dobbiamo tornare indietro
      historyPushedRef.current = false
      closingRef.current = true
      history.back()
    }
    setDrawerAnimate(true)
    setDrawerOffset(typeof window !== 'undefined' ? window.innerWidth : 450)
    setTimeout(() => { isClosingRef.current = false; onCloseRef.current() }, 260)
  }, [])

  useEffect(() => {
    if (media) { document.body.style.overflow = 'hidden' }
    else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [media])

  useEffect(() => {
    setShowAddForm(false); setFormRating(0); setFormEpisode('0'); setFormSeason('1')
    setFormEpisodeError(null); setFormSeasonError(null); setDescExpanded(false)
  }, [media?.id])

  useEffect(() => {
    if (showAddForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [showAddForm])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // onClose via ref — stable

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
      setInCollection(!!col); setInWishlist(!!wish); setCheckDone(true)
    }
    check()
  }, [media?.id])

  const handleAddToCollection = useCallback(async (opts?: { rating?: number; episode?: number; season?: number }) => {
    if (!media) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const isMovie = media.type === 'movie'
    const isBoardgame = media.type === 'boardgame'

    const seasonNum = opts?.season ?? 1
    const maxEpThisSeason = media.seasons?.[seasonNum]?.episode_count ?? media.episodes ?? null
    const maxSeasons = media.totalSeasons ?? (media.seasons ? Object.keys(media.seasons).length : null)
    const isLastSeason = !maxSeasons || seasonNum >= maxSeasons
    const isLastEpisode = maxEpThisSeason !== null && opts?.episode !== undefined && opts.episode >= maxEpThisSeason
    const autoCompleted = isMovie || isBoardgame || (isLastSeason && isLastEpisode)

    const status = autoCompleted ? 'completed' : (isBoardgame ? 'playing' : 'watching')

    // Per i boardgame: mappa i campi BGG sulle colonne disponibili
    const bggAchievementData = isBoardgame && (media.complexity != null || media.min_players != null || media.playing_time != null)
      ? {
          bgg: {
            score: (media as any).score ?? null,
            complexity: media.complexity ?? null,
            min_players: media.min_players ?? null,
            max_players: media.max_players ?? null,
            playing_time: media.playing_time ?? null,
          }
        }
      : null

    const res = await fetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_id: media.id,
        title: media.title,
        title_en: media.title_en || media.title,
        type: media.type,
        cover_image: media.coverImage,
        genres: media.genres || [],
        // boardgame: meccaniche in tags, designer in authors
        tags: isBoardgame ? (media.mechanics || []) : [],
        authors: isBoardgame ? (media.designers || media.authors || []) : (media.authors || []),
        keywords: isBoardgame ? [] : [],
        status,
        current_episode: opts?.episode ?? (isMovie || isBoardgame ? null : 0),
        current_season: opts?.season ?? null,
        episodes: media.episodes ?? null,
        season_episodes: media.seasons ?? null,
        rating: opts?.rating ?? null,
        studios: isBoardgame ? [] : (media.studios || []),
        directors: isBoardgame ? [] : (media.directors || []),
        developer: isBoardgame ? null : (media.developers?.[0] || null),
        achievement_data: bggAchievementData,
        display_order: Date.now() + Math.round((opts?.rating ?? 0) * 1_000_000),
      }),
    }).catch(() => null)
    if (res?.ok) {
      setInCollection(true); setShowAddForm(false)
      onAdd?.(media)
      // Invalida la memCache così la prossima apertura di Per Te rigenera il pool
      fetch('/api/recommendations?invalidateCache=true', { method: 'POST', keepalive: true }).catch(() => {})
      if ((media.genres || []).length > 0) {
        triggerTasteDelta({ action: 'status_change', mediaId: media.id, mediaType: media.type, genres: media.genres || [], status })
        if (opts?.rating) {
          triggerTasteDelta({ action: 'rating', mediaId: media.id, mediaType: media.type, genres: media.genres || [], rating: opts.rating })
        }
      }
    }
  }, [media, onAdd])

  const handleToggleWishlist = useCallback(async () => {
    if (!media) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (inWishlist) {
      const res = await fetch('/api/wishlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ external_id: media.id }),
      }).catch(() => null)
      if (res?.ok) setInWishlist(false);
    } else {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_id: media.id,
          title: media.title,
          type: media.type,
          cover_image: media.coverImage,
        }),
      }).catch(() => null)
      if (!res?.ok) return
      setInWishlist(true);
      if ((media.genres || []).length > 0) {
        triggerTasteDelta({ action: 'wishlist_add', mediaId: media.id, mediaType: media.type, genres: media.genres || [] })
      }
    }
  }, [media, inWishlist])

  // gestureState + androidBack registration
  // Su Android: niente pushState — usiamo androidBack.push/pop per registrare
  // la callback di chiusura. Il cuscinetto globale in AndroidBackHandler intercetta
  // la back gesture e chiama la nostra callback senza mostrare l'anteprima.
  // Su iOS: manteniamo il popstate listener per lo swipe interattivo.
  useEffect(() => {
    if (!media) { gestureState.drawerActive = false; return }
    gestureState.drawerActive = true

    const isAndroid = /android/i.test(navigator.userAgent)

    if (isAndroid) {
      // Android: registra callback, niente pushState
      const closeDrawer = () => {
        if (isClosingRef.current) return
        isClosingRef.current = true
        setDrawerAnimate(true)
        setDrawerOffset(typeof window !== 'undefined' ? window.innerWidth : 450)
        setTimeout(() => { isClosingRef.current = false; onCloseRef.current() }, 260)
      }
      androidBack.push(closeDrawer)
      return () => {
        gestureState.drawerActive = false
        androidBack.pop(closeDrawer)
      }
    }

    // iOS: pushState + popstate listener per swipe interattivo
    history.pushState({ gkDrawer: true }, '', location.href)
    historyPushedRef.current = true

    const onPop = (e: PopStateEvent) => {
      if (closingRef.current) {
        closingRef.current = false
        e.stopImmediatePropagation()
        return
      }
      if (!historyPushedRef.current) return
      e.stopImmediatePropagation()
      historyPushedRef.current = false
      isClosingRef.current = true
      setDrawerAnimate(true)
      setDrawerOffset(typeof window !== 'undefined' ? window.innerWidth : 450)
      setTimeout(() => { isClosingRef.current = false; onCloseRef.current() }, 260)
    }
    window.addEventListener('popstate', onPop, { capture: true })

    return () => {
      gestureState.drawerActive = false
      window.removeEventListener('popstate', onPop, { capture: true })
      historyPushedRef.current = false
    }
  }, [media?.id])

  // Slide-in animation whenever a new item opens
  useEffect(() => {
    if (!media) { setDrawerAnimate(false); return }
    setDrawerAnimate(false)
    setDrawerOffset(typeof window !== 'undefined' ? window.innerWidth : 450)
    const frame = requestAnimationFrame(() => { setDrawerAnimate(true); setDrawerOffset(0) })
    return () => cancelAnimationFrame(frame)
  }, [media?.id])

  // ── iOS edge-swipe per chiudere il drawer (segue il dito, come Instagram) ──
  // Su Android questo blocco non fa nulla perché IS_IOS è false.
  useEffect(() => {
    if (!IS_IOS || !media) return

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t.clientX > IOS_EDGE_SWIPE_ZONE) return  // non parte dal bordo sinistro
      iosSwipeTouchId.current   = t.identifier
      iosSwipeStartX.current    = t.clientX
      iosSwipeStartY.current    = t.clientY
      iosSwipeConfirmed.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (iosSwipeTouchId.current === null) return
      const t = Array.from(e.touches).find(tt => tt.identifier === iosSwipeTouchId.current)
      if (!t) return
      const dx = t.clientX - iosSwipeStartX.current
      const dy = t.clientY - iosSwipeStartY.current

      if (!iosSwipeConfirmed.current) {
        // Aspetta abbastanza movimento per distinguere H da V
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        if (Math.abs(dy) > Math.abs(dx)) {
          // Movimento verticale → abbandona, non è uno swipe di chiusura
          iosSwipeTouchId.current = null
          return
        }
        iosSwipeConfirmed.current = true
      }

      if (dx < 0) return  // non permettiamo swipe verso sinistra (drawer già a destra)
      e.stopPropagation()  // evita che SwipeablePageContainer catturi questo touch
      setDrawerAnimate(false)
      setDrawerOffset(dx)
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (iosSwipeTouchId.current === null) return
      const ended = Array.from(e.changedTouches).find(tt => tt.identifier === iosSwipeTouchId.current)
      if (!ended) return
      iosSwipeTouchId.current = null

      const dx = ended.clientX - iosSwipeStartX.current
      if (iosSwipeConfirmed.current && dx >= IOS_DISMISS_THRESHOLD) {
        handleClose()
      } else {
        // Snap back
        setDrawerAnimate(true)
        setDrawerOffset(0)
      }
      iosSwipeConfirmed.current = false
    }

    window.addEventListener('touchstart',  onTouchStart,  { passive: true })
    window.addEventListener('touchmove',   onTouchMove,   { passive: false })
    window.addEventListener('touchend',    onTouchEnd,    { passive: true })
    window.addEventListener('touchcancel', onTouchEnd,    { passive: true })
    return () => {
      window.removeEventListener('touchstart',  onTouchStart)
      window.removeEventListener('touchmove',   onTouchMove)
      window.removeEventListener('touchend',    onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [media?.id, handleClose])

  if (!media || typeof document === 'undefined') return null

  const Icon = TYPE_ICON[media.type] || Film
  const externalUrl = buildExternalUrl(media)
  const sourceLabel = buildSourceLabel(media)

  const isManga = media.type === 'manga' || media.type === 'novel'
  const isBoardgame = media.type === 'boardgame'
  // Autori/creatori priorità per tipo
  const creatorList = isManga
    ? (media.authors?.length ? media.authors : media.developers?.length ? media.developers : media.studios?.length ? media.studios : null)
    : (media.studios?.length ? media.studios : media.directors?.length ? media.directors : media.authors?.length ? media.authors : null)

  const creatorLabel = creatorList?.slice(0, 2).join(', ') ?? null
  const creatorTitle = isManga
    ? (media.authors?.length ? 'Autori' : 'Editori')
    : (media.studios?.length ? 'Studio' : media.directors?.length ? 'Registi' : 'Autori')

  const continuityRelations = (media.relations || [])
    .filter(r => ['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF'].includes(r.relationType))
    .slice(0, 4)

  const isLongDesc = (media.description?.length ?? 0) > 350
  const timeLabel = (media.type === 'anime' || media.type === 'tv') ? 'min/ep' : 'min'

  // Portal to body so the drawer is in the root stacking context.
  // z-[80]: below MobileHeader (z-99) and Navbar (z-100) — they overlay the edges.
  // top/bottom in the style prop account for header + bottom-nav heights so
  // the drawer content is never hidden behind those elements.
  return createPortal((
    <>
      {/* Backdrop — below MobileHeader (z-99) and Navbar (z-100) */}
      <div
        className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden
      />

      {/* Drawer — sits behind MobileHeader/Navbar; top/bottom account for their heights */}
      <div
        className="fixed right-0 z-[80] w-full max-w-md flex flex-col"
        role="dialog" aria-modal aria-label={media.title}
        style={{
          background:  'var(--bg-secondary)',
          borderLeft:  '1px solid var(--border)',
          top:         'calc(env(safe-area-inset-top, 0px) + 52px)',
          bottom:      'calc(env(safe-area-inset-bottom, 0px) + 56px)',
          transform:   `translateX(${drawerOffset}px)`,
          transition:  drawerAnimate ? 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          willChange:  drawerOffset > 0 ? 'transform' : 'auto',
        }}
      >
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/60 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-black/80 transition"
          aria-label="Chiudi"
        >
          <X size={16} />
        </button>

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <div className="flex gap-4 p-5 pr-12 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex-shrink-0 w-20 h-28 rounded-xl overflow-hidden bg-[var(--bg-card)] shadow-lg ring-1 ring-white/10">
            {media.coverImage
              ? <img src={optimizeCover(media.coverImage, 'drawer-cover')} alt={media.title} className="w-full h-full object-cover" loading="eager" decoding="async" />
              : <div className="w-full h-full flex items-center justify-center"><Icon size={28} className="text-zinc-600" /></div>}
          </div>

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
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(230,255,61,0.12)', border: '1px solid rgba(230,255,61,0.25)', color: '#E6FF3D' }}>
                  {media.matchScore}% match
                </span>
              )}
            </div>

            <h2 className="text-base font-bold text-white leading-tight line-clamp-2">{media.title}</h2>

            {/* Stats inline */}
            <div className="flex items-center gap-1 flex-wrap">
              {media.year && <span className="text-[10px] text-zinc-400 font-mono">{media.year}</span>}
              {media.score != null && (
                <div className="flex items-center gap-0.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-1.5 py-0.5">
                  <Star size={9} className="text-yellow-400 fill-yellow-400" />
                  <span className="text-[10px] font-bold text-white font-mono">{media.score!.toFixed(1)}</span>
                  <span className="text-[10px] text-zinc-500">/5</span>
                </div>
              )}
              {media.episodes != null && media.episodes > 1 && (
                <div className="flex items-center gap-0.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-1.5 py-0.5">
                  <Layers size={9} className="text-zinc-400" />
                  <span className="text-[10px] font-bold text-white font-mono">{media.episodes}</span>
                  <span className="text-[10px] text-zinc-500">ep.</span>
                </div>
              )}
              {/* Boardgame: giocatori */}
              {(media.min_players != null || media.max_players != null) && (
                <div className="flex items-center gap-0.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-1.5 py-0.5">
                  <Users size={9} className="text-zinc-400" />
                  <span className="text-[10px] font-bold text-white">
                    {media.min_players === media.max_players
                      ? media.min_players
                      : `${media.min_players ?? '?'}–${media.max_players ?? '?'}`}
                  </span>
                </div>
              )}
              {/* Durata (boardgame o film) */}
              {media.playing_time != null && (
                <div className="flex items-center gap-0.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-1.5 py-0.5">
                  <Clock size={9} className="text-zinc-400" />
                  <span className="text-[10px] font-bold text-white">{media.playing_time}</span>
                  <span className="text-[10px] text-zinc-500">{timeLabel}</span>
                </div>
              )}
              {/* Boardgame: complessità */}
              {media.complexity != null && (
                <div className="flex items-center gap-0.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-1.5 py-0.5">
                  <span className="text-[10px] font-bold text-white">{media.complexity.toFixed(1)}</span>
                  <span className="text-[10px] text-zinc-500">/5</span>
                </div>
              )}
              {/* (book pages removed) */}
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
                  <span key={g}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                    style={{
                      background: `color-mix(in srgb, var(--type-${media.type === 'boardgame' ? 'board' : media.type}, #6d28d9) 12%, transparent)`,
                      color: `var(--type-${media.type === 'boardgame' ? 'board' : media.type}, #a78bfa)`,
                      border: `1px solid color-mix(in srgb, var(--type-${media.type === 'boardgame' ? 'board' : media.type}, #6d28d9) 30%, transparent)`,
                    }}
                  >
                    {translateGenre(g)}
                  </span>
                ))}
              </div>
            )}

            {/* Perché te lo consigliamo */}
            {media.why && (
              <div className="flex gap-2.5 rounded-xl p-3.5" style={{ background: 'rgba(230,255,61,0.06)', border: '1px solid rgba(230,255,61,0.2)' }}>
                <Sparkles size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#E6FF3D' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(230,255,61,0.85)' }}>{media.why}</p>
              </div>
            )}

            {/* Stats grid */}
            {(() => {
              const cells: React.ReactElement[] = []
              if (media.matchScore != null) cells.push(
                <div key="match" className="rounded-xl p-3 text-center" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.2)' }}>
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Match</p>
                  <p className="text-lg font-bold font-mono" style={{ color: '#E6FF3D' }}>{media.matchScore}%</p>
                </div>
              )
              if (media.score != null) cells.push(
                <div key="score" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Voto</p>
                  <div className="flex items-center justify-center gap-1">
                    <Star size={11} className="text-yellow-400 fill-yellow-400" />
                    <p className="text-lg font-bold text-white font-mono">{(media.score!).toFixed(1)}</p>
                    <span className="text-[10px] text-zinc-600">/5</span>
                  </div>
                </div>
              )
              if (media.year) cells.push(
                <div key="year" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Anno</p>
                  <p className="text-lg font-bold text-white font-mono">{media.year}</p>
                </div>
              )
              if (media.episodes != null && media.episodes > 1) cells.push(
                <div key="eps" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">
                    {media.type === 'manga' ? 'Cap.' : 'Ep.'}
                  </p>
                  <p className="text-lg font-bold text-white font-mono">{media.episodes}</p>
                </div>
              )
              if (media.totalSeasons != null && media.totalSeasons > 1) cells.push(
                <div key="seasons" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Stagioni</p>
                  <p className="text-lg font-bold text-white font-mono">{media.totalSeasons}</p>
                </div>
              )
              if (media.playing_time) cells.push(
                <div key="time" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Durata</p>
                  <p className="text-lg font-bold text-white font-mono">{media.playing_time}<span className="text-[10px] text-zinc-600 ml-0.5">m</span></p>
                </div>
              )
              if (media.complexity) cells.push(
                <div key="cmplx" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Difficoltà</p>
                  <p className="text-lg font-bold text-white font-mono">{media.complexity.toFixed(1)}<span className="text-[10px] text-zinc-600">/5</span></p>
                </div>
              )
              if (media.min_players != null || media.max_players != null) cells.push(
                <div key="players" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Giocatori</p>
                  <p className="text-lg font-bold text-white font-mono">
                    {media.min_players === media.max_players
                      ? media.min_players
                      : `${media.min_players ?? '?'}–${media.max_players ?? '?'}`}
                  </p>
                </div>
              )
              if (media.pages) cells.push(
                <div key="pages" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Pagine</p>
                  <p className="text-lg font-bold text-white">{media.pages}</p>
                </div>
              )
              if (cells.length === 0) return null
              return (
                <div className={`grid gap-2 ${cells.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {cells}
                </div>
              )
            })()}

            {/* Descrizione */}
            {media.description && (
              <div>
                <p className={`text-sm text-zinc-300 leading-relaxed ${!descExpanded ? 'line-clamp-6' : ''}`}>
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

            {/* Autori / Studio / Registi */}
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

            {/* ── BOARDGAME: Meccaniche ─────────────────────────────── */}
            {isBoardgame && media.mechanics && media.mechanics.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5 flex items-center gap-1">
                  <Dices size={10} />Meccaniche
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.mechanics.slice(0, 10).map(m => (
                    <span key={m} className="text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2.5 py-1 rounded-full">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── BOARDGAME: Designer ───────────────────────────────── */}
            {isBoardgame && media.designers && media.designers.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Designer</h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.designers.map(d => (
                    <span key={d} className="text-xs bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] px-2.5 py-1 rounded-full">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sviluppatori (games) */}
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

            {/* Cast */}
            {media.cast && media.cast.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Cast</h3>
                <div className="flex flex-wrap gap-1.5">
                  {media.cast.map(name => (
                    <span key={name} className="text-xs bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] px-2.5 py-1 rounded-full">{name}</span>
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
                    <span key={p} className="text-xs bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] px-2.5 py-1 rounded-full">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Disponibile su */}
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
                <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Nella stessa serie</h3>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                  {continuityRelations.map(rel => (
                    <div key={rel.id} className="flex-shrink-0 w-16">
                      <div className="relative h-24 rounded-xl overflow-hidden bg-[var(--bg-card)] mb-1">
                        {rel.coverImage
                          ? <img src={optimizeCover(rel.coverImage, 'drawer-related')} alt={rel.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          : <div className="w-full h-full flex items-center justify-center text-zinc-700"><Tv size={28} /></div>}
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

            {/* Form aggiunta */}
            {showAddForm && (
              <div ref={formRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Il tuo voto (opzionale)</p>
                  <div data-no-swipe="">
                    <StarRating value={formRating} onChange={setFormRating} size={28} />
                  </div>
                </div>

                {(media.type === 'tv' || media.type === 'anime') && (() => {
                  const maxSeasons = media.totalSeasons ?? (media.seasons ? Object.keys(media.seasons).length : null)
                  return (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Stagione{maxSeasons ? ` (max ${maxSeasons})` : ''}</p>
                      <input
                        type="number" min={1} max={maxSeasons ?? undefined} value={formSeason}
                        onChange={e => {
                          const val = e.target.value; setFormSeason(val)
                          const n = parseInt(val)
                          if (isNaN(n) || n < 1) setFormSeasonError('Minimo 1')
                          else if (maxSeasons && n > maxSeasons) setFormSeasonError(`Massimo ${maxSeasons}`)
                          else setFormSeasonError(null)
                          setFormEpisode('0'); setFormEpisodeError(null)
                        }}
                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-zinc-600"
                      />
                      {formSeasonError && <p className="text-xs text-red-400 mt-1">{formSeasonError}</p>}
                    </div>
                  )
                })()}

                {media.type !== 'movie' && !isBoardgame && (() => {
                  const seasonNum = parseInt(formSeason) || 1
                  const maxEp = media.seasons?.[seasonNum]?.episode_count ?? media.episodes ?? null
                  const label = media.type === 'manga' || media.type === 'novel' ? 'Capitolo corrente' : 'Episodio corrente'
                  return (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">{label}{maxEp ? ` (max ${maxEp})` : ''}</p>
                      <input
                        type="number" min={0} max={maxEp ?? undefined} value={formEpisode}
                        onChange={e => {
                          const val = e.target.value; setFormEpisode(val)
                          const n = parseInt(val)
                          if (isNaN(n) || n < 0) setFormEpisodeError('Il valore non può essere negativo')
                          else if (maxEp && n > maxEp) setFormEpisodeError(`Massimo ${maxEp}`)
                          else setFormEpisodeError(null)
                        }}
                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-zinc-600"
                      />
                      {formEpisodeError && <p className="text-xs text-red-400 mt-1">{formEpisodeError}</p>}
                    </div>
                  )
                })()}
              </div>
            )}

          </div>
        </div>

        {/* ── FOOTER STICKY ────────────────────────────────────────── */}
        <div className="flex-shrink-0 p-3 border-t border-[var(--border)] space-y-2" style={{ background: 'var(--bg-primary)' }}>
          {!checkDone ? (
            <div className="animate-pulse space-y-2">
              <div className="h-10 bg-[var(--bg-card)] rounded-2xl" />
              <div className="h-9 bg-[var(--bg-card)] rounded-2xl" />
            </div>
          ) : (
            <>
              {showAddForm ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-sm hover:border-[var(--brand)] transition-all"
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
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
                    style={{ background: '#E6FF3D', color: '#0B0B0F' }}
                  >
                    Conferma
                  </button>
                </div>
              ) : !inCollection ? (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full py-3 rounded-2xl font-semibold transition-all"
                  style={{ background: '#E6FF3D', color: '#0B0B0F' }}
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
                      : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]/50'
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
                    className="flex-1 py-2 rounded-xl font-medium text-xs bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--brand)]/50 transition-all flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink size={12} />{sourceLabel}
                  </a>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </>
  ), document.body)
}
