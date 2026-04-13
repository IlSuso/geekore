'use client'
// src/app/profile/[username]/[type]/page.tsx
// Pagina dedicata a un tipo di media specifico nel profilo utente.
// Es: /profile/ilsuso/movie → tutti i film di ilsuso
// Es: /profile/ilsuso/anime → tutti gli anime di ilsuso

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StarRating } from '@/components/ui/StarRating'
import { SteamIcon } from '@/components/icons/SteamIcon'
import { showToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import Link from 'next/link'
import {
  ArrowLeft, Search, SlidersHorizontal, Grid3X3, List,
  Clock, CheckCircle, X, Edit3, Loader2,
} from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { NotesModal } from '@/components/profile/NotesModal'

// ─── Tipi ────────────────────────────────────────────────────────────────────

type UserMedia = {
  id: string
  title: string
  type: string
  cover_image?: string
  current_episode: number
  current_season?: number
  season_episodes?: Record<number, { episode_count: number }>
  episodes?: number
  display_order?: number
  updated_at: string
  is_steam?: boolean
  import_source?: string | null
  appid?: string
  notes?: string
  rating?: number
  status?: string
  genres?: string[]
  external_id?: string
}

type SortMode = 'rating_desc' | 'rating_asc' | 'title_asc' | 'title_desc' | 'date_desc' | 'progress_desc'
type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'completed' | 'watching' | 'paused' | 'dropped' | 'wishlist'

// ─── Mapping tipo → label ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  anime: 'Anime',
  manga: 'Manga',
  game: 'Videogiochi',
  tv: 'Serie TV',
  movie: 'Film',
  boardgame: 'Board Game',
}

const TYPE_COLORS: Record<string, string> = {
  anime: 'bg-sky-500',
  manga: 'bg-orange-500',
  game: 'bg-green-500',
  tv: 'bg-purple-500',
  movie: 'bg-red-500',
  boardgame: 'bg-yellow-500',
}

// ─── Steam cover ──────────────────────────────────────────────────────────────

function SteamCoverImg({ appid, title }: { appid?: string; title: string }) {
  const [attempt, setAttempt] = useState(0)
  const urls = appid ? [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
  ] : []

  if (!appid || attempt >= urls.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 gap-2">
        <span className="text-3xl">🎮</span>
        <p className="text-xs text-center px-2 text-zinc-400 line-clamp-2">{title}</p>
      </div>
    )
  }

  return (
    <img
      src={urls[attempt]}
      alt={title}
      className="w-full h-full object-cover"
      onError={() => setAttempt(a => a + 1)}
    />
  )
}

// ─── Card griglia ─────────────────────────────────────────────────────────────

