'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, RefreshCw, SlidersHorizontal, Gamepad2, Tv, Film,
  BookOpen, Zap, Plus, Bookmark, X, Check, ChevronDown, ChevronUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useLocale } from '@/lib/locale'

// ── Tipi ────────────────────────────────────────────────────────────────────

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game'

interface Recommendation {
  id: string
  title: string
  type: MediaType
  coverImage?: string
  year?: number
  genres: string[]
  score?: number
  description?: string
  why: string
}

interface TasteProfile {
  globalGenres: Array<{ genre: string; score: number }>
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>
  collectionSize: Record<string, number>
}

// ── Generi disponibili per ogni tipo ────────────────────────────────────────

const ANIME_GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Psychological']
const MANGA_GENRES = [...ANIME_GENRES, 'Shounen', 'Seinen', 'Shoujo', 'Josei']
const GAME_GENRES = ['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports',
  'Racing', 'Shooter', 'Puzzle', 'Horror', 'Platformer', 'Fighting', 'Stealth', 'Sandbox']
const MOVIE_GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Fantasy', 'History', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War']
const TV_GENRES = [...MOVIE_GENRES, 'Reality', 'Talk']

const TYPE_ICONS: Record<MediaType, React.ElementType> = {
  anime: Tv, manga: BookOpen, game: Gamepad2, movie: Film, tv: Tv,
}

const TYPE_COLORS: Record<MediaType, string> = {
  anime: 'from-violet-500 to-purple-500',
  manga: 'from-pink-500 to-rose-500',
  game: 'from-green-500 to-emerald-500',
  movie: 'from-amber-500 to-orange-500',
  tv: 'from-cyan-500 to-blue-500',
}

// ── Componente Card ──────────────────────────────────────────────────────────

