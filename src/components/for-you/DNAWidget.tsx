'use client'

import { memo, useState } from 'react'
import { Brain, Flame, Sparkles, ChevronDown, ChevronUp, Clapperboard, Search, Bookmark, User } from 'lucide-react'

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'

export interface TasteProfile {
  globalGenres: Array<{ genre: string; score: number }>
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>
  collectionSize: Record<string, number>
  recentWindow?: number
  deepSignals?: { topThemes: string[]; topTones: string[]; topSettings: string[] }
  discoveryGenres?: string[]
  negativeGenres?: string[]
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

const GENRE_COLORS = [
  'from-violet-500 to-fuchsia-500',
  'from-sky-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-indigo-500 to-violet-500',
]

export const DNAWidget = memo(function DNAWidget({ tasteProfile, totalEntries }: {
  tasteProfile: TasteProfile
  totalEntries: number
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    if (!localStorage.getItem('dna_widget_seen')) { localStorage.setItem('dna_widget_seen', '1'); return true }
    return false
  })

  const maxScore = tasteProfile.globalGenres[0]?.score || 1
  const binge = tasteProfile.bingeProfile
  const top3 = tasteProfile.globalGenres.slice(0, 3)
  const hasCreators = tasteProfile.creatorScores &&
    ((tasteProfile.creatorScores.topStudios?.length ?? 0) > 0 ||
     (tasteProfile.creatorScores.topDirectors?.length ?? 0) > 0)
  const hasStyle = (tasteProfile.deepSignals?.topTones?.length ?? 0) > 0 ||
    (tasteProfile.deepSignals?.topSettings?.length ?? 0) > 0
  const hasSignals = (tasteProfile.searchIntentGenres?.length ?? 0) > 0 ||
    (tasteProfile.wishlistGenres?.length ?? 0) > 0

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl overflow-hidden mb-8">
      {/* Header */}
      <button onClick={() => setOpen(v => !v)} className="w-full p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-900/30">
            <Brain size={17} className="text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white">Il tuo DNA Geekore</p>
            <p className="text-xs text-zinc-500">
              {totalEntries} titoli analizzati · finestra {tasteProfile.recentWindow || 6} mesi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {binge?.isBinger && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-orange-300 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">
              <Flame size={10} />Binge
            </span>
          )}
          {open ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
        </div>
      </button>

      {/* Collapsed: top 3 genre pills */}
      {!open && top3.length > 0 && (
        <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
          {top3.map(({ genre, score }, i) => (
            <div key={genre} className="flex items-center gap-2 bg-zinc-800/80 rounded-xl px-3 py-1.5">
              <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br ${GENRE_COLORS[i]}`} />
              <span className="text-xs font-medium text-zinc-200">{genre}</span>
              <span className="text-[10px] text-zinc-500 font-semibold">{Math.round((score / maxScore) * 100)}%</span>
            </div>
          ))}
          {binge?.isBinger && (
            <div className="sm:hidden flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-1.5">
              <Flame size={10} className="text-orange-400" />
              <span className="text-xs text-orange-300 font-medium">Binge</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded */}
      {open && (
        <div className="px-5 pb-5 space-y-6">
          {/* Generi dominanti */}
          {tasteProfile.globalGenres.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Generi dominanti</p>
              <div className="space-y-2.5">
                {tasteProfile.globalGenres.slice(0, 6).map(({ genre, score }, i) => {
                  const pct = Math.round((score / maxScore) * 100)
                  return (
                    <div key={genre} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-300 w-28 truncate font-medium">{genre}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${GENRE_COLORS[i % GENRE_COLORS.length]} rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-400 w-8 text-right font-bold">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Creator amati */}
          {hasCreators && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Creator amati</p>
              <div className="flex flex-wrap gap-2">
                {(tasteProfile.creatorScores?.topStudios ?? []).slice(0, 4).map(s => (
                  <span key={s.name} className="flex items-center gap-1.5 text-xs bg-sky-500/10 text-sky-300 px-2.5 py-1 rounded-xl border border-sky-500/20">
                    <Clapperboard size={10} />{s.name}
                  </span>
                ))}
                {(tasteProfile.creatorScores?.topDirectors ?? []).slice(0, 3).map(d => (
                  <span key={d.name} className="flex items-center gap-1.5 text-xs bg-violet-500/10 text-violet-300 px-2.5 py-1 rounded-xl border border-violet-500/20">
                    <User size={10} />{d.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stile personale */}
          {hasStyle && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Il tuo stile</p>
              <div className="grid grid-cols-2 gap-4">
                {(tasteProfile.deepSignals?.topTones?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-600 mb-2">Toni preferiti</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tasteProfile.deepSignals!.topTones.map(t => (
                        <span key={t} className="text-[10px] bg-fuchsia-500/10 text-fuchsia-300 px-2 py-0.5 rounded-full capitalize border border-fuchsia-500/15">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(tasteProfile.deepSignals?.topSettings?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-600 mb-2">Setting amati</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tasteProfile.deepSignals!.topSettings.map(s => (
                        <span key={s} className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full capitalize border border-indigo-500/15">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ritmo di consumo */}
          {binge && (binge.bingeGenres.length > 0 || binge.slowGenres.length > 0) && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Il tuo ritmo</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800/50 rounded-2xl p-3">
                  <p className="text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                    <Flame size={10} className="text-orange-400" />Binge watch
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {binge.bingeGenres.slice(0, 3).map(g => (
                      <span key={g} className="text-[10px] bg-orange-500/15 text-orange-300 px-1.5 py-0.5 rounded-full capitalize">{g}</span>
                    ))}
                    {binge.bingeGenres.length === 0 && <span className="text-[10px] text-zinc-700">—</span>}
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-2xl p-3">
                  <p className="text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                    <Sparkles size={10} className="text-violet-400" />Gusto raffinato
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {binge.slowGenres.slice(0, 3).map(g => (
                      <span key={g} className="text-[10px] bg-violet-500/15 text-violet-300 px-1.5 py-0.5 rounded-full capitalize">{g}</span>
                    ))}
                    {binge.slowGenres.length === 0 && <span className="text-[10px] text-zinc-700">—</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Segnali attivi */}
          {hasSignals && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Segnali attivi</p>
              <div className="space-y-2.5">
                {(tasteProfile.searchIntentGenres?.length ?? 0) > 0 && (
                  <div className="flex items-start gap-2.5">
                    <Search size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1.5">
                      {tasteProfile.searchIntentGenres!.map(g => (
                        <span key={g} className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/15">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(tasteProfile.wishlistGenres?.length ?? 0) > 0 && (
                  <div className="flex items-start gap-2.5">
                    <Bookmark size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1.5">
                      {tasteProfile.wishlistGenres!.slice(0, 5).map(g => (
                        <span key={g} className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/15">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generi da esplorare */}
          {(tasteProfile.discoveryGenres?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Generi da esplorare</p>
              <div className="flex flex-wrap gap-1.5">
                {tasteProfile.discoveryGenres!.map(g => (
                  <span key={g} className="text-[10px] bg-teal-500/10 text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/15">{g}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
