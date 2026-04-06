'use client'

import { useState, useEffect, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle, Clock, X, RotateCw, RotateCcw, Edit3, RefreshCw,
} from 'lucide-react'
import { SteamIcon } from '@/components/icons/SteamIcon'
import { StarRating } from '@/components/ui/StarRating'
import { Spinner } from '@/components/ui/Spinner'
import { showToast } from '@/components/ui/Toast'
import { FollowButton } from '@/components/profile/follow-button'
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

type UserMedia = {
  id: string
  title: string
  type: 'anime' | 'tv' | 'movie' | 'game' | 'manga' | 'boardgame'
  cover_image?: string
  current_episode: number
  current_season?: number
  season_episodes?: Record<number, { episode_count: number }>
  episodes?: number
  display_order?: number
  updated_at: string
  is_steam?: boolean
  appid?: string
  notes?: string
  rating?: number
}

type Profile = {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  bio?: string
}

// ─── SortableBox ─────────────────────────────────────────────────────────────

function SortableBox({ media, children }: { media: UserMedia; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition || 'transform 50ms ease' }}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing rounded-3xl overflow-hidden h-[400px] sm:h-[520px] flex flex-col transition-all duration-200 ${
        isDragging
          ? 'border-2 border-violet-500 shadow-2xl scale-[1.02] z-50'
          : 'border border-zinc-800 hover:border-violet-500/50 hover:shadow-xl'
      }`}
    >
      {children}
    </div>
  )
}

// ─── MediaCard (shared between owner/public view) ─────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  anime: 'bg-sky-500',
  manga: 'bg-orange-500',
  game: 'bg-green-500',
  tv: 'bg-purple-500',
  movie: 'bg-red-500',
  boardgame: 'bg-yellow-500',
}

const TYPE_LABELS: Record<string, string> = {
  anime: 'Anime',
  manga: 'Manga',
  game: 'Game',
  tv: 'Serie',
  movie: 'Film',
  boardgame: 'Board',
}

function MediaCard({
  media, isOwner, deletingId,
  onDelete, onDeleteRequest, onDeleteCancel, onRating, onNotes, onSaveProgress, onMarkComplete, onReset,
}: {
  media: UserMedia
  isOwner: boolean
  deletingId?: string | null
  onDelete?: (id: string) => void
  onDeleteRequest?: (id: string) => void
  onDeleteCancel?: () => void
  onRating?: (id: string, r: number) => void
  onNotes?: (media: UserMedia) => void
  onSaveProgress?: (id: string, val: number, field?: 'current_episode' | 'current_season') => void
  onMarkComplete?: (id: string, media: UserMedia) => void
  onReset?: (id: string) => void
}) {
  const imageUrl = media.cover_image ||
    (media.appid ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${media.appid}/header.jpg` : undefined)

  const isConfirmingDelete = deletingId === media.id
  const hasSeasonData = !!media.season_episodes && Object.keys(media.season_episodes).length > 0
  const hasEpisodeData = !!(media.episodes && media.episodes > 1)
  const currentSeasonNum = media.current_season || 1
  const maxEpisodesThisSeason = media.season_episodes?.[currentSeasonNum]?.episode_count || media.episodes || 0
  const maxSeasons = hasSeasonData && media.season_episodes
    ? Math.max(...Object.keys(media.season_episodes).map(Number)) : 1

  const isCompleted = hasEpisodeData &&
    media.current_episode >= maxEpisodesThisSeason &&
    (!hasSeasonData || currentSeasonNum >= maxSeasons)

  let totalProgress = 0
  if (hasSeasonData && media.season_episodes) {
    const totalEp = Object.values(media.season_episodes).reduce((s, v) => s + (v.episode_count || 0), 0)
    let done = media.current_episode
    for (let s = 1; s < currentSeasonNum; s++) done += media.season_episodes[s]?.episode_count || 0
    totalProgress = totalEp > 0 ? Math.min(Math.round((done / totalEp) * 100), 100) : 0
  } else if (hasEpisodeData && maxEpisodesThisSeason > 0) {
    totalProgress = Math.min(Math.round((media.current_episode / maxEpisodesThisSeason) * 100), 100)
  }

  const rating = media.rating || 0
  const hasNotes = !!media.notes?.trim()

  return (
    <div className="group relative bg-zinc-900/60 rounded-3xl overflow-hidden h-full flex flex-col">
      {/* Cover */}
      <div className="relative h-52 sm:h-72 bg-zinc-900 flex-shrink-0">
        {media.is_steam && (
          <div className="absolute top-3 left-3 z-20 bg-[#171D25] p-1.5 rounded-full shadow-lg border border-[#66C0F4]/50">
            <SteamIcon size={18} className="text-white" />
          </div>
        )}

        {/* Bottom-left: notes + rating */}
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2">
          {isOwner && (
            <button
              onClick={() => onNotes?.(media)}
              className={`p-2.5 rounded-full border transition-all ${
                hasNotes
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-zinc-950/80 border-zinc-700 hover:border-violet-500 text-zinc-400 hover:text-violet-400'
              }`}
            >
              <Edit3 size={18} />
            </button>
          )}
          <div className="bg-zinc-950/90 border border-zinc-700 rounded-full px-3 py-1.5">
            <StarRating
              value={rating}
              onChange={isOwner ? (r) => onRating?.(media.id, r) : undefined}
              size={18}
              viewOnly={!isOwner}
            />
          </div>
        </div>

        {/* Type badge */}
        <div className={`absolute top-3 right-3 z-20 px-2 py-1 rounded-full text-[10px] font-bold text-white ${TYPE_COLORS[media.type] || 'bg-zinc-700'}`}>
          {TYPE_LABELS[media.type] || media.type}
        </div>

        {/* Delete button / inline confirm - owner only */}
        {isOwner && (
          isConfirmingDelete ? (
            <div className="absolute top-3 right-3 z-30 flex gap-1.5">
              <button
                onClick={() => onDeleteCancel?.()}
                className="px-3 py-1.5 text-xs font-medium bg-zinc-900 border border-zinc-600 rounded-full hover:bg-zinc-800 transition"
              >
                Annulla
              </button>
              <button
                onClick={() => onDelete?.(media.id)}
                className="px-3 py-1.5 text-xs font-medium bg-red-900 border border-red-700 text-red-300 rounded-full hover:bg-red-800 transition"
              >
                Elimina
              </button>
            </div>
          ) : (
            <button
              onClick={() => onDeleteRequest?.(media.id)}
              className="absolute top-3 right-3 z-30 opacity-0 group-hover:opacity-100 bg-zinc-950/90 hover:bg-red-950 border border-zinc-700 hover:border-red-500 p-2 rounded-full transition-all duration-200"
            >
              <X className="w-5 h-5 text-zinc-400 hover:text-red-400" />
            </button>
          )
        )}

        {imageUrl ? (
          <img
            src={imageUrl}
            alt={media.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              const img = e.target as HTMLImageElement
              img.onerror = null
              img.src = `https://via.placeholder.com/600x900/27272a/ffffff?text=${encodeURIComponent(media.title.substring(0, 12))}`
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-white">
            <span className="text-7xl mb-3">🎮</span>
            <p className="text-sm font-medium text-center px-6">{media.title}</p>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="p-6 pb-3 flex-shrink-0">
        <h4 className="font-semibold line-clamp-2 text-lg leading-tight">{media.title}</h4>
        {isCompleted && (
          <div className="mt-3 text-emerald-400 text-sm font-medium flex items-center gap-1.5">
            <CheckCircle size={16} /> Completato
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="mt-auto p-6 pt-0">
        {media.type === 'boardgame' ? (
          <div className="flex items-center justify-between">
            <p className="text-emerald-400 text-sm flex items-center gap-1.5">
              <Clock size={14} /> {media.current_episode} {media.current_episode === 1 ? 'partita' : 'partite'}
            </p>
            {isOwner && (
              <div className="flex gap-1">
                <button
                  onClick={() => onSaveProgress?.(media.id, Math.max(0, media.current_episode - 1))}
                  disabled={media.current_episode <= 0}
                  className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30"
                >−</button>
                <button
                  onClick={() => onSaveProgress?.(media.id, media.current_episode + 1)}
                  className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold"
                >+</button>
              </div>
            )}
          </div>
        ) : media.type === 'game' ? (
          <p className="text-emerald-400 text-sm flex items-center justify-center gap-1.5">
            <Clock size={14} /> {media.current_episode} ore
          </p>
        ) : hasEpisodeData ? (
          isCompleted ? (
            isOwner ? (
              <div className="flex justify-end">
                <button onClick={() => onReset?.(media.id)} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors" title="Ripristina">
                  <RotateCcw size={18} />
                </button>
              </div>
            ) : null
          ) : (
            <div className="space-y-4">
              {hasSeasonData && (
                <div className="flex items-center justify-between gap-2">
                  {isOwner && (
                    <button
                      onClick={() => onSaveProgress?.(media.id, Math.max(1, currentSeasonNum - 1), 'current_season')}
                      disabled={currentSeasonNum <= 1}
                      className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30"
                    >−</button>
                  )}
                  <div className="flex-1 text-emerald-400 text-sm flex items-center justify-center">
                    Stagione {currentSeasonNum}
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => { if (currentSeasonNum + 1 <= maxSeasons) onSaveProgress?.(media.id, currentSeasonNum + 1, 'current_season') }}
                      disabled={currentSeasonNum >= maxSeasons}
                      className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30"
                    >+</button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                {isOwner && (
                  <button
                    onClick={() => onSaveProgress?.(media.id, Math.max(1, media.current_episode - 1))}
                    disabled={media.current_episode <= 1}
                    className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30"
                  >−</button>
                )}
                <div className="flex-1 text-emerald-400 text-sm flex items-center justify-center gap-1.5">
                  <span>Ep. {media.current_episode}</span>
                  <span className="text-zinc-500">/ {maxEpisodesThisSeason}</span>
                </div>
                {isOwner && (
                  <button
                    onClick={() => {
                      const next = media.current_episode + 1
                      next <= maxEpisodesThisSeason
                        ? onSaveProgress?.(media.id, next)
                        : onMarkComplete?.(media.id, media)
                    }}
                    className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold"
                  >+</button>
                )}
              </div>

              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300 rounded-full" style={{ width: `${totalProgress}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">{totalProgress}% completato</span>
                {isOwner && (
                  <button onClick={() => onMarkComplete?.(media.id, media)} className="p-1.5 text-emerald-400 hover:text-emerald-300 transition-colors">
                    <CheckCircle size={20} />
                  </button>
                )}
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ profile }: { profile: Profile }) {
  return (
    <div className="relative mb-5">
      <div className="absolute -inset-3 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 rounded-full blur-xl" />
      <div className="relative w-28 h-28 sm:w-36 sm:h-36 border-2 border-violet-500/30 rounded-full overflow-hidden bg-zinc-800 shadow-2xl shadow-violet-500/10">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <span className="text-5xl font-black text-white">
              {(profile.display_name?.[0] || profile.username?.[0] || 'G').toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params)
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [steamAccount, setSteamAccount] = useState<any>(null)
  const [mediaList, setMediaList] = useState<UserMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [importingGames, setImportingGames] = useState(false)
  const [reorderingGames, setReorderingGames] = useState(false)
  const [steamMessage, setSteamMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)

  // Inline delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Notes modal
  const [selectedMedia, setSelectedMedia] = useState<UserMedia | null>(null)
  const [notesInput, setNotesInput] = useState('')
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const sortMediaList = (list: UserMedia[]) =>
    [...list].sort((a, b) => {
      if (a.type === 'game' && b.type !== 'game') return -1
      if (b.type === 'game' && a.type !== 'game') return 1
      if (a.type === 'game' && b.type === 'game') return (b.current_episode || 0) - (a.current_episode || 0)
      return (b.display_order || 0) - (a.display_order || 0)
    })

  const refreshMedia = async (userId: string) => {
    const { data } = await supabase.from('user_media_entries').select('*').eq('user_id', userId)
    if (data) setMediaList(sortMediaList(data))
  }

  // ── Actions (owner only) ──────────────────────────────────────────────────

  const importSteamGames = async () => {
    if (!steamAccount?.steam_id64 || !currentUserId || importingGames) return
    setImportingGames(true)
    setSteamMessage(null)
    try {
      const res = await fetch(`/api/steam/games?steamid=${steamAccount.steam_id64}`)
      const data = await res.json()

      // Rate limit attivo: mostra messaggio integrato invece di alert
      if (res.status === 429 && data.cached) {
        setSteamMessage({ text: data.error, type: 'error' })
        return
      }

      if (!data.success || !data.games?.length) {
        setSteamMessage({ text: 'Nessun gioco trovato o profilo Steam privato.', type: 'error' })
        return
      }
      const steamMedia = data.games.map((game: any) => ({
        user_id: currentUserId,
        title: game.name,
        type: 'game',
        appid: String(game.appid),
        cover_image: game.cover_image ?? null,
        current_episode: Math.floor(game.playtime_forever / 60),
        is_steam: true,
        display_order: Date.now(),
        updated_at: new Date().toISOString(),
        rating: 0,
      }))
      await supabase.from('user_media_entries').upsert(steamMedia, { onConflict: 'user_id,title' })
      await refreshMedia(currentUserId)
      setSteamMessage({ text: `${data.games.length} giochi importati con successo!`, type: 'success' })
    } finally {
      setImportingGames(false)
    }
  }

  const reorderGamesByHours = async () => {
    if (!currentUserId || reorderingGames) return
    setReorderingGames(true)
    try {
      const { data } = await supabase.from('user_media_entries').select('*').eq('user_id', currentUserId).eq('type', 'game')
      if (!data?.length) return
      const sorted = [...data].sort((a, b) => (b.current_episode || 0) - (a.current_episode || 0))
      const updates = sorted.map((g, i) => ({ id: g.id, display_order: Date.now() - i * 10000 }))
      await supabase.from('user_media_entries').upsert(updates)
      await refreshMedia(currentUserId)
    } finally {
      setReorderingGames(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!isOwner) return
    await supabase.from('user_media_entries').delete().eq('id', id)
    setMediaList(prev => prev.filter(item => item.id !== id))
    setDeletingId(null)
    showToast('Eliminato dalla collezione')
  }

  const markAsCompleted = async (id: string, media: UserMedia) => {
    if (!isOwner) return
    let update: any = {}
    if (media.season_episodes) {
      const maxS = Math.max(...Object.keys(media.season_episodes).map(Number))
      update = { current_season: maxS, current_episode: media.season_episodes[maxS]?.episode_count || 1 }
    } else if (media.episodes) {
      update = { current_episode: media.episodes }
    } else {
      update = { current_episode: 999 }
    }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    showToast('Completato!')
  }

  const resetProgress = async (id: string) => {
    if (!isOwner) return
    const update = { current_season: 1, current_episode: 1 }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    showToast('Progresso ripristinato')
  }

  const saveProgress = async (id: string, val: number, field: 'current_episode' | 'current_season' = 'current_episode') => {
    if (!isOwner) return
    const update = field === 'current_season' ? { current_season: val, current_episode: 1 } : { current_episode: val }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    showToast('Progresso salvato')
  }

  const setRating = async (mediaId: string, rating: number) => {
    if (!isOwner) return
    await supabase.from('user_media_entries').update({ rating }).eq('id', mediaId)
    setMediaList(prev => prev.map(item => item.id === mediaId ? { ...item, rating } : item))
    showToast('Voto salvato')
  }

  const openNotesModal = (media: UserMedia) => {
    if (!isOwner) return
    setSelectedMedia(media)
    setNotesInput(media.notes || '')
    setIsNotesModalOpen(true)
  }

  const saveNotes = async () => {
    if (!selectedMedia || !isOwner) return
    await supabase.from('user_media_entries').update({ notes: notesInput.trim() }).eq('id', selectedMedia.id)
    setMediaList(prev => prev.map(item => item.id === selectedMedia.id ? { ...item, notes: notesInput.trim() } : item))
    setIsNotesModalOpen(false)
    setSelectedMedia(null)
    showToast('Note aggiornate')
  }

  const onDragEnd = async (event: DragEndEvent) => {
    if (!isOwner) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = mediaList.findIndex(item => item.id === active.id)
    const newIndex = mediaList.findIndex(item => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newList = arrayMove(mediaList, oldIndex, newIndex).map((item, i) => ({
      ...item, display_order: Date.now() - i * 10000,
    }))
    setMediaList(newList)
    await supabase.from('user_media_entries').upsert(newList.map(item => ({ id: item.id, display_order: item.display_order })))
  }

  // ── Data fetch ────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      // 1. Utente corrente (dal server — non manipolabile)
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)

      // 2. Profilo target
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .ilike('username', username)
        .single()

      if (!profileData) { setLoading(false); return }
      setProfile(profileData)

      // 3. isOwner: confronto ID server-side — non dipende dall'URL
      const ownerCheck = !!user && user.id === profileData.id
      setIsOwner(ownerCheck)

      // 4. Steam solo se owner
      if (ownerCheck) {
        const { data: steam } = await supabase
          .from('steam_accounts')
          .select('*')
          .eq('user_id', user!.id)
          .maybeSingle()
        setSteamAccount(steam)
      }

      // 5. Media (pubblica in lettura grazie a RLS SELECT policy)
      const { data: mediaData } = await supabase
        .from('user_media_entries')
        .select('*')
        .eq('user_id', profileData.id)
      if (mediaData) setMediaList(sortMediaList(mediaData))

      // 6. Contatori followers/following
      const [{ count: fwersCount }, { count: fwingCount }] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileData.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileData.id),
      ])
      setFollowersCount(fwersCount || 0)
      setFollowingCount(fwingCount || 0)

      // 7. Segue già questo utente?
      if (user && !ownerCheck) {
        const { data: followData } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('following_id', profileData.id)
          .maybeSingle()
        setIsFollowing(!!followData)
      }

      setLoading(false)
    }
    fetchData()
  }, [username])

  // ── Handle Steam OAuth feedback from URL params ───────────────────────────
  useEffect(() => {
    const steamSuccess = searchParams.get('steam_success')
    const error = searchParams.get('error')
    if (steamSuccess === 'true') {
      showToast('Account Steam collegato con successo!', 'success')
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error) {
      const errorMessages: Record<string, string> = {
        steam_invalid: 'Risposta Steam non valida',
        steam_verification_failed: 'Verifica Steam fallita. Riprova.',
        db_error: 'Errore di salvataggio. Riprova più tardi.',
        server_error: 'Errore del server. Riprova più tardi.',
      }
      showToast(errorMessages[error] || 'Errore sconosciuto', 'error')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams])

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <Spinner />

  if (!profile) {
    return <div className="min-h-screen bg-[#080810] flex items-center justify-center text-zinc-500">Utente non trovato</div>
  }

  const grouped = mediaList.reduce((acc: Record<string, UserMedia[]>, item) => {
    const cat =
      item.type === 'game' ? 'Videogiochi'
      : item.type === 'manga' ? 'Manga'
      : item.type === 'anime' || item.type === 'tv' ? 'Serie & Anime'
      : item.type === 'movie' ? 'Film'
      : item.type === 'boardgame' ? 'Board Game'
      : 'Altro'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const categoryOrder = ['Videogiochi', 'Serie & Anime', 'Manga', 'Film', 'Board Game', 'Altro']
  const orderedCategories = categoryOrder.filter(cat => grouped[cat]?.length > 0)

  return (
    <div className="min-h-screen bg-[#080810] text-white pb-24 md:pb-10">
      <div className="pt-6 sm:pt-10 max-w-6xl mx-auto px-4 sm:px-6">

        {/* Profile hero header */}
        <div className="relative mb-8 sm:mb-12">
          {/* Ambient glow behind avatar */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-violet-600/10 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative flex flex-col items-center">
            {/* Logout — top right */}
            {currentUserId && (
              <button
                onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
                className="absolute right-0 top-0 px-4 py-2 text-xs font-medium text-zinc-500 border border-white/8 hover:border-white/20 hover:text-zinc-300 rounded-xl transition-all"
              >
                Logout
              </button>
            )}

            <Avatar profile={profile} />

            <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-1 text-center">
              {profile.display_name || profile.username}
            </h1>
            <p className="text-sm sm:text-base text-zinc-500">@{profile.username}</p>
            {profile.bio && (
              <p className="text-zinc-500 mt-3 text-center max-w-md text-sm leading-relaxed px-4">{profile.bio}</p>
            )}

            {/* Followers/Following */}
            <div className="flex items-center gap-6 mt-5 bg-zinc-900/50 border border-white/6 rounded-2xl px-6 py-3">
              <div className="text-center">
                <p className="text-xl font-black text-white">{followersCount}</p>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Follower</p>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-center">
                <p className="text-xl font-black text-white">{followingCount}</p>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Following</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex gap-3">
              {isOwner && (
                <Link href="/profile/edit">
                  <button className="px-6 py-2.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-zinc-100 transition-all">
                    Modifica profilo
                  </button>
                </Link>
              )}
              {!isOwner && currentUserId && profile && (
                <FollowButton
                  targetId={profile.id}
                  currentUserId={currentUserId}
                  isFollowingInitial={isFollowing}
                />
              )}
            </div>
          </div>
        </div>

        {/* Steam section — solo owner */}
        {isOwner && (
          <div className="bg-zinc-900/50 border border-white/6 rounded-2xl p-4 sm:p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <SteamIcon size={22} className="text-[#66C0F4]" />
                <h2 className="text-base font-semibold">Account Steam</h2>
              </div>
              {steamAccount ? (
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                  <CheckCircle size={14} /> Collegato
                </div>
              ) : (
                <span className="text-amber-400 text-xs font-medium">Non collegato</span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {steamAccount ? (
                <>
                  <button
                    onClick={importSteamGames}
                    disabled={importingGames}
                    className="flex-1 flex items-center justify-center gap-2.5 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4]/50 hover:border-[#66C0F4] py-3 rounded-xl text-sm font-medium transition disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={importingGames ? 'animate-spin' : ''} />
                    {importingGames ? 'Aggiornamento...' : 'Aggiorna giochi Steam'}
                  </button>
                  <button
                    onClick={reorderGamesByHours}
                    disabled={reorderingGames}
                    className="flex-1 flex items-center justify-center gap-2.5 bg-zinc-900 hover:bg-zinc-800 border border-violet-500/30 hover:border-violet-500/60 py-3 rounded-xl text-sm font-medium transition disabled:opacity-50"
                  >
                    <RotateCw size={16} className={reorderingGames ? 'animate-spin' : ''} />
                    {reorderingGames ? 'Riordinamento...' : 'Riordina per ore'}
                  </button>
                </>
              ) : (
                <a
                  href="/api/steam/connect"
                  className="flex-1 flex items-center justify-center gap-2.5 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4]/50 hover:border-[#66C0F4] py-3 rounded-xl text-sm font-medium transition"
                >
                  <SteamIcon size={16} />
                  Collega Account Steam
                </a>
              )}
            </div>

            {steamMessage && (
              <div className={`mt-3 px-4 py-3 rounded-xl text-sm font-medium ${
                steamMessage.type === 'error'
                  ? 'bg-red-950/40 border border-red-800/50 text-red-400'
                  : 'bg-emerald-950/40 border border-emerald-800/50 text-emerald-400'
              }`}>
                {steamMessage.text}
              </div>
            )}
          </div>
        )}

        {/* Stats bar */}
        {mediaList.length > 0 && (() => {
          const totalAnime = mediaList.filter(m => m.type === 'anime').length
          const totalGames = mediaList.filter(m => m.type === 'game').length
          const steamHours = mediaList.filter(m => m.type === 'game' && m.is_steam).reduce((s, m) => s + (m.current_episode || 0), 0)
          const rated = mediaList.filter(m => m.rating && m.rating > 0)
          const avgRating = rated.length > 0 ? (rated.reduce((s, m) => s + (m.rating || 0), 0) / rated.length).toFixed(1) : null
          const stats = [
            { label: 'Titoli', value: mediaList.length },
            { label: 'Anime', value: totalAnime },
            { label: 'Giochi', value: totalGames },
            { label: 'Ore Steam', value: steamHours },
            { label: 'Voto medio', value: avgRating ? `${avgRating}★` : '—' },
          ]
          return (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mb-8">
              {stats.map(s => (
                <div key={s.label} className="bg-zinc-900/50 border border-white/5 rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-violet-400 leading-none">{s.value}</p>
                  <p className="text-[10px] text-zinc-600 mt-1 uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Section header */}
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            {isOwner ? 'La mia collezione' : `Collezione di @${profile.username}`}
          </h2>
          {mediaList.length > 0 && (
            <span className="text-xs font-bold text-zinc-600 bg-zinc-900/60 border border-white/5 px-2.5 py-1 rounded-full">
              {mediaList.length}
            </span>
          )}
        </div>

        {mediaList.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            {isOwner ? 'Non hai ancora nulla nella tua collezione.' : 'Questo utente non ha ancora nulla nella collezione.'}
          </div>
        ) : (
          orderedCategories.map((category) => (
            <div key={category} className="mb-10 sm:mb-14">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-zinc-300 tracking-wide">{category}</h3>
                <span className="text-xs text-zinc-700">{grouped[category].length}</span>
              </div>

              {isOwner ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={grouped[category].map(m => m.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                      {grouped[category].map((media) => (
                        <SortableBox key={media.id} media={media}>
                          <MediaCard
                            media={media}
                            isOwner={true}
                            deletingId={deletingId}
                            onDelete={handleDelete}
                            onDeleteRequest={setDeletingId}
                            onDeleteCancel={() => setDeletingId(null)}
                            onRating={setRating}
                            onNotes={openNotesModal}
                            onSaveProgress={saveProgress}
                            onMarkComplete={markAsCompleted}
                            onReset={resetProgress}
                          />
                        </SortableBox>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {grouped[category].map((media) => (
                    <div key={media.id} className="border border-white/6 rounded-3xl overflow-hidden h-[400px] sm:h-[520px] flex flex-col">
                      <MediaCard media={media} isOwner={false} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal Note */}
      {isNotesModalOpen && selectedMedia && isOwner && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60]">
          <div className="bg-zinc-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg overflow-hidden shadow-2xl">
            <div className="sm:hidden w-10 h-1 bg-zinc-700 rounded-full mx-auto mt-4" />
            <div className="p-5 border-b border-white/6 flex items-center justify-between">
              <h3 className="text-base font-bold">Note su {selectedMedia.title}</h3>
              <button onClick={() => setIsNotesModalOpen(false)} className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Scrivi qui le tue note personali..."
                className="w-full h-36 bg-zinc-800 border border-white/8 focus:border-violet-500/50 rounded-xl p-4 text-sm text-white resize-none focus:outline-none transition-colors placeholder-zinc-600"
              />
            </div>
            <div className="p-5 border-t border-white/6 flex gap-3">
              <button onClick={() => setIsNotesModalOpen(false)} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm transition">
                Annulla
              </button>
              <button onClick={saveNotes} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm transition font-semibold">
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// Wrap with Suspense because ProfilePage uses useSearchParams
export default function ProfilePageWrapper(props: { params: Promise<{ username: string }> }) {
  return (
    <Suspense fallback={<Spinner />}>
      <ProfilePage {...props} />
    </Suspense>
  )
}