function RecommendationCard({
  item, onAdd, onWishlist, alreadyAdded, inWishlist,
}: {
  item: Recommendation
  onAdd: (item: Recommendation) => void
  onWishlist: (item: Recommendation) => void
  alreadyAdded: boolean
  inWishlist: boolean
}) {
  const { t } = useLocale()
  const fy = t.forYou
  const Icon = TYPE_ICONS[item.type]
  const colorClass = TYPE_COLORS[item.type]
  const displayScore = item.score ? Math.min(item.score, 5) : undefined

  return (
    <div className="flex-shrink-0 w-36 group">
      <div className="relative h-52 rounded-2xl overflow-hidden bg-zinc-900 mb-2">
        {item.coverImage ? (
          <img
            src={item.coverImage}
            alt={item.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/144x208/27272a/ffffff?text=N/A' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon size={32} className="text-zinc-700" />
          </div>
        )}

        <div className={`absolute top-2 left-2 bg-gradient-to-r ${colorClass} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
          {item.type.toUpperCase()}
        </div>

        {displayScore && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            ★ {displayScore.toFixed(1)}
          </div>
        )}

        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end pb-3 gap-2">
          <button
            onClick={() => onAdd(item)}
            disabled={alreadyAdded}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all w-28 justify-center ${
              alreadyAdded
                ? 'bg-zinc-700 text-zinc-400 cursor-default'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
          >
            {alreadyAdded ? <Check size={12} /> : <Plus size={12} />}
            {alreadyAdded ? t.discover.added : fy.addToCollection}
          </button>
          <button
            onClick={() => onWishlist(item)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all w-28 justify-center ${
              inWishlist
                ? 'bg-amber-600/80 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            <Bookmark size={12} fill={inWishlist ? 'currentColor' : 'none'} />
            {fy.addToWishlist}
          </button>
        </div>
      </div>

      <p className="text-xs font-semibold text-white leading-tight line-clamp-2 mb-1">{item.title}</p>
      {item.year && <p className="text-[10px] text-zinc-500">{item.year}</p>}
      <p className="text-[10px] text-violet-400 leading-tight line-clamp-2 mt-1 italic">{item.why}</p>
    </div>
  )
}

// ── Componente Sezione ───────────────────────────────────────────────────────

function RecommendationSection({
  type, items, label, onAdd, onWishlist, addedIds, wishlistIds,
}: {
  type: MediaType
  items: Recommendation[]
  label: string
  onAdd: (item: Recommendation) => void
  onWishlist: (item: Recommendation) => void
  addedIds: Set<string>
  wishlistIds: Set<string>
}) {
  const Icon = TYPE_ICONS[type]
  const colorClass = TYPE_COLORS[type]
  if (items.length === 0) return null

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-8 h-8 bg-gradient-to-br ${colorClass} rounded-xl flex items-center justify-center shadow-lg`}>
          <Icon size={16} className="text-white" />
        </div>
        <h2 className="text-lg font-bold text-white">{label}</h2>
        <span className="text-xs text-zinc-500 ml-auto">{items.length} titoli</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {items.map(item => (
          <RecommendationCard
            key={item.id}
            item={item}
            onAdd={onAdd}
            onWishlist={onWishlist}
            alreadyAdded={addedIds.has(item.id)}
            inWishlist={wishlistIds.has(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Componente Taste Profile Widget ─────────────────────────────────────────

function TasteWidget({ tasteProfile, totalEntries }: { tasteProfile: TasteProfile; totalEntries: number }) {
  const [open, setOpen] = useState(false)
  const { t } = useLocale()

  const typeLabels: Record<string, string> = {
    anime: 'Anime', manga: 'Manga', game: 'Giochi', movie: 'Film', tv: 'Serie',
  }

  const topTypes = Object.entries(tasteProfile.collectionSize)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([type]) => type)

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-10">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white">{t.forYou.tasteTitle}</p>
            <p className="text-xs text-zinc-500">{t.forYou.entriesAnalyzed(totalEntries)}</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </button>

      {open && (
        <div className="mt-5 space-y-4">
          {tasteProfile.globalGenres.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">I tuoi generi (tutti i media)</p>
              <div className="flex flex-wrap gap-1.5">
                {tasteProfile.globalGenres.slice(0, 6).map(({ genre }) => (
                  <span key={genre} className="text-[10px] bg-fuchsia-500/20 text-fuchsia-300 px-2 py-0.5 rounded-full font-medium">
                    {genre}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {topTypes.map(type => {
              const genres = tasteProfile.topGenres[type as MediaType]?.slice(0, 3) || []
              if (genres.length === 0) return null
              return (
                <div key={type}>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                    {typeLabels[type] || type}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {genres.map(({ genre }) => (
                      <span key={genre} className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente Modal Preferenze ──────────────────────────────────────────────

function PreferencesModal({
  onClose, onSaved,
}: { onClose: () => void; onSaved: () => void }) {
  const { t } = useLocale()
  const fy = t.forYou
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState<Record<string, string[]>>({
    fav_game_genres: [], fav_anime_genres: [], fav_movie_genres: [],
    fav_tv_genres: [], fav_manga_genres: [], disliked_genres: [],
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).single()
      if (data) {
        setPrefs({
          fav_game_genres: data.fav_game_genres || [],
          fav_anime_genres: data.fav_anime_genres || [],
          fav_movie_genres: data.fav_movie_genres || [],
          fav_tv_genres: data.fav_tv_genres || [],
          fav_manga_genres: data.fav_manga_genres || [],
          disliked_genres: data.disliked_genres || [],
        })
      }
    }
    load()
  }, [])

  const toggle = (key: string, genre: string) => {
    setPrefs(prev => ({
      ...prev,
      [key]: prev[key].includes(genre)
        ? prev[key].filter(g => g !== genre)
        : [...prev[key], genre],
    }))
  }

  const save = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('user_preferences').upsert({
      user_id: user.id,
      ...prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    setSaving(false)
    showToast(fy.prefsSaved)
    onSaved()
    onClose()
  }

  const sections: Array<{ key: string; label: string; genres: string[] }> = [
    { key: 'fav_game_genres', label: fy.prefsGameGenres, genres: GAME_GENRES },
    { key: 'fav_anime_genres', label: fy.prefsAnimeGenres, genres: ANIME_GENRES },
    { key: 'fav_movie_genres', label: fy.prefsMovieGenres, genres: MOVIE_GENRES },
    { key: 'fav_tv_genres', label: fy.prefsTvGenres, genres: TV_GENRES },
    { key: 'fav_manga_genres', label: fy.prefsMangaGenres, genres: MANGA_GENRES },
    { key: 'disliked_genres', label: fy.prefsDisliked, genres: [...new Set([...GAME_GENRES, ...ANIME_GENRES, ...MOVIE_GENRES])] },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white">{fy.prefsTitle}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {sections.map(({ key, label, genres }) => (
            <div key={key}>
              <p className="text-sm font-semibold text-zinc-300 mb-3">{label}</p>
              <div className="flex flex-wrap gap-2">
                {genres.map(genre => {
                  const selected = prefs[key]?.includes(genre)
                  return (
                    <button
                      key={genre}
                      onClick={() => toggle(key, genre)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selected
                          ? key === 'disliked_genres'
                            ? 'bg-red-500/20 border-red-500/50 text-red-300'
                            : 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {genre}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-zinc-800">
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3 rounded-2xl transition-colors"
          >
            {saving ? fy.prefsSaving : fy.prefsSave}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pagina principale ────────────────────────────────────────────────────────

export default function ForYouPage() {
  const supabase = createClient()
  const router = useRouter()
  const { t } = useLocale()
  const fy = t.forYou

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation[]>>({})
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null)
  const [totalEntries, setTotalEntries] = useState(0)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set())
  const [showPrefs, setShowPrefs] = useState(false)
  const [isCached, setIsCached] = useState(false)

  const fetchRecommendations = useCallback(async (forceRefresh = false) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Usa sempre forceRefresh=true al primo carico e quando esplicitamente richiesto
    // Questo garantisce che la collezione esistente (inclusi giochi Steam) venga letta
    const url = `/api/recommendations?type=all${forceRefresh ? '&refresh=1' : ''}`
    const res = await fetch(url)
    if (!res.ok) return

    const json = await res.json()
    setRecommendations(json.recommendations || {})
    setTasteProfile(json.tasteProfile || null)
    setIsCached(!!json.cached)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Carica collezione e wishlist
      const [{ data: entries }, { data: wish }] = await Promise.all([
        supabase.from('user_media_entries').select('external_id').eq('user_id', user.id),
        supabase.from('wishlist').select('external_id').eq('user_id', user.id),
      ])

      setAddedIds(new Set((entries || []).map(e => e.external_id).filter(Boolean)))
      setWishlistIds(new Set((wish || []).map(w => w.external_id).filter(Boolean)))
      setTotalEntries(entries?.length || 0)

      // Al primo carico forziamo sempre il refresh per leggere tutta la collezione esistente
      // inclusi giochi Steam già presenti e media aggiunti prima di questa sessione
      await fetchRecommendations(true)
      setLoading(false)
    }
    init()
  }, [])

  // ── Realtime: ascolta nuove voci nella collezione ─────────────────────────
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    const setupChannel = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      channel = supabase
        .channel('for-you-collection-watch')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'user_media_entries',
          filter: `user_id=eq.${user.id}`,
        }, async () => {
          const [{ data: entries }, { data: wish }] = await Promise.all([
            supabase.from('user_media_entries').select('external_id').eq('user_id', user.id),
            supabase.from('wishlist').select('external_id').eq('user_id', user.id),
          ])
          setAddedIds(new Set((entries || []).map((e: any) => e.external_id).filter(Boolean)))
          setWishlistIds(new Set((wish || []).map((w: any) => w.external_id).filter(Boolean)))
          setTotalEntries(entries?.length || 0)

          // Rigenera con la collezione aggiornata
          await fetchRecommendations(true)
        })
        .subscribe()
    }

    setupChannel()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [fetchRecommendations])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchRecommendations(true)
    setRefreshing(false)
  }

  const handleAdd = async (item: Recommendation) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id,
      external_id: item.id,
      title: item.title,
      type: item.type,
      cover_image: item.coverImage,
      genres: item.genres,
      status: item.type === 'movie' ? 'completed' : 'watching',
      current_episode: 1,
    })

    if (!error) {
      setAddedIds(prev => new Set([...prev, item.id]))
      showToast(`"${item.title}" aggiunto alla collezione`)
    }
  }

  const handleWishlist = async (item: Recommendation) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (wishlistIds.has(item.id)) {
      await supabase.from('wishlist').delete().eq('user_id', user.id).eq('external_id', item.id)
      setWishlistIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
      showToast(t.discover.wishlistRemove)
    } else {
      await supabase.from('wishlist').upsert({
        user_id: user.id, external_id: item.id, title: item.title,
        type: item.type, cover_image: item.coverImage,
      }, { onConflict: 'user_id,external_id' })
      setWishlistIds(prev => new Set([...prev, item.id]))
      showToast(t.discover.wishlistAdd)
    }
  }

  const hasEnoughData = totalEntries >= 1

  const SECTIONS: Array<{ key: MediaType; label: string }> = [
    { key: 'game', label: fy.sections.game },
    { key: 'anime', label: fy.sections.anime },
    { key: 'movie', label: fy.sections.movie },
    { key: 'tv', label: fy.sections.tv },
    { key: 'manga', label: fy.sections.manga },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400 text-sm">{t.common.loading}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-8 pb-24 max-w-6xl mx-auto px-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-10">
          <div className="flex-1">
            <h1 className="text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400">
              {fy.title}
            </h1>
            <p className="text-zinc-400 mt-2">{fy.subtitle}</p>
            {isCached && (
              <p className="text-xs text-zinc-600 mt-1">Dalla cache</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPrefs(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-2xl text-sm font-medium text-zinc-300 transition-all"
            >
              <SlidersHorizontal size={16} />
              {fy.preferences}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-2xl text-sm font-medium text-white transition-all"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? fy.refreshing : fy.refresh}
            </button>
          </div>
        </div>

        {/* Empty state */}
        {!hasEnoughData ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Sparkles size={28} className="text-zinc-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">{fy.title}</h2>
            <p className="text-zinc-400 max-w-md mx-auto mb-8">{fy.emptyState}</p>
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-2xl transition-colors"
            >
              <Zap size={18} />
              {fy.emptyStateCta}
            </Link>
          </div>
        ) : (
          <>
            {tasteProfile && (
              <TasteWidget tasteProfile={tasteProfile} totalEntries={totalEntries} />
            )}

            {SECTIONS.map(({ key, label }) => {
              const items = recommendations[key] || []
              return (
                <RecommendationSection
                  key={key}
                  type={key}
                  items={items}
                  label={label}
                  onAdd={handleAdd}
                  onWishlist={handleWishlist}
                  addedIds={addedIds}
                  wishlistIds={wishlistIds}
                />
              )
            })}

            {SECTIONS.every(({ key }) => (recommendations[key] || []).length === 0) && (
              <div className="text-center py-20">
                <p className="text-zinc-400">{fy.sectionEmpty}</p>
                <button onClick={handleRefresh} className="mt-4 text-violet-400 text-sm hover:underline">
                  {fy.refresh}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showPrefs && (
        <PreferencesModal
          onClose={() => setShowPrefs(false)}
          onSaved={handleRefresh}
        />
      )}
    </div>
  )
}