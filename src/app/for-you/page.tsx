'use client'
// DESTINAZIONE: src/app/for-you/page.tsx
// V5: Serendipity badge + Award badge + Seasonal badge + Social boost display +
//     lowConfidence banner + Feedback granulare micro-menu + Anti-ripetizione (recommendations_shown)

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, RefreshCw, SlidersHorizontal, Gamepad2, Tv, Film, BookOpen,
  Zap, Plus, Bookmark, X, Check, ChevronDown, ChevronUp, Users, Compass,
  ThumbsDown, Eye, Flame, Brain, Star, ArrowRight, Clapperboard, Swords,
  TrendingUp, Search, BookmarkCheck, Sun, Dice5, Trophy, Calendar,
  MessageCircleQuestion, Tag, MonitorPlay, AlertCircle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'
import { SkeletonForYouRow, SkeletonFriendsWatching } from '@/components/ui/SkeletonCard'
import { SimilarTasteFriends } from '@/components/social/SimilarTasteFriends'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'

// V5: Tipi per feedback granulare
type FeedbackAction = 'not_interested' | 'already_seen' | 'added' | 'wishlist_add';
type FeedbackReason = 'too_similar' | 'not_my_genre' | 'already_know' | 'bad_rec' | undefined;

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'
type Mood = 'light' | 'intense' | 'deep' | null

interface Recommendation {
  id: string; title: string; type: MediaType; coverImage?: string; year?: number
  genres: string[]; score?: number; description?: string; why: string
  matchScore: number; isDiscovery?: boolean
  episodes?: number        // ep per anime/TV, cap. per manga
  tags?: string[]       // AniList tags / IGDB themes
  keywords?: string[]   // TMDb keywords / IGDB keywords
  // V3 fields
  isContinuity?: boolean
  continuityFrom?: string
  creatorBoost?: string
  // V4/V5 fields
  isSerendipity?: boolean
  isAwardWinner?: boolean
  isSeasonal?: boolean
  socialBoost?: string
  // Fix 2.9: amico ad alta similarità che sta guardando questo
  friendWatching?: string
}

interface TasteProfile {
  globalGenres: Array<{ genre: string; score: number }>
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>
  collectionSize: Record<string, number>
  recentWindow?: number
  deepSignals?: { topThemes: string[]; topTones: string[]; topSettings: string[] }
  discoveryGenres?: string[]
  negativeGenres?: string[]
  // V3 fields
  creatorScores?: {
    topStudios: Array<{ name: string; score: number }>
    topDirectors: Array<{ name: string; score: number }>
  }
  bingeProfile?: {
    isBinger: boolean
    avgCompletionDays: number
    bingeGenres: string[]
    slowGenres: string[]
  }
  wishlistGenres?: string[]
  searchIntentGenres?: string[]
  lowConfidence?: boolean
}

interface FriendActivity {
  userId: string; username: string; displayName?: string; avatarUrl?: string
  mediaId: string; mediaTitle: string; mediaCover?: string; mediaType: string; updatedAt: string
  isHighSim?: boolean; simScore?: number  // Fix 2.9
}

const ANIME_GENRES = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological']
const MANGA_GENRES = [...ANIME_GENRES,'Shounen','Seinen','Shoujo','Josei']
const GAME_GENRES = ['Action','Adventure','RPG','Strategy','Simulation','Sports','Racing','Shooter','Puzzle','Horror','Platformer','Fighting','Stealth','Sandbox']
const BOARDGAME_GENRES = ['Strategy','Eurogame','Cooperative','Deck Building','Worker Placement','Area Control','Engine Building','Abstract','Party','Dungeon Crawler','Wargame','Economic','Puzzle','Roll and Write','Legacy']
const MOVIE_GENRES = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Fantasy','History','Horror','Mystery','Romance','Science Fiction','Thriller','War']
const TV_GENRES = [...MOVIE_GENRES,'Reality','Talk']
const TYPE_ICONS: Record<MediaType, React.ElementType> = { anime: Tv, manga: BookOpen, game: Gamepad2, movie: Film, tv: Tv, boardgame: Dice5 }
const TYPE_COLORS: Record<MediaType, string> = { anime: 'from-violet-500 to-purple-500', manga: 'from-pink-500 to-rose-500', game: 'from-green-500 to-emerald-500', movie: 'from-amber-500 to-orange-500', tv: 'from-cyan-500 to-blue-500', boardgame: 'from-yellow-500 to-amber-500' }
const TYPE_LABEL: Record<MediaType, string> = { anime: 'Anime', manga: 'Manga', game: 'Gioco', movie: 'Film', tv: 'Serie TV', boardgame: 'Board Game' }

// V3: fire-and-forget taste delta update
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

function MatchBadge({ score }: { score: number }) {
  if (score < 45) return null
  const { label, cls } = score >= 85
    ? { label: 'Match perfetto', cls: 'bg-violet-500/20 text-violet-300 border-violet-500/40' }
    : score >= 70
    ? { label: 'Molto in linea', cls: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40' }
    : { label: 'Vale la pena', cls: 'bg-zinc-700/60 text-zinc-300 border-zinc-600/40' }
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${cls}`}>
      <Star size={8} fill="currentColor" />{label}
    </div>
  )
}

function ContinuityBadge({ from }: { from: string }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-[9px] font-bold text-amber-300">
      <ArrowRight size={8} />Sequel
    </div>
  )
}

function CreatorBadge({ creator }: { creator: string }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-sky-500/40 bg-sky-500/10 text-[9px] font-bold text-sky-300 truncate max-w-full" title={creator}>
      <Clapperboard size={8} />{creator}
    </div>
  )
}

function TrendingBadge() {
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-orange-500/40 bg-orange-500/10 text-[9px] font-bold text-orange-300">
      <TrendingUp size={8} />Trending
    </div>
  )
}

const MOODS = [
  { id: 'light' as Mood, label: 'Leggero', Icon: Sun, desc: 'Commedia, avventura, feel-good' },
  { id: 'intense' as Mood, label: 'Adrenalina', Icon: Zap, desc: 'Action, thriller, tensione' },
  { id: 'deep' as Mood, label: 'Profondo', Icon: Brain, desc: 'Drama, psicologico, mistero' },
]


// Fix 2.3: MoodSelector come bottom sheet — risparmia ~120px verticali
function MoodPill({ mood, onClick }: { mood: Mood; onClick: () => void }) {
  const active = MOODS.find(m => m.id === mood)
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${mood ? 'bg-violet-600/20 border-violet-500/40 text-violet-300' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'}`}>
      {active ? <active.Icon size={13} /> : <Sun size={13} />}
      {active ? active.label : 'Umore'}
      <ChevronDown size={11} className="opacity-60" />
    </button>
  )
}

