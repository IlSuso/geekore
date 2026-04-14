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

// V5: Tipi per feedback granulare
type FeedbackAction = 'not_interested' | 'already_seen' | 'added' | 'wishlist_add';
type FeedbackReason = 'too_similar' | 'not_my_genre' | 'already_know' | 'bad_rec' | undefined;

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game'
type Mood = 'light' | 'intense' | 'deep' | null

interface Recommendation {
  id: string; title: string; type: MediaType; coverImage?: string; year?: number
  genres: string[]; score?: number; description?: string; why: string
  matchScore: number; isDiscovery?: boolean
  // V3 fields
  isContinuity?: boolean
  continuityFrom?: string
  creatorBoost?: string
  // V4/V5 fields
  isSerendipity?: boolean
  isAwardWinner?: boolean
  isSeasonal?: boolean
  socialBoost?: string
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
}

const ANIME_GENRES = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological']
const MANGA_GENRES = [...ANIME_GENRES,'Shounen','Seinen','Shoujo','Josei']
const GAME_GENRES = ['Action','Adventure','RPG','Strategy','Simulation','Sports','Racing','Shooter','Puzzle','Horror','Platformer','Fighting','Stealth','Sandbox']
const MOVIE_GENRES = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Fantasy','History','Horror','Mystery','Romance','Science Fiction','Thriller','War']
const TV_GENRES = [...MOVIE_GENRES,'Reality','Talk']
const TYPE_ICONS: Record<MediaType, React.ElementType> = { anime: Tv, manga: BookOpen, game: Gamepad2, movie: Film, tv: Tv }
const TYPE_COLORS: Record<MediaType, string> = { anime: 'from-violet-500 to-purple-500', manga: 'from-pink-500 to-rose-500', game: 'from-green-500 to-emerald-500', movie: 'from-amber-500 to-orange-500', tv: 'from-cyan-500 to-blue-500' }
const TYPE_LABEL: Record<MediaType, string> = { anime: 'Anime', manga: 'Manga', game: 'Gioco', movie: 'Film', tv: 'Serie TV' }

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

