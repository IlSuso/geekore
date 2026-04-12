'use client'
// C4: try/catch sulle query Supabase con fallback UI esplicito
// N3: "Currently watching" live nel header profilo

import { logActivity } from '@/lib/activity'
import { Trash2, Copy, Check, Search as SearchIcon, SlidersHorizontal, ArrowUpDown, List, Grid3X3, AlertCircle, RefreshCw } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle, Clock, X, RotateCw, RotateCcw, Edit3, RefreshCw as RefreshCwIcon,
} from 'lucide-react'
import { SteamIcon } from '@/components/icons/SteamIcon'
import { StarRating } from '@/components/ui/StarRating'
import { Spinner } from '@/components/ui/Spinner'
import { showToast } from '@/components/ui/Toast'
import { FollowButton } from '@/components/profile/follow-button'
import { ProfileComments } from '@/components/profile/ProfileComments'
import { Avatar } from '@/components/ui/Avatar'
import {
  DndContext, closestCenter,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDndSensors } from '@/hooks/useDndSensors'
import { useCsrf } from '@/hooks/useCsrf'
import Link from 'next/link'
import { useLocale } from '@/lib/locale'

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
  status?: string
  genres?: string[]
}

type Profile = {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  bio?: string
}

type SortMode = 'default' | 'rating_desc' | 'title_asc' | 'title_desc' | 'progress_desc' | 'date_desc'
type ViewMode = 'grid' | 'compact'
type ProfileTab = 'collection' | 'activity' | 'comments'

// ─── Steam cover with fallbacks ──────────────────────────────────────────────