function MediaCard({
  media, isOwner, onRating, onNotes, onStatusChange, onDelete,
}: {
  media: UserMedia
  isOwner: boolean
  onRating?: (id: string, r: number) => void
  onNotes?: (media: UserMedia) => void
  onStatusChange?: (id: string, status: string) => void
  onDelete?: (id: string) => void
}) {
  const hasNotes = !!media.notes?.trim()
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="group relative bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-3xl overflow-hidden flex flex-col transition-all">
      {/* Cover */}
      <div className="relative h-64 bg-zinc-900 flex-shrink-0 overflow-hidden">
        {/* Badge tipo */}
        <div className={`absolute bottom-3 left-3 z-20 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide ${TYPE_COLORS[media.type] || 'bg-zinc-700'}`}>
          {TYPE_LABELS[media.type] || media.type}
        </div>
        {/* Delete button */}
        {isOwner && (
          <div className="absolute top-3 right-3 z-30">
            {confirmDelete ? (
              <div className="flex gap-1">
                <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-[10px] bg-zinc-900/95 border border-zinc-600 rounded-full">Annulla</button>
                <button onClick={() => onDelete?.(media.id)} className="px-2 py-1 text-[10px] bg-red-900/95 border border-red-700 text-red-300 rounded-full">Elimina</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="opacity-0 group-hover:opacity-100 bg-black/50 hover:bg-red-950/80 border border-white/10 hover:border-red-500/60 p-1.5 rounded-xl transition-all"
              >
                <X size={14} className="text-white" />
              </button>
            )}
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-black/70 to-transparent z-10 pointer-events-none" />
        {/* Cover image */}
        {media.is_steam ? (
          <SteamCoverImg appid={media.appid} title={media.title} />
        ) : media.cover_image ? (
          <img
            src={media.cover_image}
            alt={media.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              const img = e.target as HTMLImageElement
              if (img.src.includes('anilist.co') && !img.src.includes('wsrv.nl')) {
                img.src = `https://wsrv.nl/?url=${encodeURIComponent(img.src)}&w=500&output=jpg`
              } else {
                img.onerror = null
                img.style.display = 'none'
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800">
            <span className="text-5xl opacity-30">📺</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-2">
        <h4 className="font-semibold text-sm leading-snug text-white line-clamp-2">{media.title}</h4>
        <div className="flex items-center gap-2">
          <StarRating
            value={media.rating || 0}
            onChange={isOwner ? (r) => onRating?.(media.id, r) : undefined}
            size={14}
            viewOnly={!isOwner}
          />
          {isOwner && (
            <button
              onClick={() => onNotes?.(media)}
              className={`ml-auto p-1.5 rounded-lg border transition-all ${
                hasNotes
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-zinc-900 border-zinc-800 hover:border-violet-500/60 text-zinc-600 hover:text-violet-400'
              }`}
            >
              <Edit3 size={12} />
            </button>
          )}
        </div>
        {isOwner ? (
          <select
            value={media.status || 'watching'}
            onChange={e => onStatusChange?.(media.id, e.target.value)}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-zinc-900 border-zinc-800 text-zinc-400 focus:outline-none focus:border-violet-500 transition cursor-pointer appearance-none w-fit"
          >
            <option value="watching">▶ In corso</option>
            <option value="completed">✓ Completato</option>
            <option value="paused">⏸ In pausa</option>
            <option value="dropped">✗ Abbandonato</option>
            <option value="wishlist">☆ Wishlist</option>
          </select>
        ) : (
          media.status && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit bg-zinc-800 text-zinc-400">
              {media.status === 'completed' ? '✓ Completato'
                : media.status === 'watching' ? '▶ In corso'
                : media.status === 'paused' ? '⏸ In pausa'
                : media.status === 'dropped' ? '✗ Abbandonato'
                : media.status === 'wishlist' ? '☆ Wishlist'
                : media.status}
            </span>
          )
        )}
        {/* Progress/hours */}
        {media.type === 'game' && (
          <p className="text-xs text-emerald-400 flex items-center gap-1 mt-auto">
            <Clock size={11} /> {media.current_episode}h
          </p>
        )}
        {media.type === 'boardgame' && (
          <p className="text-xs text-emerald-400 flex items-center gap-1 mt-auto">
            <Clock size={11} /> {media.current_episode} partite
          </p>
        )}
        {media.episodes && media.episodes > 1 && media.type !== 'game' && media.type !== 'boardgame' && (
          <p className="text-xs text-emerald-400 mt-auto">
            {media.current_episode}/{media.episodes} ep.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Riga lista compatta ──────────────────────────────────────────────────────

function MediaRow({
  media, isOwner, onRating, onStatusChange, onDelete,
}: {
  media: UserMedia
  isOwner: boolean
  onRating?: (id: string, r: number) => void
  onStatusChange?: (id: string, status: string) => void
  onDelete?: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl transition-colors group">
      <div className="w-10 h-14 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0">
        {media.is_steam ? (
          <SteamCoverImg appid={media.appid} title={media.title} />
        ) : media.cover_image ? (
          <img src={media.cover_image} alt={media.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-lg">📺</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-white truncate">{media.title}</p>
        {media.type === 'game' && <p className="text-xs text-emerald-400">{media.current_episode}h</p>}
        {media.episodes && media.episodes > 1 && media.type !== 'game' && (
          <p className="text-xs text-zinc-500">{media.current_episode}/{media.episodes} ep.</p>
        )}
      </div>
      <StarRating
        value={media.rating || 0}
        onChange={isOwner ? (r) => onRating?.(media.id, r) : undefined}
        size={12}
        viewOnly={!isOwner}
      />
      {isOwner && (
        <select
          value={media.status || 'watching'}
          onChange={e => onStatusChange?.(media.id, e.target.value)}
          className="text-[10px] bg-transparent text-zinc-500 focus:outline-none cursor-pointer"
        >
          <option value="watching">▶ In corso</option>
          <option value="completed">✓ Completato</option>
          <option value="paused">⏸ Pausa</option>
          <option value="dropped">✗ Abbandonato</option>
          <option value="wishlist">☆ Wishlist</option>
        </select>
      )}
      {isOwner && (
        <button onClick={() => onDelete?.(media.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ─── Pagina principale ────────────────────────────────────────────────────────

export default function ProfileTypePage() {
  const { username, type } = useParams<{ username: string; type: string }>()
  const supabase = createClient()
  const { t } = useLocale()

  const [mediaList, setMediaList] = useState<UserMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('rating_desc')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [notesOpen, setNotesOpen] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<UserMedia | null>(null)
  const [notesInput, setNotesInput] = useState('')

  const typeLabel = TYPE_LABELS[type] || type

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', username)
        .single()

      if (!profile) { setLoading(false); return }

      setProfileId(profile.id)
      setIsOwner(user?.id === profile.id)

      const { data } = await supabase
        .from('user_media_entries')
        .select('*')
        .eq('user_id', profile.id)
        .eq('type', type)

      setMediaList(data || [])
      setLoading(false)
    }
    load()
  }, [username, type])

  const handleRating = async (mediaId: string, rating: number) => {
    await supabase.from('user_media_entries').update({ rating }).eq('id', mediaId)
    setMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, rating } : m))
    showToast(t.toasts.ratingSaved)
  }

  const handleStatusChange = async (mediaId: string, status: string) => {
    await supabase.from('user_media_entries').update({ status }).eq('id', mediaId)
    setMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, status } : m))
  }

  const handleDelete = async (mediaId: string) => {
    await supabase.from('user_media_entries').delete().eq('id', mediaId)
    setMediaList(prev => prev.filter(m => m.id !== mediaId))
    showToast('Rimosso dalla collezione')
  }

  const openNotes = (media: UserMedia) => {
    setSelectedMedia(media)
    setNotesInput(media.notes || '')
    setNotesOpen(true)
  }

  const saveNotes = async () => {
    if (!selectedMedia) return
    await supabase.from('user_media_entries').update({ notes: notesInput.trim() }).eq('id', selectedMedia.id)
    setMediaList(prev => prev.map(m => m.id === selectedMedia.id ? { ...m, notes: notesInput.trim() } : m))
    setNotesOpen(false)
    showToast(t.common.save)
  }

  // Filtra e ordina
  const filtered = useMemo(() => {
    let list = [...mediaList]

    if (search.trim()) {
      list = list.filter(m => m.title.toLowerCase().includes(search.toLowerCase()))
    }
    if (statusFilter !== 'all') {
      list = list.filter(m => m.status === statusFilter)
    }

    list.sort((a, b) => {
      switch (sortMode) {
        case 'rating_desc': {
          const aR = a.rating ?? -1
          const bR = b.rating ?? -1
          return bR - aR
        }
        case 'rating_asc': {
          const aR = a.rating ?? 999
          const bR = b.rating ?? 999
          return aR - bR
        }
        case 'title_asc': return a.title.localeCompare(b.title)
        case 'title_desc': return b.title.localeCompare(a.title)
        case 'date_desc': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        case 'progress_desc': return (b.current_episode || 0) - (a.current_episode || 0)
        default: return 0
      }
    })

    return list
  }, [mediaList, search, statusFilter, sortMode])

  // Stats rapide
  const completed = mediaList.filter(m => m.status === 'completed').length
  const avgRating = mediaList.filter(m => m.rating).length > 0
    ? (mediaList.reduce((s, m) => s + (m.rating || 0), 0) / mediaList.filter(m => m.rating).length).toFixed(1)
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-violet-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <div className="max-w-screen-2xl mx-auto px-6 pt-8">

        {/* Back */}
        <Link
          href={`/profile/${username}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-6 transition"
        >
          <ArrowLeft size={14} />
          Profilo di @{username}
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-white mb-3 ${TYPE_COLORS[type] || 'bg-zinc-700'}`}>
              {typeLabel}
            </div>
            <h1 className="text-4xl font-black tracking-tighter">{typeLabel}</h1>
            <p className="text-zinc-500 mt-1 text-sm">
              {mediaList.length} titoli
              {completed > 0 && ` · ${completed} completati`}
              {avgRating && ` · voto medio ${avgRating}`}
            </p>
          </div>
        </div>

        {/* Controlli */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Ricerca */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Cerca in ${typeLabel}...`}
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
            />
          </div>

          {/* Stato */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none transition cursor-pointer"
          >
            <option value="all">Tutti gli stati</option>
            <option value="completed">✓ Completati</option>
            <option value="watching">▶ In corso</option>
            <option value="paused">⏸ In pausa</option>
            <option value="dropped">✗ Abbandonati</option>
            <option value="wishlist">☆ Wishlist</option>
          </select>

          {/* Ordinamento */}
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none transition cursor-pointer"
          >
            <option value="rating_desc">Voto (↓)</option>
            <option value="rating_asc">Voto (↑)</option>
            <option value="title_asc">Titolo (A-Z)</option>
            <option value="title_desc">Titolo (Z-A)</option>
            <option value="date_desc">Aggiunto di recente</option>
            {(type === 'game' || type === 'boardgame') && (
              <option value="progress_desc">{type === 'game' ? 'Ore (↓)' : 'Partite (↓)'}</option>
            )}
          </select>

          {/* Vista */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1 ml-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-xl transition ${viewMode === 'grid' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Grid3X3 size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-xl transition ${viewMode === 'list' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Risultati */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-zinc-600">
            <Search size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Nessun titolo trovato</p>
            {search && <p className="text-sm mt-1">Prova con un altro termine di ricerca</p>}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {filtered.map(media => (
              <MediaCard
                key={media.id}
                media={media}
                isOwner={isOwner}
                onRating={handleRating}
                onNotes={openNotes}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(media => (
              <MediaRow
                key={media.id}
                media={media}
                isOwner={isOwner}
                onRating={handleRating}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Contatore risultati */}
        {filtered.length > 0 && (
          <p className="text-center text-zinc-700 text-xs mt-8">
            {filtered.length} {filtered.length === 1 ? 'titolo' : 'titoli'}
            {filtered.length !== mediaList.length && ` (su ${mediaList.length} totali)`}
          </p>
        )}
      </div>

      {/* Modal note */}
      {notesOpen && selectedMedia && isOwner && (
        <NotesModal
          title={`Note — ${selectedMedia.title}`}
          value={notesInput}
          onChange={setNotesInput}
          onSave={saveNotes}
          onClose={() => setNotesOpen(false)}
          saveLabel={t.common.save}
          cancelLabel={t.media.cancel}
          placeholder={t.profile.notesPlaceholder}
        />
      )}
    </div>
  )
}