function MoodSelector({ mood, onChange }: { mood: Mood; onChange: (m: Mood) => void }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-8">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Che umore sei oggi?</p>
      <div className="flex gap-3">
        {MOODS.map(m => (
          <button key={m.id} onClick={() => onChange(mood === m.id ? null : m.id)}
            className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border text-center transition-all ${mood === m.id ? 'bg-violet-600/20 border-violet-500/50 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}>
            <m.Icon size={22} className="opacity-80" />
            <span className="text-xs font-semibold">{m.label}</span>
            <span className="text-[10px] text-zinc-500 hidden sm:block">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// V3: DNA Widget
const DNAWidget = memo(function DNAWidget({ tasteProfile, totalEntries }: { tasteProfile: TasteProfile; totalEntries: number }) {
  const [open, setOpen] = useState(false)
  const maxScore = tasteProfile.globalGenres[0]?.score || 1
  const binge = tasteProfile.bingeProfile

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-8">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
            <Brain size={16} className="text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white">Il tuo DNA geek</p>
            <p className="text-xs text-zinc-500">
              {totalEntries} titoli analizzati · finestra {tasteProfile.recentWindow || 6} mesi
              {binge?.isBinger && <span className="inline-flex items-center gap-1 ml-1">· <Flame size={12} className="text-orange-400" /> Binge watcher</span>}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </button>

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
const ContinuitySection = memo(function ContinuitySection({ items, onAdd, onFeedback, addedIds, dismissedIds }: {
  items: Recommendation[]
  onAdd: (i: Recommendation) => void
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  addedIds: Set<string>
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
          const isAdded = addedIds.has(item.id)
          return (
            <div key={item.id} className="flex-shrink-0 w-44 group relative">
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
                <div className="absolute bottom-2 inset-x-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onAdd(item)} disabled={isAdded}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-xl flex items-center justify-center gap-1 ${isAdded ? 'bg-emerald-600/80 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white'}`}>
                    {isAdded ? <Check size={11} /> : <Plus size={11} />}{isAdded ? 'Aggiunto' : 'Aggiungi'}
                  </button>
                  <button onClick={() => onFeedback(item, 'already_seen')} className="w-8 flex items-center justify-center bg-zinc-800/80 hover:bg-zinc-700 rounded-xl text-zinc-500 hover:text-zinc-300">
                    <Eye size={11} />
                  </button>
                </div>
              </div>
              <p className="text-xs font-bold text-white leading-tight line-clamp-2 mb-0.5">{item.title}</p>
              {item.continuityFrom && (
                <p className="text-[10px] text-amber-400/80 line-clamp-1">→ {item.continuityFrom}</p>
              )}
              <p className="text-[10px] text-violet-400 italic line-clamp-2 mt-0.5">{item.why}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
})

const RecommendationCard = memo(function RecommendationCard({ item, onAdd, onWishlist, onFeedback, alreadyAdded, inWishlist, dismissed }: {
  item: Recommendation; onAdd: (i: Recommendation) => void; onWishlist: (i: Recommendation) => void
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  alreadyAdded: boolean; inWishlist: boolean; dismissed: boolean
}) {
  const { t } = useLocale(); const fy = t.forYou
  const [showAct, setShowAct] = useState(false)
  const Icon = TYPE_ICONS[item.type]; const colorClass = TYPE_COLORS[item.type]
  if (dismissed) return null

  return (
    <div className="flex-shrink-0 w-36 group" onMouseEnter={() => setShowAct(true)} onMouseLeave={() => setShowAct(false)}>
      <div className="relative h-52 rounded-2xl overflow-hidden bg-zinc-900 mb-2">
        {item.coverImage
          ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <div className="w-full h-full flex items-center justify-center"><Icon size={32} className="text-zinc-700" /></div>
        }
        <div className={`absolute top-2 left-2 bg-gradient-to-r ${colorClass} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
          {item.type.toUpperCase()}
        </div>
        {item.isDiscovery && (
          <div className="absolute top-2 right-2 bg-emerald-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Compass size={8} /> Scoperta
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
        <div className={`absolute inset-0 bg-black/75 transition-opacity flex flex-col items-center justify-end pb-3 gap-2 ${showAct ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={() => onAdd(item)} disabled={alreadyAdded}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold w-28 justify-center ${alreadyAdded ? 'bg-zinc-700 text-zinc-400' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}>
            {alreadyAdded ? <Check size={12} /> : <Plus size={12} />}{alreadyAdded ? 'Aggiunto' : fy.addToCollection}
          </button>
          <button onClick={() => onWishlist(item)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold w-28 justify-center ${inWishlist ? 'bg-amber-600/80 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}>
            <Bookmark size={12} fill={inWishlist ? 'currentColor' : 'none'} />{fy.addToWishlist}
          </button>
          <div className="flex gap-1.5 w-28">
            <button onClick={() => onFeedback(item, 'not_interested')} title="Non mi interessa" className="flex-1 flex items-center justify-center py-1 bg-zinc-800/80 hover:bg-red-900/60 rounded-xl text-zinc-500 hover:text-red-400"><ThumbsDown size={11} /></button>
            <button onClick={() => onFeedback(item, 'already_seen')} title="L'ho già visto" className="flex-1 flex items-center justify-center py-1 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl text-zinc-500 hover:text-zinc-300"><Eye size={11} /></button>
          </div>
        </div>
      </div>
      <p className="text-xs font-semibold text-white leading-tight line-clamp-2 mb-1">{item.title}</p>
      {item.year && <p className="text-[10px] text-zinc-500 mb-1">{item.year}</p>}
      {item.isContinuity
        ? <ContinuityBadge from={item.continuityFrom || ''} />
        : item.creatorBoost
        ? <CreatorBadge creator={item.creatorBoost} />
        : <MatchBadge score={item.matchScore} />
      }
      <p className="text-[10px] text-violet-400 leading-tight line-clamp-2 mt-1 italic">{item.why}</p>
    </div>
  )
})

const HeroMatchSection = memo(function HeroMatchSection({ items, onAdd, onWishlist, onFeedback, addedIds, wishlistIds, dismissedIds }: {
  items: Recommendation[]; onAdd: (i: Recommendation) => void; onWishlist: (i: Recommendation) => void
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  addedIds: Set<string>; wishlistIds: Set<string>; dismissedIds: Set<string>
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
          const isAdded = addedIds.has(item.id)
          return (
            <div key={item.id} className="flex-shrink-0 w-44 group relative">
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
                <div className="absolute bottom-2 inset-x-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onAdd(item)} disabled={isAdded}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-xl flex items-center justify-center gap-1 ${isAdded ? 'bg-emerald-600/80 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}>
                    {isAdded ? <Check size={11} /> : <Plus size={11} />}{isAdded ? 'Aggiunto' : 'Aggiungi'}
                  </button>
                  <button onClick={() => onFeedback(item, 'not_interested')} className="w-8 flex items-center justify-center bg-zinc-800/80 hover:bg-red-900/60 rounded-xl text-zinc-500 hover:text-red-400">
                    <ThumbsDown size={11} />
                  </button>
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

const RecommendationSection = memo(function RecommendationSection({ type, items, label, onAdd, onWishlist, onFeedback, addedIds, wishlistIds, dismissedIds }: {
  type: MediaType; items: Recommendation[]; label: string
  onAdd: (i: Recommendation) => void; onWishlist: (i: Recommendation) => void
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  addedIds: Set<string>; wishlistIds: Set<string>; dismissedIds: Set<string>
}) {
  const Icon = TYPE_ICONS[type]; const colorClass = TYPE_COLORS[type]
  // items già filtrati e ordinati dal parent — mostra tutti
  const visible = items.filter(i => !dismissedIds.has(i.id))
  if (!visible.length) return null

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
        {topScore >= 80 && (
          <span className="ml-auto text-[10px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Flame size={9} /> Ottimo match
          </span>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {visible.map(item => (
          <RecommendationCard
            key={item.id} item={item} onAdd={onAdd} onWishlist={onWishlist} onFeedback={onFeedback}
            alreadyAdded={addedIds.has(item.id)} inWishlist={wishlistIds.has(item.id)} dismissed={dismissedIds.has(item.id)}
          />
        ))}
      </div>
    </div>
  )
})

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

function PreferencesModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useLocale(); const fy = t.forYou; const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState<Record<string, string[]>>({
    fav_game_genres: [], fav_anime_genres: [], fav_movie_genres: [],
    fav_tv_genres: [], fav_manga_genres: [], disliked_genres: []
  })
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('user_preferences').select('*').eq('user_id', user.id).single().then(({ data }) => {
        if (data) setPrefs({
          fav_game_genres: data.fav_game_genres || [],
          fav_anime_genres: data.fav_anime_genres || [],
          fav_movie_genres: data.fav_movie_genres || [],
          fav_tv_genres: data.fav_tv_genres || [],
          fav_manga_genres: data.fav_manga_genres || [],
          disliked_genres: data.disliked_genres || []
        })
      })
    })
  }, [])
  const toggle = (key: string, genre: string) => setPrefs(prev => ({
    ...prev,
    [key]: prev[key].includes(genre) ? prev[key].filter(g => g !== genre) : [...prev[key], genre]
  }))
  const save = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('user_preferences').upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setSaving(false); showToast(fy.prefsSaved); onSaved(); onClose()
  }
  const sections = [
    { key: 'fav_game_genres', label: fy.prefsGameGenres, genres: GAME_GENRES },
    { key: 'fav_anime_genres', label: fy.prefsAnimeGenres, genres: ANIME_GENRES },
    { key: 'fav_movie_genres', label: fy.prefsMovieGenres, genres: MOVIE_GENRES },
    { key: 'fav_tv_genres', label: fy.prefsTvGenres, genres: TV_GENRES },
    { key: 'fav_manga_genres', label: fy.prefsMangaGenres, genres: MANGA_GENRES },
    { key: 'disliked_genres', label: fy.prefsDisliked, genres: [...new Set([...GAME_GENRES, ...ANIME_GENRES, ...MOVIE_GENRES])] }
  ]
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white">{fy.prefsTitle}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-6">
          {sections.map(({ key, label, genres }) => (
            <div key={key}>
              <p className="text-sm font-semibold text-zinc-300 mb-3">{label}</p>
              <div className="flex flex-wrap gap-2">
                {genres.map(genre => {
                  const sel = prefs[key]?.includes(genre)
                  return (
                    <button key={genre} onClick={() => toggle(key, genre)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${sel ? (key === 'disliked_genres' ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-violet-500/20 border-violet-500/50 text-violet-300') : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
                      {genre}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 border-t border-zinc-800">
          <button onClick={save} disabled={saving}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3 rounded-2xl">
            {saving ? fy.prefsSaving : fy.prefsSave}
          </button>
        </div>
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
    }
    init()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    const { data: { user } } = await supabase.auth.getUser()
    await Promise.all([fetchRecommendations(true), user ? fetchFriends(user.id) : Promise.resolve()])
    setRefreshing(false)
  }

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

  const handleFeedback = useCallback(async (item: Recommendation, action: FeedbackAction, reason?: FeedbackReason) => {
    setDismissedIds(prev => new Set([...prev, item.id]))
    await fetch('/api/recommendations/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action, reason: reason || null })
    })
    if (action === 'not_interested') showToast('Rimosso dai consigli')
  }, [])

  const displayRecs = applyMood(recommendations, mood)
  const allRecs = Object.values(displayRecs).flat()

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
  ]
  // Mostra la sezione se: l'utente ha almeno 1 entry di quel tipo, O ha almeno 3 consigli
  const SECTIONS = ALL_SECTIONS.filter(({ key }) =>
    (collectionSize[key] || 0) >= 1 || (displayRecs[key] || []).length >= 3
  ).sort((a, b) => {
    // Ordina per: chi ha più consigli disponibili viene prima
    const countA = (displayRecs[a.key] || []).filter(i => !dismissedIds.has(i.id) && !i.isContinuity).length
    const countB = (displayRecs[b.key] || []).filter(i => !dismissedIds.has(i.id) && !i.isContinuity).length
    return countB - countA
  })

  if (loading) return (
    <div className="min-h-screen bg-black text-white pt-8 pb-24 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-3 sm:px-4 md:px-6">
      <div className="mb-10 animate-pulse">
        <div className="h-10 w-48 bg-zinc-800 rounded-2xl mb-3" />
        <div className="h-5 w-80 bg-zinc-900 rounded-xl" />
      </div>
      <SkeletonFriendsWatching />
      {[1, 2, 3].map(i => <SkeletonForYouRow key={i} />)}
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-4 md:pt-8 pb-24 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-3 sm:px-4 md:px-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-10">
          <div className="flex-1">
            <h1 className="text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400">
              {fy.title}
            </h1>
            <p className="text-zinc-400 mt-2">{fy.subtitle}</p>
            {isCached && <p className="text-xs text-zinc-600 mt-1">Dalla cache</p>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowPrefs(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-2xl text-sm font-medium text-zinc-300 transition-all">
              <SlidersHorizontal size={16} />{fy.preferences}
            </button>
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-2xl text-sm font-medium text-white transition-all">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? fy.refreshing : fy.refresh}
            </button>
          </div>
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
            <MoodSelector mood={mood} onChange={setMood} />
            {tasteProfile && <DNAWidget tasteProfile={tasteProfile} totalEntries={totalEntries} />}
            {friendsLoading ? <SkeletonFriendsWatching /> : <FriendsWatchingSection items={friendsActivity} />}
            <SimilarTasteFriends />

            {allContinuityRecs.length > 0 && (
              <ContinuitySection
                items={allContinuityRecs}
                onAdd={handleAdd}
                onFeedback={handleFeedback}
                addedIds={addedIds}
                dismissedIds={dismissedIds}
              />
            )}

            {SECTIONS.map(({ key, label }) => {
              const items = displayRecs[key] || []
              // Mescola main + discovery in una sola riga, ordinati per matchScore
              // I continuity vengono già gestiti sopra separatamente
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
                  addedIds={addedIds}
                  wishlistIds={wishlistIds}
                  dismissedIds={dismissedIds}
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
    </div>
  )
}