function SteamCoverImg({ appid, title, className }: { appid?: string; title: string; className?: string }) {
  const [attempt, setAttempt] = useState(0)
  const urls = appid ? [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`,
  ] : []

  if (!appid || attempt >= urls.length) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-white gap-2 ${className}`}>
        <span className="text-4xl">🎮</span>
        <p className="text-xs font-medium text-center px-3 text-zinc-400 line-clamp-2">{title}</p>
      </div>
    )
  }

  return (
    <img
      src={urls[attempt]}
      alt={title}
      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${className}`}
      onError={() => setAttempt(a => a + 1)}
    />
  )
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
      className={`cursor-grab active:cursor-grabbing rounded-3xl overflow-hidden h-[520px] flex flex-col transition-all duration-200 ${
        isDragging
          ? 'border-2 border-violet-500 shadow-2xl scale-[1.02] z-50'
          : 'border border-zinc-800 hover:border-violet-500/50 hover:shadow-xl'
      }`}
    >
      {children}
    </div>
  )
}

// ─── C4: CollectionError fallback ────────────────────────────────────────────

function CollectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mb-4">
        <AlertCircle size={24} className="text-red-400" />
      </div>
      <p className="text-zinc-300 font-medium mb-1">Errore nel caricamento della collezione</p>
      <p className="text-zinc-500 text-sm mb-5">Si è verificato un problema. Riprova.</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl text-sm text-zinc-300 transition-all"
      >
        <RefreshCw size={14} />
        Riprova
      </button>
    </div>
  )
}

// ─── N3: Currently Watching ───────────────────────────────────────────────────

function CurrentlyWatching({ userId }: { userId: string }) {
  const [activity, setActivity] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
    supabase
      .from('activity_log')
      .select('media_title, media_type, media_cover')
      .eq('user_id', userId)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setActivity(data))
  }, [userId])

  if (!activity) return null

  const MEDIA_EMOJI: Record<string, string> = {
    anime: '🎌', manga: '📖', game: '🎮', movie: '🎬', tv: '📺', boardgame: '🎲',
  }

  return (
    <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full w-fit text-xs text-zinc-400">
      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
      <span>{MEDIA_EMOJI[activity.media_type] || '▶️'} Sta guardando: {activity.media_title}</span>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const params = useParams()
  const username = params?.username as string
  const supabase = createClient()
  const { t } = useLocale()
  const csrfToken = useCsrf()
  const sensors = useDndSensors()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [mediaList, setMediaList] = useState<UserMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [mediaError, setMediaError] = useState(false) // C4: stato errore
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [steamAccount, setSteamAccount] = useState<any>(null)
  const [importingGames, setImportingGames] = useState(false)
  const [reorderingGames, setReorderingGames] = useState(false)
  const [steamMessage, setSteamMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<UserMedia | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesInput, setNotesInput] = useState('')
  const [activeTab, setActiveTab] = useState<ProfileTab>('collection')
  const [collectionSearch, setCollectionSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const sortMediaList = (list: UserMedia[]) =>
    [...list].sort((a, b) => {
      if (a.type === 'game' && b.type !== 'game') return -1
      if (b.type === 'game' && a.type !== 'game') return 1
      if (a.type === 'game' && b.type === 'game') return (b.current_episode || 0) - (a.current_episode || 0)
      return (b.display_order || 0) - (a.display_order || 0)
    })

  // C4: refreshMedia con try/catch
  const refreshMedia = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('user_media_entries').select('*').eq('user_id', userId)
      if (error) throw error
      if (data) setMediaList(sortMediaList(data))
      setMediaError(false)
    } catch {
      setMediaError(true)
    }
  }

  const importSteamGames = async () => {
    if (!steamAccount?.steam_id64 || !currentUserId || importingGames) return
    setImportingGames(true)
    setSteamMessage(null)
    try {
      const res = await fetch(`/api/steam/games?steamid=${steamAccount.steam_id64}`)
      const data = await res.json()
      if (res.status === 429 && data.cached) { setSteamMessage({ text: data.error, type: 'error' }); return }
      if (!data.success || !data.games?.length) { setSteamMessage({ text: t.toasts.steamNoGames, type: 'error' }); return }
      await refreshMedia(currentUserId)
      const cpMsg = data.core_power != null ? ` Core Power: ${data.core_power}.` : ''
      setSteamMessage({ text: `${t.toasts.steamImported(data.games.length)}${cpMsg}`, type: 'success' })
    } finally { setImportingGames(false) }
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
    } finally { setReorderingGames(false) }
  }

  const handleDelete = async (id: string) => {
    if (!isOwner) return
    await supabase.from('user_media_entries').delete().eq('id', id)
    setMediaList(prev => prev.filter(item => item.id !== id))
    setDeletingId(null)
    showToast(t.toasts.deleted)
  }

  const markAsCompleted = async (id: string, media: UserMedia) => {
    if (!isOwner) return
    let update: any = {}
    if (media.season_episodes) {
      const maxS = Math.max(...Object.keys(media.season_episodes).map(Number))
      update = { current_season: maxS, current_episode: media.season_episodes[maxS]?.episode_count || 1, status: 'completed' }
    } else if (media.episodes) {
      update = { current_episode: media.episodes, status: 'completed' }
    } else {
      update = { current_episode: 1, status: 'completed' }
    }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    showToast(t.toasts.completed)
    await logActivity({ type: 'media_completed', media_id: media.id, media_title: media.title, media_type: media.type, media_cover: media.cover_image })
  }

  const resetProgress = async (id: string) => {
    if (!isOwner) return
    const update = { current_season: 1, current_episode: 1, status: 'watching' }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    showToast(t.toasts.progressReset)
  }

  const saveProgress = async (id: string, val: number, field: 'current_episode' | 'current_season' = 'current_episode') => {
    if (!isOwner) return
    const update = field === 'current_season' ? { current_season: val, current_episode: 1 } : { current_episode: val }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
  }

  const saveRating = async (mediaId: string, rating: number) => {
    if (!isOwner) return
    await supabase.from('user_media_entries').update({ rating }).eq('id', mediaId)
    setMediaList(prev => prev.map(item => item.id === mediaId ? { ...item, rating } : item))
    showToast(t.toasts.ratingSaved)
  }

  const saveNotes = async () => {
    if (!isOwner || !selectedMedia) return
    // SEC3: sanifica note prima di salvare (strip HTML)
    const sanitized = notesInput.trim().replace(/<[^>]*>/g, '').slice(0, 1000)
    await supabase.from('user_media_entries').update({ notes: sanitized }).eq('id', selectedMedia.id)
    setMediaList(prev => prev.map(item => item.id === selectedMedia.id ? { ...item, notes: sanitized } : item))
    setSelectedMedia(prev => prev ? { ...prev, notes: sanitized } : prev)
    setEditingNotes(false)
    showToast(t.toasts.notesSaved)
  }

  const updateStatus = async (id: string, status: string) => {
    if (!isOwner) return
    await supabase.from('user_media_entries').update({ status }).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, status } : item))
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = mediaList.findIndex(i => i.id === active.id)
    const newIndex = mediaList.findIndex(i => i.id === over.id)
    const newList = arrayMove(mediaList, oldIndex, newIndex).map((item, i) => ({
      ...item, display_order: Date.now() - i * 10000,
    }))
    setMediaList(newList)
    await supabase.from('user_media_entries').upsert(newList.map(item => ({ id: item.id, display_order: item.display_order })))
  }

  // C4: fetchData con try/catch su ogni query
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUserId(user?.id || null)

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio')
          .ilike('username', username)
          .single()

        if (profileError || !profileData) { setLoading(false); return }
        setProfile(profileData)

        const ownerCheck = !!user && user.id === profileData.id
        setIsOwner(ownerCheck)

        // C4: wrap ogni query in try/catch separato
        const results = await Promise.allSettled([
          ownerCheck
            ? supabase.from('steam_accounts').select('*').eq('user_id', user!.id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.from('user_media_entries').select('*').eq('user_id', profileData.id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileData.id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileData.id),
          (user && !ownerCheck)
            ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', profileData.id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ])

        if (ownerCheck && results[0].status === 'fulfilled') {
          setSteamAccount((results[0].value as any).data)
        }

        if (results[1].status === 'fulfilled') {
          const mediaResult = results[1].value as any
          if (mediaResult.error) {
            setMediaError(true) // C4: mostra fallback UI
          } else if (mediaResult.data) {
            setMediaList(sortMediaList(mediaResult.data))
          }
        } else {
          setMediaError(true) // C4
        }

        if (results[2].status === 'fulfilled') {
          setFollowersCount((results[2].value as any).count || 0)
        }
        if (results[3].status === 'fulfilled') {
          setFollowingCount((results[3].value as any).count || 0)
        }
        if (user && !ownerCheck && results[4].status === 'fulfilled') {
          setIsFollowing(!!(results[4].value as any).data)
        }
      } catch (err) {
        // errore generico fetch profilo
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [username])

  useEffect(() => {
    if (!steamMessage) return
    const timer = setTimeout(() => setSteamMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [steamMessage])

  if (loading) return <Spinner />
  if (!profile) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">{t.profile.notFound}</div>

  const cats = t.profile.categories

  const filteredList = mediaList.filter(m => {
    const matchSearch = !collectionSearch.trim() || m.title.toLowerCase().includes(collectionSearch.toLowerCase().trim())
    const matchType = activeTypeFilter === 'all' || m.type === activeTypeFilter
    const matchStatus = statusFilter === 'all' || m.status === statusFilter
    return matchSearch && matchType && matchStatus
  })

  const sortedList = [...filteredList].sort((a, b) => {
    switch (sortMode) {
      case 'rating_desc': return (b.rating || 0) - (a.rating || 0)
      case 'title_asc': return a.title.localeCompare(b.title)
      case 'title_desc': return b.title.localeCompare(a.title)
      case 'progress_desc': return (b.current_episode || 0) - (a.current_episode || 0)
      case 'date_desc': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      default: return 0
    }
  })

  const geekScore = mediaList.reduce((acc, m) => {
    if (m.type === 'game') return acc + Math.min(m.current_episode || 0, 500)
    return acc + (m.current_episode || 0) * 10
  }, 0)

  const typeGroups = ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']
  const typeCounts = typeGroups.reduce((acc, t) => {
    acc[t] = mediaList.filter(m => m.type === t).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      {/* Profile header */}
      <div className="max-w-5xl mx-auto px-4 pt-10">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-violet-500/20 mb-4">
            <Avatar
              src={profile.avatar_url}
              username={profile.username}
              displayName={profile.display_name}
              size={112}
              className="rounded-full"
            />
          </div>

          <h1 className="text-2xl font-bold">{profile.display_name || profile.username}</h1>
          <p className="text-zinc-500 text-sm">@{profile.username}</p>
          {profile.bio && <p className="text-zinc-400 text-sm mt-2 max-w-xs">{profile.bio}</p>}

          {/* N3: Currently watching */}
          <CurrentlyWatching userId={profile.id} />

          {/* Stats */}
          <div className="flex gap-8 mt-6">
            <div className="text-center">
              <p className="text-xl font-bold">{followersCount}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">{t.profile.followers}</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{followingCount}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">{t.profile.following}</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{mediaList.length}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">{t.profile.media}</p>
            </div>
          </div>

          {currentUserId && !isOwner && (
            <div className="mt-4">
              <FollowButton
                targetId={profile.id}
                currentUserId={currentUserId}
                isFollowingInitial={isFollowing}
                onFollowChange={(nowFollowing) => setFollowersCount(prev => nowFollowing ? prev + 1 : Math.max(0, prev - 1))}
              />
            </div>
          )}
          {isOwner && (
            <div className="mt-4">
              <Link href="/profile/edit" className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full text-sm font-medium transition-colors">
                {t.profile.editProfile}
              </Link>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-1">
          {(['collection', 'activity', 'comments'] as ProfileTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all capitalize ${
                activeTab === tab ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab === 'collection' ? cats.collection : tab === 'activity' ? cats.activity : cats.comments}
            </button>
          ))}
        </div>

        {/* Collection tab */}
        {activeTab === 'collection' && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-6">
              <div className="relative flex-1 min-w-[180px]">
                <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder={t.profile.search}
                  value={collectionSearch}
                  onChange={e => setCollectionSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
              <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-white'}`}
                >
                  <Grid3X3 size={14} />
                </button>
                <button
                  onClick={() => setViewMode('compact')}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === 'compact' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-white'}`}
                >
                  <List size={14} />
                </button>
              </div>
            </div>

            {/* Type filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6 hide-scrollbar">
              {['all', ...typeGroups].map(type => (
                typeCounts[type] !== 0 || type === 'all' ? (
                  <button
                    key={type}
                    onClick={() => setActiveTypeFilter(type)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      activeTypeFilter === type
                        ? 'bg-violet-600 text-white'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {type === 'all' ? 'Tutti' : cats[type as keyof typeof cats] || type}
                    {type !== 'all' && typeCounts[type] > 0 && (
                      <span className="ml-1.5 text-[10px] opacity-60">{typeCounts[type]}</span>
                    )}
                  </button>
                ) : null
              ))}
            </div>

            {/* C4: mostra CollectionError se la query ha fallito */}
            {mediaError ? (
              <CollectionError onRetry={() => currentUserId ? refreshMedia(currentUserId) : undefined} />
            ) : sortedList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-zinc-500 font-medium">{collectionSearch ? 'Nessun risultato' : t.profile.emptyCollection}</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedList.map(m => m.id)} strategy={rectSortingStrategy}>
                  <div className={viewMode === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
                    : 'space-y-2'
                  }>
                    {sortedList.map(media => (
                      <SortableBox key={media.id} media={media}>
                        {/* Cover area */}
                        <div
                          className="relative h-60 bg-zinc-800 flex-shrink-0 group cursor-pointer overflow-hidden"
                          onClick={() => setSelectedMedia(media)}
                        >
                          {media.is_steam ? (
                            <SteamCoverImg appid={media.appid} title={media.title} className="" />
                          ) : media.cover_image ? (
                            <img
                              src={media.cover_image}
                              alt={media.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-4xl">
                              {media.type === 'game' ? '🎮' : media.type === 'anime' ? '🎌' : '📺'}
                            </div>
                          )}
                          {/* Type badge */}
                          <div className="absolute top-2 left-2">
                            <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-full text-[10px] font-bold uppercase text-white">
                              {media.type}
                            </span>
                          </div>
                          {media.is_steam && (
                            <div className="absolute top-2 right-2">
                              <SteamIcon size={14} className="text-[#66C0F4]" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-3 bg-zinc-950 min-h-0">
                          <h3 className="font-semibold text-sm leading-tight line-clamp-2">{media.title}</h3>
                          <StarRating
                            value={media.rating || 0}
                            onChange={isOwner ? (v) => saveRating(media.id, v) : undefined}
                            size={14}
                          />
                          <div className="mt-auto space-y-2">
                            {/* Progress display */}
                            {media.type === 'game' ? (
                              <p className="text-xs text-zinc-500">{media.current_episode || 0}h giocate</p>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-violet-500 rounded-full transition-all"
                                    style={{ width: `${media.episodes ? Math.min(100, ((media.current_episode || 0) / media.episodes) * 100) : 0}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-zinc-500 tabular-nums">
                                  {media.current_episode || 0}{media.episodes ? `/${media.episodes}` : ''}
                                </span>
                              </div>
                            )}

                            {isOwner && (
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeletingId(media.id) }}
                                  className="flex-1 py-1.5 text-[10px] font-medium rounded-lg bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-500 transition-colors"
                                >
                                  {t.profile.delete}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); markAsCompleted(media.id, media) }}
                                  className="flex-1 py-1.5 text-[10px] font-medium rounded-lg bg-zinc-800 hover:bg-emerald-500/20 hover:text-emerald-400 text-zinc-500 transition-colors"
                                >
                                  ✓
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Delete confirm overlay */}
                        {deletingId === media.id && (
                          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-10 p-6">
                            <p className="text-sm font-medium text-center">{t.profile.deleteConfirm}</p>
                            <div className="flex gap-2 w-full">
                              <button
                                onClick={() => handleDelete(media.id)}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-semibold transition-colors"
                              >
                                {t.profile.deleteYes}
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="flex-1 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-sm font-semibold transition-colors"
                              >
                                {t.profile.deleteNo}
                              </button>
                            </div>
                          </div>
                        )}
                      </SortableBox>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </>
        )}

        {activeTab === 'activity' && (
          <div className="text-center py-20 text-zinc-500">
            <p>Attività in arrivo...</p>
          </div>
        )}

        {activeTab === 'comments' && (
          <ProfileComments profileId={profile.id} currentUserId={currentUserId} />
        )}
      </div>
    </div>
  )
}