function MoodBottomSheet({ mood, onChange, onClose }: { mood: Mood; onChange: (m: Mood) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-700 rounded-3xl p-5 pb-6"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">Che umore sei oggi?</p>
        <div className="space-y-2">
          <button onClick={() => { onChange(null); onClose() }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm transition-all ${!mood ? 'bg-zinc-700 border-zinc-600 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}>
            <Sparkles size={18} className="opacity-70" />
            <div className="text-left">
              <p className="font-semibold">Tutti i consigli</p>
              <p className="text-[11px] text-zinc-500">Mostra tutto senza filtri</p>
            </div>
          </button>
          {MOODS.map(m => (
            <button key={m.id} onClick={() => { onChange(mood === m.id ? null : m.id); onClose() }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm transition-all ${mood === m.id ? 'bg-violet-600/20 border-violet-500/50 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}>
              <m.Icon size={18} className="opacity-80" />
              <div className="text-left">
                <p className="font-semibold">{m.label}</p>
                <p className="text-[11px] text-zinc-500">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// V3: DNA Widget
const DNAWidget = memo(function DNAWidget({ tasteProfile, totalEntries }: { tasteProfile: TasteProfile; totalEntries: number }) {
  // Fix 2.2: apri automaticamente la prima volta, poi ricorda la scelta
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    if (!localStorage.getItem('dna_widget_seen')) { localStorage.setItem('dna_widget_seen', '1'); return true }
    return false
  })
  const maxScore = tasteProfile.globalGenres[0]?.score || 1
  const binge = tasteProfile.bingeProfile
  const top3 = tasteProfile.globalGenres.slice(0, 3)

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-8">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
            <Brain size={16} className="text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white">Come ti conosciamo</p>
            <p className="text-xs text-zinc-500">
              {totalEntries} titoli analizzati · finestra {tasteProfile.recentWindow || 6} mesi
              {binge?.isBinger && <span className="inline-flex items-center gap-1 ml-1">· <Flame size={12} className="text-orange-400" /> Binge watcher</span>}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </button>

      {/* Fix 2.2: preview top-3 sempre visibile anche da chiuso */}
      {!open && top3.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {top3.map(({ genre, score }) => (
            <div key={genre} className="flex items-center gap-2 bg-zinc-800/60 rounded-xl px-3 py-1.5 min-w-0">
              <span className="text-xs text-zinc-300 truncate max-w-[80px]">{genre}</span>
              <div className="w-12 h-1 bg-zinc-700 rounded-full overflow-hidden flex-shrink-0">
                <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full" style={{ width: `${(score / maxScore) * 100}%` }} />
              </div>
            </div>
          ))}
          {binge?.isBinger && (
            <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-1.5">
              <Flame size={11} className="text-orange-400" />
              <span className="text-xs text-orange-300">Binge</span>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="mt-5 space-y-5">
          {/* Generi dominanti */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Generi dominanti</p>
            <div className="space-y-2">
              {tasteProfile.globalGenres.slice(0, 6).map(({ genre, score }) => (
                <div key={genre} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-300 w-28 truncate">{genre}</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full" style={{ width: `${(score / maxScore) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-zinc-600 w-10 text-right">{Math.round(score)}pt</span>
                </div>
              ))}
            </div>
          </div>

          {/* Creator amati */}
          {tasteProfile.creatorScores && (
            (tasteProfile.creatorScores.topStudios.length > 0 || tasteProfile.creatorScores.topDirectors.length > 0) && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Creator amati</p>
                <div className="flex flex-wrap gap-1.5">
                  {tasteProfile.creatorScores.topStudios.slice(0, 4).map(s => (
                    <span key={s.name} className="text-[10px] bg-sky-500/15 text-sky-300 px-2 py-0.5 rounded-full border border-sky-500/20 flex items-center gap-1">
                      <Clapperboard size={8} />{s.name}
                    </span>
                  ))}
                  {tasteProfile.creatorScores.topDirectors.slice(0, 3).map(d => (
                    <span key={d.name} className="text-[10px] bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/20">
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Binge profile */}
          {binge && (binge.bingeGenres.length > 0 || binge.slowGenres.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {binge.bingeGenres.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Flame size={10} className="text-orange-400" /> Binge genres</p>
                  <div className="flex flex-wrap gap-1">
                    {binge.bingeGenres.slice(0, 4).map(g => (
                      <span key={g} className="text-[10px] bg-orange-500/15 text-orange-300 px-2 py-0.5 rounded-full capitalize">{g}</span>
                    ))}
                  </div>
                </div>
              )}
              {binge.slowGenres.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Sparkles size={10} className="text-violet-400" /> Gusto raffinato</p>
                  <div className="flex flex-wrap gap-1">
                    {binge.slowGenres.slice(0, 4).map(g => (
                      <span key={g} className="text-[10px] bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-full capitalize">{g}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Toni e Setting */}
          <div className="grid grid-cols-2 gap-4">
            {tasteProfile.deepSignals?.topTones && tasteProfile.deepSignals.topTones.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Toni preferiti</p>
                <div className="flex flex-wrap gap-1">
                  {tasteProfile.deepSignals.topTones.map(t => (
                    <span key={t} className="text-[10px] bg-fuchsia-500/15 text-fuchsia-300 px-2 py-0.5 rounded-full capitalize">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {tasteProfile.deepSignals?.topSettings && tasteProfile.deepSignals.topSettings.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Setting amati</p>
                <div className="flex flex-wrap gap-1">
                  {tasteProfile.deepSignals.topSettings.map(s => (
                    <span key={s} className="text-[10px] bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-full capitalize">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search intent */}
          {tasteProfile.searchIntentGenres && tasteProfile.searchIntentGenres.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Search size={10} /> Stai cercando</p>
              <div className="flex gap-2">
                {tasteProfile.searchIntentGenres.map(g => (
                  <span key={g} className="text-[10px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
                    <Search size={8} />{g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Wishlist intent */}
          {tasteProfile.wishlistGenres && tasteProfile.wishlistGenres.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Bookmark size={10} /> Wishlist amplifica</p>
              <div className="flex flex-wrap gap-1">
                {tasteProfile.wishlistGenres.slice(0, 6).map(g => (
                  <span key={g} className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/20">{g}</span>
                ))}
              </div>
            </div>
          )}

          {/* Discovery genres */}
          {tasteProfile.discoveryGenres && tasteProfile.discoveryGenres.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Generi da esplorare</p>
              <div className="flex gap-2">
                {tasteProfile.discoveryGenres.map(g => (
                  <span key={g} className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/20">{g}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// V3: Continuity Section
const ContinuitySection = memo(function ContinuitySection({ items, onFeedback, onDetail, dismissedIds }: {
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onDetail?: (i: Recommendation) => void
  dismissedIds: Set<string>
}) {
  const visible = items.filter(i => i.isContinuity && !dismissedIds.has(i.id))
  if (!visible.length) return null

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
          <ArrowRight size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Continua a guardare</h2>
          <p className="text-[10px] text-amber-400">Sequel e capitoli successivi dei tuoi titoli completati</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {visible.map(item => {
          const Icon = TYPE_ICONS[item.type]
          return (
            <div key={item.id} className="flex-shrink-0 w-44 group relative cursor-pointer" onClick={() => onDetail?.(item)}>
              <div className="relative h-64 rounded-2xl overflow-hidden bg-zinc-900 mb-2">
                {item.coverImage
                  ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><Icon size={36} className="text-zinc-700" /></div>
                }
                <div className="absolute inset-0 ring-2 ring-amber-500/40 rounded-2xl pointer-events-none" />
                <div className="absolute top-2 left-2 bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <ArrowRight size={8} />Sequel
                </div>
                <div className="absolute top-2 right-2 bg-black/70 text-[9px] text-zinc-300 px-1.5 py-0.5 rounded-full">
                  {TYPE_LABEL[item.type]}
                </div>
                <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                  <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'already_seen') }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-white hover:bg-zinc-600/60 transition-colors">
                    <Eye size={11} />
                  </button>
                </div>
              </div>
              <p className="text-xs font-bold text-white leading-tight line-clamp-2 mb-0.5">{item.title}</p>
              {item.continuityFrom && (
                <p className="text-[10px] text-amber-400/80 line-clamp-1">→ {item.continuityFrom}</p>
              )}
              <p className="text-[11px] text-zinc-300 line-clamp-2 mt-0.5">{item.why}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
})

const RecommendationCard = memo(function RecommendationCard({ item, onFeedback, onSimilar, onDetail, isSimilarLoading, dismissed, showDetails }: {
  item: Recommendation
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  isSimilarLoading: boolean; dismissed: boolean
  showDetails?: boolean
}) {
  const Icon = TYPE_ICONS[item.type]; const colorClass = TYPE_COLORS[item.type]
  if (dismissed) return null

  const episodeLabel = item.type === 'manga'
    ? (item.episodes ? `${item.episodes} cap.` : null)
    : (item.episodes && item.type !== 'movie' ? `${item.episodes} ep.` : null)

  return (
    <div className={`flex-shrink-0 group ${showDetails ? 'w-48' : 'w-36'}`}>
      <div className={`relative ${showDetails ? 'h-64' : 'h-52'} rounded-2xl overflow-hidden bg-zinc-900 mb-2 cursor-pointer`}
        onClick={() => onDetail?.(item)}>
        {item.coverImage
          ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <div className="w-full h-full flex items-center justify-center"><Icon size={32} className="text-zinc-700" /></div>
        }
        <div className={`absolute top-2 left-2 bg-gradient-to-r ${colorClass} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
          {TYPE_LABEL[item.type] || item.type.toUpperCase()}
        </div>
        {item.isDiscovery && (
          <div className="absolute top-2 right-2 bg-emerald-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Compass size={8} /> Scoperta
          </div>
        )}
        {item.friendWatching && !item.isDiscovery && (
          <div className="absolute top-2 right-2 bg-blue-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 max-w-[72px] truncate">
            <Users size={8} />{item.friendWatching}
          </div>
        )}
        {item.creatorBoost && !item.isDiscovery && (
          <div className="absolute top-2 right-2 bg-sky-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 max-w-[70px] truncate">
            <Clapperboard size={8} />{item.creatorBoost.split(' ')[0]}
          </div>
        )}
        {item.score && !item.isDiscovery && !item.creatorBoost && (
          <div className="absolute top-2 right-2 bg-black/70 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            <Star size={9} fill="currentColor" /> {Math.min(item.score, 5).toFixed(1)}
          </div>
        )}
        {/* Pulsanti sempre visibili — cerchietti in basso a destra */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'not_interested') }} title="Non mi interessa"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-red-300 hover:bg-red-900/60 transition-colors">
            <ThumbsDown size={11} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'already_seen') }} title="L'ho già visto"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-white hover:bg-zinc-600/60 transition-colors">
            <Eye size={11} />
          </button>
          {onSimilar && (
            <button onClick={(e) => { e.stopPropagation(); onSimilar(item) }} disabled={isSimilarLoading} title="Simili"
              className={`w-7 h-7 flex items-center justify-center rounded-full backdrop-blur-sm transition-colors ${isSimilarLoading ? 'bg-violet-900/60 text-violet-300' : 'bg-black/60 text-zinc-300 hover:text-violet-200 hover:bg-violet-900/60'}`}>
              {isSimilarLoading ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs font-semibold text-white leading-tight line-clamp-2 mb-1">{item.title}</p>
      {/* Metadati: anno, episodi, voto */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        {item.year && <p className="text-[10px] text-zinc-500">{item.year}</p>}
        {episodeLabel && (
          <span className="text-[10px] text-zinc-500">{episodeLabel}</span>
        )}
        {showDetails && item.score && (
          <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 font-semibold">
            <Star size={8} fill="currentColor" />{Math.min(item.score, 5).toFixed(1)}
          </span>
        )}
      </div>
      {item.isContinuity
        ? <ContinuityBadge from={item.continuityFrom || ''} />
        : item.creatorBoost
        ? <CreatorBadge creator={item.creatorBoost} />
        : <MatchBadge score={item.matchScore} />
      }
      <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2 mt-1">{item.why}</p>
      {/* Descrizione breve — solo nella sezione Simili */}
      {showDetails && item.description && (
        <p className="text-[10px] text-zinc-500 leading-tight line-clamp-3 mt-1.5">{item.description}</p>
      )}
      {/* Fix 3.3: boardgame companion — cross-media bridge */}
      {item.type === 'boardgame' && item.genres.length > 0 && (
        <button
          onClick={() => onSimilar?.(item)}
          className="mt-2 flex items-center gap-1 text-[10px] text-yellow-400 hover:text-yellow-300 transition-colors">
          <Dice5 size={9} />
          <span>Scopri giochi simili</span>
          <ArrowRight size={9} />
        </button>
      )}
    </div>
  )
})

const HeroMatchSection = memo(function HeroMatchSection({ items, onFeedback, onSimilar, onDetail, dismissedIds }: {
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  dismissedIds: Set<string>
}) {
  const { t } = useLocale(); const fy = t.forYou
  const top = items
    .filter(i => i.matchScore >= 75 && !dismissedIds.has(i.id) && !i.isContinuity)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6)
  if (top.length < 2) return null

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
          <Flame size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Match Forte</h2>
          <p className="text-xs text-zinc-500">I più compatibili con i tuoi gusti</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {top.map(item => {
          const Icon = TYPE_ICONS[item.type]; const colorClass = TYPE_COLORS[item.type]
          return (
            <div key={item.id} className="flex-shrink-0 w-44 group relative cursor-pointer" onClick={() => onDetail?.(item)}>
              <div className="relative h-64 rounded-2xl overflow-hidden bg-zinc-900 mb-2">
                {item.coverImage
                  ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><Icon size={36} className="text-zinc-700" /></div>
                }
                <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute top-2 right-2 bg-violet-600 text-white text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1">
                  <Star size={9} fill="currentColor" />{item.matchScore}%
                </div>
                <div className={`absolute top-2 left-2 bg-gradient-to-r ${colorClass} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full`}>
                  {TYPE_LABEL[item.type]}
                </div>
                {item.creatorBoost && (
                  <div className="absolute bottom-10 left-2 right-2">
                    <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded-full border border-sky-500/30 flex items-center gap-0.5 w-fit max-w-full truncate">
                      <Clapperboard size={7} />{item.creatorBoost}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'not_interested') }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-red-300 hover:bg-red-900/60 transition-colors">
                    <ThumbsDown size={11} />
                  </button>
                  {onSimilar && (
                    <button onClick={(e) => { e.stopPropagation(); onSimilar(item) }}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-violet-200 hover:bg-violet-900/60 transition-colors">
                      <Search size={11} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-white leading-tight line-clamp-2 mb-0.5">{item.title}</p>
              <p className="text-[10px] text-violet-400 italic line-clamp-1">{item.why}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
})

// Sezione "Simili a X" — persiste finché l'utente non la chiude o cerca un altro simile
// Barra di ricerca "Trova titoli simili a..." — stile identico alla navbar
// Cerca in tutte le API (AniList, TMDb, IGDB, BGG) in parallelo — stesso pattern della discover
const TYPE_LABEL_SEARCH: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV',
  game: 'Gioco', boardgame: 'Board Game',
}

interface SearchSuggestion {
  id: string; title: string; type: string
  genres?: string[]; year?: number; coverImage?: string
  description?: string
}

function SimilarSearchBar({ onSearch, loading }: {
  onSearch: (title: string, genres: string[]) => void
  loading: boolean
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Chiudi dropdown se si clicca fuori
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchSuggestions = async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return }
    setSearching(true)
    try {
      // Chiama tutte le API in parallelo — stesse della discover
      const [anilistRes, tmdbRes, igdbRes, bggRes] = await Promise.allSettled([
        fetch(`/api/anilist?q=${encodeURIComponent(q)}`),
        fetch(`/api/tmdb?q=${encodeURIComponent(q)}&type=all&lang=it-IT`),
        fetch(`/api/igdb?q=${encodeURIComponent(q)}`),
        fetch(`/api/boardgames?q=${encodeURIComponent(q)}`),
      ])

      const all: SearchSuggestion[] = []

      // anilist, tmdb, igdb → array diretto; bgg → { results: [] }
      const parse = (j: any) => Array.isArray(j) ? j : (j.results || j.data || [])

      if (anilistRes.status === 'fulfilled' && anilistRes.value.ok) {
        const j = await anilistRes.value.json()
        for (const r of parse(j).slice(0, 1)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: r.type || 'anime', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image })
        }
      }
      if (tmdbRes.status === 'fulfilled' && tmdbRes.value.ok) {
        const j = await tmdbRes.value.json()
        for (const r of parse(j).slice(0, 1)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: r.type || 'movie', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image, description: r.description })
        }
      }
      if (igdbRes.status === 'fulfilled' && igdbRes.value.ok) {
        const j = await igdbRes.value.json()
        for (const r of parse(j).slice(0, 1)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: 'game', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image })
        }
      }
      if (bggRes.status === 'fulfilled' && bggRes.value.ok) {
        const j = await bggRes.value.json()
        for (const r of parse(j).slice(0, 1)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: 'boardgame', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image })
        }
      }

      setSuggestions(all.slice(0, 4))
      setOpen(all.length > 0)
    } catch {}
    setSearching(false)
  }

  const handleChange = (v: string) => {
    setQuery(v)
    setOpen(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 320)
  }

  const handleSelect = (s: SearchSuggestion) => {
    setQuery(s.title)
    setOpen(false)
    setSuggestions([])
    const genres = s.genres?.filter(Boolean) || []
    onSearch(s.title, genres)
  }

  const handleClear = () => {
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative mb-6">
      {/* Input — stile identico alla navbar */}
      <div className="relative">
        <Search
          size={14}
          className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${searching || loading ? 'text-violet-400 animate-pulse' : 'text-zinc-500'}`}
        />
        <input
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); return }
            if (e.key === 'Enter' && query.trim().length >= 2) {
              setOpen(false)
              if (suggestions.length > 0) handleSelect(suggestions[0])
              else onSearch(query.trim(), [])
            }
          }}
          placeholder="Cerca un titolo per trovare contenuti simili…"
          className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl pl-9 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Dropdown suggerimenti — stile identico alla navbar */}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 z-[110]">
          {suggestions.map((s, i) => (
            <button key={`${s.id}-${i}`} onClick={() => handleSelect(s)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0 text-left">
              {/* Copertina */}
              <div className="w-8 h-11 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0">
                {s.coverImage
                  ? <img src={s.coverImage} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight truncate">{s.title}</p>
                <p className="text-xs text-violet-400">
                  {TYPE_LABEL_SEARCH[s.type] || s.type}{s.year ? ` · ${s.year}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && suggestions.length === 0 && !searching && (
        <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-500 shadow-2xl z-[110]">
          Nessun risultato trovato
        </div>
      )}
    </div>
  )
}

const SIMILAR_TYPE_FILTERS: Array<{ key: MediaType | 'all'; label: string }> = [
  { key: 'all',       label: 'Tutti' },
  { key: 'anime',     label: 'Anime' },
  { key: 'movie',     label: 'Film' },
  { key: 'tv',        label: 'Serie TV' },
  { key: 'game',      label: 'Giochi' },
  { key: 'manga',     label: 'Manga' },
  { key: 'boardgame', label: 'Boardgame' },
]

const SimilarSection = memo(function SimilarSection({ sourceTitle, sourceType, items, onFeedback, onSimilar, onDetail, onClose, dismissedIds, similarLoadingId }: {
  sourceTitle: string
  sourceType: MediaType
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  onClose: () => void
  dismissedIds: Set<string>
  similarLoadingId?: string | null
}) {
  const [visibleCount, setVisibleCount] = useState(15)
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')

  // Tipi effettivamente presenti nei risultati
  const presentTypes = new Set(items.map(i => i.type))
  const activeFilters = SIMILAR_TYPE_FILTERS.filter(f => f.key === 'all' || presentTypes.has(f.key as MediaType))

  const filtered = typeFilter === 'all'
    ? items.filter(i => !dismissedIds.has(i.id))
    : items.filter(i => i.type === typeFilter && !dismissedIds.has(i.id))

  const shown = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  // Reset visibleCount quando cambia il filtro
  const handleFilterChange = (key: MediaType | 'all') => {
    setTypeFilter(key)
    setVisibleCount(15)
  }

  return (
    <div className="mb-10 rounded-3xl border border-violet-500/30 bg-violet-500/5 p-5">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
          <Search size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white">
            Titoli simili a <span className="text-violet-300">"{sourceTitle}"</span>
          </h2>
          <p className="text-[10px] text-zinc-500">
            {filtered.length} {filtered.length === items.filter(i => !dismissedIds.has(i.id)).length ? 'titoli trovati' : `di ${items.filter(i => !dismissedIds.has(i.id)).length} totali`}
          </p>
        </div>
        <button onClick={onClose}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
          title="Chiudi">
          <X size={15} />
        </button>
      </div>

      {/* Filtri per tipo — pill scrollabili */}
      {activeFilters.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-4">
          {activeFilters.map(({ key, label }) => {
            const count = key === 'all'
              ? items.filter(i => !dismissedIds.has(i.id)).length
              : items.filter(i => i.type === key && !dismissedIds.has(i.id)).length
            const isActive = typeFilter === key
            return (
              <button key={key} onClick={() => handleFilterChange(key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  isActive
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
                }`}>
                {key !== 'all' && <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${TYPE_COLORS[key as MediaType]}`} />}
                {label}
                <span className={`text-[10px] ${isActive ? 'text-violet-200' : 'text-zinc-600'}`}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-6">Nessun titolo trovato per questo filtro.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
          {shown.map(item => (
            <RecommendationCard
              key={item.id}
              item={item}
              onFeedback={onFeedback}
              onSimilar={onSimilar}
              onDetail={onDetail}
              isSimilarLoading={similarLoadingId === item.id}
              dismissed={dismissedIds.has(item.id)}
              showDetails
            />
          ))}
          {hasMore && (
            <div className="flex-shrink-0 w-36 flex items-center justify-center">
              <button onClick={() => setVisibleCount(v => v + 10)}
                className="flex flex-col items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <div className="w-10 h-10 rounded-full border border-zinc-700 hover:border-zinc-500 flex items-center justify-center">
                  <ChevronDown size={18} />
                </div>
                <span className="text-[10px]">+{filtered.length - visibleCount} altri</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// Fix 2.8: sezione separata per titoli "Scoperta" — nuovo per te
const DiscoverySection = memo(function DiscoverySection({ items, onFeedback, onSimilar, onDetail, dismissedIds }: {
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  dismissedIds: Set<string>
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const visible = items.filter(i => i.isDiscovery && !dismissedIds.has(i.id))
  if (visible.length < 2) return null
  const shown = visible.slice(0, visibleCount)
  const hasMore = visible.length > visibleCount

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
          <Compass size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Esplora oltre i tuoi confini</h2>
          <p className="text-[10px] text-zinc-500">{visible.length} titoli fuori dal tuo solito — potrebbe sorprenderti</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {shown.map(item => {
          const Icon = TYPE_ICONS[item.type]
          return (
            <div key={item.id} className="flex-shrink-0 w-36 group">
              <div className="relative h-52 rounded-2xl overflow-hidden bg-zinc-900 mb-2 ring-2 ring-emerald-500/40 ring-offset-2 ring-offset-black cursor-pointer"
                onClick={() => onDetail?.(item)}>
                {item.coverImage
                  ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><Icon size={32} className="text-zinc-700" /></div>
                }
                <div className="absolute top-2 left-2 bg-emerald-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Compass size={8} /> Nuovo per te
                </div>
                {item.score && (
                  <div className="absolute top-2 right-2 bg-black/70 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Star size={9} fill="currentColor" /> {Math.min(item.score, 5).toFixed(1)}
                  </div>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'not_interested') }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-red-300 hover:bg-red-900/60 transition-colors">
                    <ThumbsDown size={11} />
                  </button>
                  {onSimilar && (
                    <button onClick={(e) => { e.stopPropagation(); onSimilar(item) }} title="Simili"
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-violet-200 hover:bg-violet-900/60 transition-colors">
                      <Search size={11} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs font-semibold text-white leading-tight line-clamp-2 mb-1">{item.title}</p>
              {item.year && <p className="text-[10px] text-zinc-500 mb-1">{item.year}</p>}
              <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2 mt-1">{item.why}</p>
            </div>
          )
        })}
        {hasMore && (
          <div className="flex-shrink-0 w-36 flex items-center justify-center">
            <button onClick={() => setVisibleCount(v => v + LOAD_MORE_STEP)}
              className="flex flex-col items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <div className="w-10 h-10 rounded-full border border-zinc-700 hover:border-zinc-500 flex items-center justify-center">
                <ChevronDown size={18} />
              </div>
              <span className="text-[10px]">+{visible.length - visibleCount} altri</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

const INITIAL_VISIBLE = 15
const LOAD_MORE_STEP = 10

const RecommendationSection = memo(function RecommendationSection({ type, items, label, onFeedback, dismissedIds, onSimilar, onDetail, similarLoadingId, isPrimary }: {
  type: MediaType; items: Recommendation[]; label: string
  onAdd: (i: Recommendation) => void; onWishlist: (i: Recommendation) => void
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  dismissedIds: Set<string>
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  similarLoadingId?: string | null
  isPrimary?: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)  // Fix 2.13
  const Icon = TYPE_ICONS[type]; const colorClass = TYPE_COLORS[type]
  const visible = items.filter(i => !dismissedIds.has(i.id))
  if (!visible.length) return null

  const shown = visible.slice(0, visibleCount)
  const hasMore = visible.length > visibleCount
  const discoveryCount = visible.filter(i => i.isDiscovery).length
  const topScore = visible[0]?.matchScore || 0

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-8 h-8 bg-gradient-to-br ${colorClass} rounded-xl flex items-center justify-center shadow-lg`}>
          <Icon size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">{label}</h2>
          <p className="text-[10px] text-zinc-500">
            {visible.length} titoli{discoveryCount > 0 ? ` · ${discoveryCount} nuovi generi` : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isPrimary && (
            <span className="text-[10px] font-semibold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/20 px-2 py-0.5 rounded-full">
              Il tuo tipo principale
            </span>
          )}
          {topScore >= 80 && !isPrimary && (
            <span className="text-[10px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Flame size={9} /> Ottimo match
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {shown.map(item => (
          <RecommendationCard
            key={item.id} item={item} onFeedback={onFeedback} onSimilar={onSimilar} onDetail={onDetail}
            isSimilarLoading={similarLoadingId === item.id} dismissed={dismissedIds.has(item.id)}
          />
        ))}
        {/* Fix 2.13: "Mostra altri" senza refresh */}
        {hasMore && (
          <div className="flex-shrink-0 w-36 flex items-center justify-center">
            <button onClick={() => setVisibleCount(v => v + LOAD_MORE_STEP)}
              className="flex flex-col items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <div className="w-10 h-10 rounded-full border border-zinc-700 hover:border-zinc-500 flex items-center justify-center">
                <ChevronDown size={18} />
              </div>
              <span className="text-[10px]">+{visible.length - visibleCount} altri</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

// Fix 2.6: Quick-reason sheet — raccoglie il motivo dopo "non mi interessa"
function QuickReasonSheet({ item, onConfirm, onDismiss }: {
  item: Recommendation
  onConfirm: (reason: FeedbackReason) => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onDismiss}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-t-3xl p-5 pb-8"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
        <p className="text-sm font-semibold text-white mb-1">Perché non ti interessa?</p>
        <p className="text-xs text-zinc-500 mb-4 truncate">{item.title}</p>
        <div className="space-y-2">
          {([
            { reason: 'already_know' as FeedbackReason, label: 'Ho già visto / lo conosco', icon: '👁️' },
            { reason: 'not_my_genre' as FeedbackReason, label: 'Non è il mio genere', icon: '🚫' },
            { reason: 'too_similar' as FeedbackReason, label: 'Troppo simile ad altro', icon: '🔁' },
            { reason: 'bad_rec' as FeedbackReason, label: 'Consiglio non pertinente', icon: '👎' },
          ]).map(({ reason, label, icon }) => (
            <button key={reason} onClick={() => onConfirm(reason)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm text-zinc-200 transition-all text-left">
              <span className="text-base">{icon}</span>{label}
            </button>
          ))}
        </div>
        <button onClick={() => onConfirm(undefined)} className="w-full mt-3 text-xs text-zinc-600 hover:text-zinc-400 py-2">
          Salta
        </button>
      </div>
    </div>
  )
}

function LowConfidenceBanner({ totalEntries }: { totalEntries: number }) {
  const needed = 15
  const pct = Math.min(100, Math.round((totalEntries / needed) * 100))
  return (
    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6">
      <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-300 mb-1">Consigli in miglioramento</p>
        <p className="text-xs text-amber-200/70 mb-3">
          I tuoi consigli migliorano man mano che aggiungi titoli. Hai ancora {needed - totalEntries} titoli per sbloccare i consigli personalizzati.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-amber-400 font-bold">{totalEntries}/{needed}</span>
        </div>
        <Link href="/discover" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-amber-400 hover:text-amber-300">
          <Plus size={13} />Aggiungi dalla libreria
        </Link>
      </div>
    </div>
  )
}

const FriendsWatchingSection = memo(function FriendsWatchingSection({ items }: { items: FriendActivity[] }) {
  if (!items.length) return null
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    const h = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000)
    if (h < 1) return 'ora'; if (h < 24) return `${h}h fa`; return `${days}g fa`
  }
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-10">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-gradient-to-br from-fuchsia-500 to-violet-500 rounded-xl flex items-center justify-center">
          <Users size={16} className="text-white" />
        </div>
        <h2 className="text-sm font-bold text-white">Amici che guardano</h2>
        <span className="text-xs text-zinc-500 ml-auto">{items.length}</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {items.map(a => (
          <Link key={`${a.userId}-${a.mediaId}`} href={`/profile/${a.username}`} className="flex-shrink-0 w-28 group">
            <div className="relative h-40 rounded-2xl overflow-hidden bg-zinc-800 mb-2">
              {a.mediaCover
                ? <img src={a.mediaCover} alt={a.mediaTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center text-zinc-600"><Tv size={28} /></div>
              }
              <div className="absolute bottom-2 left-2 ring-2 ring-black rounded-full">
                <Avatar src={a.avatarUrl} username={a.username} displayName={a.displayName} size={24} />
              </div>
              <div className="absolute top-2 right-2 bg-black/70 text-[9px] text-zinc-300 px-1.5 py-0.5 rounded-full">{timeAgo(a.updatedAt)}</div>
            </div>
            <p className="text-[10px] font-semibold text-zinc-300 line-clamp-2 mb-0.5">{a.mediaTitle}</p>
            <p className="text-[9px] text-violet-400 truncate">@{a.username}</p>
          </Link>
        ))}
      </div>
    </div>
  )
})

// Fix 2.15: quick presets per onboarding rapido
const QUICK_PRESETS = [
  { label: '🌑 Dark anime', prefs: { fav_anime_genres: ['Horror', 'Psychological', 'Thriller', 'Drama'], fav_manga_genres: ['Horror', 'Psychological', 'Thriller'] } },
  { label: '⚔️ Gamer RPG', prefs: { fav_game_genres: ['Role-playing (RPG)', 'Adventure', 'Action', 'Strategy'] } },
  { label: '🎬 Cinefilo europeo', prefs: { fav_movie_genres: ['Drama', 'Thriller', 'Crime', 'History'], fav_tv_genres: ['Drama', 'Crime', 'Thriller'] } },
  { label: '😂 Comedy & feel-good', prefs: { fav_anime_genres: ['Comedy', 'Slice of Life', 'Romance'], fav_movie_genres: ['Comedy', 'Romance', 'Animation'] } },
  { label: '🚀 Sci-fi & fantasy', prefs: { fav_anime_genres: ['Science Fiction', 'Fantasy'], fav_movie_genres: ['Science Fiction', 'Fantasy', 'Adventure'], fav_game_genres: ['Role-playing (RPG)', 'Adventure'] } },
]

function PreferencesModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useLocale(); const fy = t.forYou; const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(0)  // Fix 2.15: step 0 = preset, 1-6 = sezioni
  const [prefs, setPrefs] = useState<Record<string, string[]>>({
    fav_game_genres: [], fav_anime_genres: [], fav_movie_genres: [],
    fav_tv_genres: [], fav_manga_genres: [], fav_boardgame_genres: [], disliked_genres: []
  })
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('user_preferences').select('*').eq('user_id', user.id).single().then(({ data }) => {
        if (data) {
          setPrefs({
            fav_game_genres: data.fav_game_genres || [],
            fav_anime_genres: data.fav_anime_genres || [],
            fav_movie_genres: data.fav_movie_genres || [],
            fav_tv_genres: data.fav_tv_genres || [],
            fav_manga_genres: data.fav_manga_genres || [],
            fav_boardgame_genres: data.fav_boardgame_genres || [],
            disliked_genres: data.disliked_genres || []
          })
          // Se l'utente ha già preferenze, salta lo step preset
          const hasPrefs = Object.values(data).some(v => Array.isArray(v) && v.length > 0)
          if (hasPrefs) setStep(1)
        }
      })
    })
  }, [])
  const toggle = (key: string, genre: string) => setPrefs(prev => ({
    ...prev,
    [key]: prev[key].includes(genre) ? prev[key].filter(g => g !== genre) : [...prev[key], genre]
  }))
  const applyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    setPrefs(prev => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(preset.prefs)) {
        next[k] = [...new Set([...(next[k] || []), ...v])]
      }
      return next
    })
    setStep(1)
  }
  const save = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('user_preferences').upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setSaving(false); showToast(fy.prefsSaved); onSaved(); onClose()
  }
  const sections = [
    { key: 'fav_anime_genres', label: '🎌 Anime preferiti', genres: ANIME_GENRES, desc: 'Seleziona i generi anime che ami di più' },
    { key: 'fav_manga_genres', label: '📖 Manga preferiti', genres: MANGA_GENRES, desc: 'Generi manga che leggi volentieri' },
    { key: 'fav_movie_genres', label: '🎬 Film preferiti', genres: MOVIE_GENRES, desc: 'Che tipo di film ti piace guardare?' },
    { key: 'fav_tv_genres', label: '📺 Serie TV preferite', genres: TV_GENRES, desc: 'Generi di serie che non salti mai' },
    { key: 'fav_game_genres', label: '🎮 Giochi preferiti', genres: GAME_GENRES, desc: 'A che tipo di giochi non riesci a smettere?' },
    { key: 'fav_boardgame_genres', label: '🎲 Board game preferiti', genres: BOARDGAME_GENRES, desc: 'Che tipo di giochi da tavolo ami di più?' },
    { key: 'disliked_genres', label: '🚫 Generi da nascondere', genres: [...new Set([...GAME_GENRES, ...ANIME_GENRES, ...MOVIE_GENRES])], desc: 'Questi generi non appariranno nei tuoi consigli' },
  ]
  const currentSection = sections[step - 1]
  const totalSteps = sections.length

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header con progress bar */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-base font-bold text-white">
                {step === 0 ? 'Configura i tuoi gusti' : `${step} di ${totalSteps} — ${currentSection?.label}`}
              </h2>
              <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            {step > 0 && (
              <div className="flex gap-1">
                {sections.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full flex-1 transition-all ${i < step ? 'bg-violet-500' : 'bg-zinc-800'}`} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-y-auto p-5 flex-1">
          {step === 0 ? (
            /* Step 0: Quick presets */
            <div>
              <p className="text-sm text-zinc-400 mb-5">Scegli un profilo di partenza o configura tutto manualmente.</p>
              <div className="grid grid-cols-1 gap-2 mb-6">
                {QUICK_PRESETS.map(preset => (
                  <button key={preset.label} onClick={() => applyPreset(preset)}
                    className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-violet-500/50 rounded-2xl text-sm text-left transition-all">
                    <span className="text-xl">{preset.label.split(' ')[0]}</span>
                    <span className="font-medium text-zinc-200">{preset.label.split(' ').slice(1).join(' ')}</span>
                    <ArrowRight size={14} className="ml-auto text-zinc-600" />
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-2xl">
                Configura manualmente →
              </button>
            </div>
          ) : currentSection ? (
            /* Step 1-6: sezione corrente */
            <div>
              <p className="text-xs text-zinc-500 mb-4">{currentSection.desc}</p>
              {currentSection.key === 'disliked_genres' && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-300">Nasconderai tutti i contenuti di questi generi dai consigli.</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {currentSection.genres.map(genre => {
                  const sel = prefs[currentSection.key]?.includes(genre)
                  return (
                    <button key={genre} onClick={() => toggle(currentSection.key, genre)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${sel ? (currentSection.key === 'disliked_genres' ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-violet-500/20 border-violet-500/50 text-violet-300') : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
                      {genre}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer navigazione */}
        {step > 0 && (
          <div className="p-5 border-t border-zinc-800 flex items-center gap-3">
            <button onClick={() => setStep(s => Math.max(0, s - 1))}
              className="px-4 py-2.5 text-sm text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-2xl transition-all">
              ← Indietro
            </button>
            {step < totalSteps ? (
              <button onClick={() => setStep(s => s + 1)}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-2xl text-sm font-semibold text-white transition-all">
                Avanti →
              </button>
            ) : (
              <button onClick={save} disabled={saving}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-2xl text-sm font-semibold text-white transition-all">
                {saving ? 'Salvo...' : fy.prefsSave}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function applyMood(recs: Record<string, Recommendation[]>, mood: Mood): Record<string, Recommendation[]> {
  if (!mood) return recs
  const BOOST: Record<NonNullable<Mood>, string[]> = {
    light: ['Comedy', 'Slice of Life', 'Adventure', 'Romance', 'Animation'],
    intense: ['Action', 'Thriller', 'Horror', 'Shooter', 'Crime'],
    deep: ['Drama', 'Psychological', 'Mystery', 'Role-playing (RPG)', 'Science Fiction']
  }
  const boosted = new Set(BOOST[mood])
  const result: Record<string, Recommendation[]> = {}
  for (const [type, items] of Object.entries(recs)) {
    result[type] = [...items].sort((a, b) => {
      if (a.isContinuity && !b.isContinuity) return -1
      if (!a.isContinuity && b.isContinuity) return 1
      const ab = a.genres.some(g => boosted.has(g)) ? 20 : 0
      const bb = b.genres.some(g => boosted.has(g)) ? 20 : 0
      return (b.matchScore + bb) - (a.matchScore + ab)
    })
  }
  return result
}

export default function ForYouPage() {
  const supabase = createClient(); const router = useRouter()
  const { t } = useLocale(); const fy = t.forYou
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false)
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation[]>>({})
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null)
  const [totalEntries, setTotalEntries] = useState(0)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set())
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [showPrefs, setShowPrefs] = useState(false)
  const [isCached, setIsCached] = useState(false)
  const [mood, setMood] = useState<Mood>(null)
  const [friendsActivity, setFriendsActivity] = useState<FriendActivity[]>([])
  const [friendsLoading, setFriendsLoading] = useState(true)
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set())   // Fix 2.5: loading state add
  const [reasonPending, setReasonPending] = useState<Recommendation | null>(null)  // Fix 2.6: quick-reason
  const [showMoodSheet, setShowMoodSheet] = useState(false)  // Fix 2.3: bottom sheet umore
  const [similarLoading, setSimilarLoading] = useState<string | null>(null)  // id del titolo in caricamento
  const [detailItem, setDetailItem] = useState<Recommendation | null>(null)  // titolo aperto nel detail modal
  const [similarSection, setSimilarSection] = useState<{ sourceTitle: string; sourceType: MediaType; items: Recommendation[] } | null>(null)
  const [showNewRecsBadge, setShowNewRecsBadge] = useState(false)  // Fix 2.10: badge nuovi consigli

  const fetchRecommendations = useCallback(async (force = false) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const res = await fetch(`/api/recommendations?type=all${force ? '&refresh=1' : ''}`)
    if (!res.ok) return
    const json = await res.json()
    setRecommendations(json.recommendations || {})
    setTasteProfile(json.tasteProfile || null)
    setIsCached(!!json.cached)
  }, [])

  const fetchFriends = useCallback(async (userId: string) => {
    setFriendsLoading(true)
    try {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
      const ids = (follows || []).map((f: any) => f.following_id)
      if (!ids.length) { setFriendsActivity([]); setFriendsLoading(false); return }
      const since = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: entries } = await supabase.from('user_media_entries').select('user_id, external_id, title, cover_image, type, updated_at').in('user_id', ids).gte('updated_at', since).order('updated_at', { ascending: false }).limit(20)
      if (!entries?.length) { setFriendsActivity([]); setFriendsLoading(false); return }
      const uids = [...new Set(entries.map(e => e.user_id))]
      const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', uids)
      const pm: Record<string, any> = {}; profiles?.forEach(p => { pm[p.id] = p })
      const seen = new Set<string>(); const activity: FriendActivity[] = []
      for (const e of entries) {
        const key = `${e.user_id}-${e.external_id}`
        if (seen.has(key)) continue; seen.add(key)
        const p = pm[e.user_id]; if (!p) continue
        activity.push({ userId: e.user_id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url, mediaId: e.external_id, mediaTitle: e.title, mediaCover: e.cover_image, mediaType: e.type, updatedAt: e.updated_at })
      }
      setFriendsActivity(activity.slice(0, 12))

      // Fix 2.9: carica similarity score degli amici per elevare titoli ad alta affinità
      const followIds = ids
      if (followIds.length > 0) {
        const { data: simData } = await supabase
          .from('taste_similarity')
          .select('other_user_id, similarity_score')
          .eq('user_id', userId)
          .in('other_user_id', followIds)
          .gte('similarity_score', 80)
        if (simData && simData.length > 0) {
          const highSimIds = new Set(simData.map((s: any) => s.other_user_id))
          const simMap = Object.fromEntries(simData.map((s: any) => [s.other_user_id, s.similarity_score]))
          // Marca le attività degli amici ad alta sim
          setFriendsActivity(prev => prev.map(a => ({
            ...a,
            isHighSim: highSimIds.has(a.userId),
            simScore: simMap[a.userId] || 0,
          })))
        }
      }
    } catch { setFriendsActivity([]) }
    setFriendsLoading(false)
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [
        { data: entries },
        { data: wish },
        recsPromise,
      ] = await Promise.all([
        supabase.from('user_media_entries').select('external_id').eq('user_id', user.id),
        supabase.from('wishlist').select('external_id').eq('user_id', user.id),
        fetch('/api/recommendations?type=all').then(r => r.ok ? r.json() : null),
      ])

      setAddedIds(new Set((entries || []).map((e: any) => e.external_id).filter(Boolean)))
      setWishlistIds(new Set((wish || []).map((w: any) => w.external_id).filter(Boolean)))
      setTotalEntries(entries?.length || 0)

      if (recsPromise) {
        setRecommendations(recsPromise.recommendations || {})
        setTasteProfile(recsPromise.tasteProfile || null)
        setIsCached(!!recsPromise.cached)
      }
      setLoading(false)

      fetchFriends(user.id)

      // Fix 2.10: badge "Nuovi consigli" dopo 4h dall'ultima visita
      const lastVisit = localStorage.getItem('for_you_last_visit')
      const now = Date.now()
      if (lastVisit && now - parseInt(lastVisit) > 4 * 3600000) {
        setShowNewRecsBadge(true)
      }
      localStorage.setItem('for_you_last_visit', String(now))
    }
    init()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    setShowNewRecsBadge(false)
    const { data: { user } } = await supabase.auth.getUser()
    await Promise.all([fetchRecommendations(true), user ? fetchFriends(user.id) : Promise.resolve()])
    setRefreshing(false)
  }

  // Pull-to-refresh su mobile — deve stare DOPO handleRefresh
  const { distance: pullDistance, refreshing: isPulling } = usePullToRefresh({ onRefresh: handleRefresh })

  const handleAdd = useCallback(async (item: Recommendation) => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id, external_id: item.id, title: item.title, type: item.type,
      cover_image: item.coverImage, genres: item.genres,
      status: item.type === 'movie' ? 'completed' : 'watching', current_episode: 1
    })
    if (!error) {
      setAddedIds(prev => new Set([...prev, item.id]))
      showToast(`"${item.title}" aggiunto`)
      await fetch('/api/recommendations/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action: 'added' })
      })
      if (item.genres.length > 0) {
        triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: item.type === 'movie' ? 'completed' : 'watching' })
      }
    }
  }, [supabase])

  const handleWishlist = useCallback(async (item: Recommendation) => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    if (wishlistIds.has(item.id)) {
      await supabase.from('wishlist').delete().eq('user_id', user.id).eq('external_id', item.id)
      setWishlistIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
      showToast(t.discover.wishlistRemove)
    } else {
      await supabase.from('wishlist').upsert({
        user_id: user.id, external_id: item.id, title: item.title,
        type: item.type, cover_image: item.coverImage,
        genres: item.genres || [],
        media_type: item.type,
      }, { onConflict: 'user_id,external_id' })
      setWishlistIds(prev => new Set([...prev, item.id]))
      showToast(t.discover.wishlistAdd)
      if (item.genres.length > 0) {
        triggerTasteDelta({ action: 'wishlist_add', mediaId: item.id, mediaType: item.type, genres: item.genres })
      }
    }
  }, [supabase, wishlistIds, t])

  // Fix 1.15: "Simili a questo" — richiede i consigli filtrati per i generi del titolo
  const handleDetail = useCallback((item: Recommendation) => {
    // Converti Recommendation in MediaDetails per il MediaDetailsDrawer
    const details: MediaDetails = {
      id: item.id,
      title: item.title,
      type: item.type,
      coverImage: item.coverImage,
      year: item.year,
      genres: item.genres,
      description: item.description,
      score: item.score,
      source: item.id.startsWith('anilist-anime') ? 'anilist'
            : item.id.startsWith('anilist-manga') ? 'anilist'
            : item.id.startsWith('tmdb-') ? 'tmdb'
            : item.id.startsWith('igdb-') || /^\d+$/.test(item.id) ? 'igdb'
            : undefined,
    }
    setDetailItem(details as any)
  }, [])

  // searchSimilar e handleSimilar unite — searchSimilar dichiarata prima per evitare
  // problemi di closure con useCallback deps=[]
  const searchSimilar = useCallback(async (title: string, genres: string[], excludeId?: string, tags?: string[], keywords?: string[], type?: string) => {
    if (!genres.length) {
      showToast('Impossibile trovare simili: generi non disponibili')
      return
    }
    const params = new URLSearchParams({ title, genres: genres.slice(0, 5).join(',') })
    if (tags?.length) params.set('tags', tags.slice(0, 15).join(','))
    if (keywords?.length) params.set('keywords', keywords.slice(0, 15).join(','))
    if (excludeId) params.set('excludeId', excludeId)
    if (type) params.set('type', type)
    const res = await fetch(`/api/recommendations/similar?${params}`)
    if (res.ok) {
      const json = await res.json()
      const items: Recommendation[] = (json.items || []).filter((r: Recommendation) => r.id !== excludeId)
      setSimilarSection({ sourceTitle: title, sourceType: 'movie', items })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      if (items.length === 0) showToast('Nessun risultato trovato')
    } else {
      showToast('Errore nella ricerca simili')
    }
  }, [])

  const handleSimilar = useCallback(async (item: Recommendation) => {
    if (!item.genres.length) return
    setSimilarLoading(item.id)
    showToast(`Cercando titoli simili a "${item.title}"…`)
    await searchSimilar(item.title, item.genres, item.id, item.tags, item.keywords, item.type)
    setSimilarLoading(null)
  }, [searchSimilar])

  const sendFeedback = useCallback(async (item: Recommendation, action: FeedbackAction, reason?: FeedbackReason) => {
    await fetch('/api/recommendations/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action, reason: reason || null })
    })
    if (action === 'not_interested' && item.genres.length > 0) {
      triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: 'dropped' })
    }
  }, [])

  const handleFeedback = useCallback((item: Recommendation, action: FeedbackAction, reason?: FeedbackReason) => {
    setDismissedIds(prev => new Set([...prev, item.id]))
    if (action === 'not_interested' && reason === undefined) {
      // Fix 2.6: mostra quick-reason sheet invece di dismiss diretto
      setReasonPending(item)
      showToast('Rimosso dai consigli')
      sendFeedback(item, action, undefined)  // invia subito senza reason, aggiorna se arriva
    } else {
      sendFeedback(item, action, reason)
      if (action === 'not_interested') showToast('Rimosso dai consigli')
    }
  }, [sendFeedback])

  const displayRecs = applyMood(recommendations, mood)
  const allRecs = Object.values(displayRecs).flat()

  // Fix 2.9: eleva nelle sezioni i titoli guardati da amici con sim ≥80%
  const friendWatchingMap = new Map<string, string>()  // mediaId → username
  for (const a of friendsActivity) {
    if (a.isHighSim && a.mediaId && !friendWatchingMap.has(a.mediaId)) {
      friendWatchingMap.set(a.mediaId, a.displayName || a.username)
    }
  }
  // Inietta friendWatching nelle recs esistenti
  for (const recs of Object.values(displayRecs)) {
    for (const rec of recs) {
      if (friendWatchingMap.has(rec.id)) {
        rec.friendWatching = friendWatchingMap.get(rec.id)
        rec.matchScore = Math.min(100, rec.matchScore + 12)  // piccolo boost visibilità
      }
    }
  }

  const allContinuityRecs = allRecs.filter(i => i.isContinuity && !dismissedIds.has(i.id))

  const hasEnoughData = totalEntries >= 1

  // Mostra solo sezioni per tipi che l'utente ha nella collezione
  // E ordina per numero di titoli consigliati (sezioni più ricche prima)
  const collectionSize = tasteProfile?.collectionSize || {}
  const ALL_SECTIONS: Array<{ key: MediaType; label: string }> = [
    { key: 'anime', label: fy.sections.anime },
    { key: 'game', label: fy.sections.game },
    { key: 'movie', label: fy.sections.movie },
    { key: 'tv', label: fy.sections.tv },
    { key: 'manga', label: fy.sections.manga },
    { key: 'boardgame', label: 'Giochi da tavolo' },
  ]
  // Fix 2.4: ordina per affinità reale (collectionSize nel profilo) non per count consigli
  // Chi ha più titoli nel profilo viene prima — riflette il tipo centrale per l'utente
  const SECTIONS = ALL_SECTIONS.filter(({ key }) =>
    (collectionSize[key] || 0) >= 1 || (displayRecs[key] || []).length >= 1
  ).sort((a, b) => {
    const sizeA = collectionSize[a.key] || 0
    const sizeB = collectionSize[b.key] || 0
    return sizeB - sizeA
  })
  const primarySectionKey = SECTIONS[0]?.key

  if (loading) return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-2 md:pt-8 pb-28 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="mb-10 animate-pulse">
          <div className="h-10 w-48 bg-zinc-800 rounded-2xl mb-3" />
          <div className="h-5 w-80 bg-zinc-900 rounded-xl" />
        </div>
        <SkeletonFriendsWatching />
        {[1, 2, 3].map(i => <SkeletonForYouRow key={i} />)}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPulling} />
      <div className="pt-2 md:pt-8 pb-24 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">

        {/* Header — titolo solo desktop, su mobile c'è MobileHeader */}
        <div className="hidden md:flex flex-row items-end gap-4 mb-10">
          <div className="flex-1">
            <h1 className="text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400">
              {fy.title}
            </h1>
            <p className="text-zinc-400 mt-2">{fy.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <MoodPill mood={mood} onClick={() => setShowMoodSheet(true)} />
            <button onClick={() => setShowPrefs(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-2xl text-sm font-medium text-zinc-300 transition-all">
              <SlidersHorizontal size={16} />{fy.preferences}
            </button>
            <div className="relative">
              <button onClick={handleRefresh} disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-2xl text-sm font-medium text-white transition-all">
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? fy.refreshing : fy.refresh}
              </button>
              {showNewRecsBadge && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-fuchsia-500 rounded-full border-2 border-black animate-pulse" />
              )}
            </div>
          </div>
        </div>
        {/* Mobile: solo bottone preferenze in alto a destra */}
        <div className="flex md:hidden justify-between items-center mb-4">
          <MoodPill mood={mood} onClick={() => setShowMoodSheet(true)} />
          <button onClick={() => setShowPrefs(true)}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-400 transition-all">
            <SlidersHorizontal size={15} />{fy.preferences}
          </button>
        </div>

        {!hasEnoughData ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Sparkles size={28} className="text-zinc-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">{fy.title}</h2>
            <p className="text-zinc-400 max-w-md mx-auto mb-8">{fy.emptyState}</p>
            <Link href="/discover" className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3 sm:px-4 md:px-3 sm:px-4 md:px-6 py-3 rounded-2xl">
              <Zap size={18} />{fy.emptyStateCta}
            </Link>
          </div>
        ) : (
          <>
            {tasteProfile?.lowConfidence && <LowConfidenceBanner totalEntries={totalEntries} />}
            {tasteProfile && <DNAWidget tasteProfile={tasteProfile} totalEntries={totalEntries} />}
            {/* Barra ricerca libera "Trova simili a..." */}
            <SimilarSearchBar
              onSearch={(title, genres) => searchSimilar(title, genres)}
              loading={!!similarLoading}
            />

            {similarSection && (
              <SimilarSection
                key={similarSection.sourceTitle}
                sourceTitle={similarSection.sourceTitle}
                sourceType={similarSection.sourceType}
                items={similarSection.items}
                onFeedback={handleFeedback}
                onSimilar={handleSimilar}
                onDetail={handleDetail}
                onClose={() => setSimilarSection(null)}
                dismissedIds={dismissedIds}
                similarLoadingId={similarLoading}
              />
            )}
            {allRecs.length >= 2 && (
              <HeroMatchSection
                key={`hero-${allRecs.length}`}
                items={allRecs}
                onFeedback={handleFeedback}
                onSimilar={handleSimilar}
                onDetail={handleDetail}
                dismissedIds={dismissedIds}
              />
            )}
            {friendsLoading ? <SkeletonFriendsWatching /> : <FriendsWatchingSection items={friendsActivity} />}
            <SimilarTasteFriends />

            {allContinuityRecs.length > 0 && (
              <ContinuitySection
                items={allContinuityRecs}
                onFeedback={handleFeedback}
                onDetail={handleDetail}
                dismissedIds={dismissedIds}
              />
            )}

            <DiscoverySection
              key={`discovery-${Object.keys(recommendations).join('-')}-${allRecs.length}`}
              items={allRecs}
              onFeedback={handleFeedback}
              onSimilar={handleSimilar}
              onDetail={handleDetail}
              dismissedIds={dismissedIds}
            />

            {SECTIONS.map(({ key, label }) => {
              const items = displayRecs[key] || []
              const allItems = items
                .filter(i => !i.isContinuity && !dismissedIds.has(i.id))
                .sort((a, b) => b.matchScore - a.matchScore)
              if (!allItems.length) return null
              return (
                <RecommendationSection
                  key={key}
                  type={key}
                  items={allItems}
                  label={label}
                  onAdd={handleAdd}
                  onWishlist={handleWishlist}
                  onFeedback={handleFeedback}
                  dismissedIds={dismissedIds}
                  onSimilar={handleSimilar}
                  onDetail={handleDetail}
                  similarLoadingId={similarLoading}
                  isPrimary={key === primarySectionKey}
                />
              )
            })}

            {SECTIONS.every(({ key }) => {
              const items = (displayRecs[key] || []).filter(i => !i.isContinuity && !dismissedIds.has(i.id))
              return !items.length
            }) && (
              <div className="text-center py-20">
                <p className="text-zinc-400">{fy.sectionEmpty}</p>
                <button onClick={handleRefresh} className="mt-4 text-violet-400 text-sm hover:underline">{fy.refresh}</button>
              </div>
            )}
          </>
        )}
      </div>
      {showPrefs && <PreferencesModal onClose={() => setShowPrefs(false)} onSaved={handleRefresh} />}
      {/* Drawer dettaglio titolo — stesso del Discover */}
      {detailItem && (
        <MediaDetailsDrawer
          media={detailItem as any}
          onClose={() => setDetailItem(null)}
          onAdd={(media) => {
            setAddedIds(prev => new Set([...prev, media.id]))
            setDetailItem(null)
            showToast(t.discover.added)
          }}
        />
      )}
      {/* Fix 2.3: mood bottom sheet */}
      {showMoodSheet && (
        <MoodBottomSheet mood={mood} onChange={setMood} onClose={() => setShowMoodSheet(false)} />
      )}
      {/* Fix 2.6: quick-reason sheet */}
      {reasonPending && (
        <QuickReasonSheet
          item={reasonPending}
          onConfirm={(reason) => {
            if (reason !== undefined) sendFeedback(reasonPending, 'not_interested', reason)
            setReasonPending(null)
          }}
          onDismiss={() => setReasonPending(null)}
        />
      )}
    </div>
  )
}