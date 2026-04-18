'use client'
// src/components/for-you/DNAWidget.tsx
// Estratto da for-you/page.tsx — Fix #14 Repair Bible

import { memo, useState } from 'react'
import { Brain, Flame, Sparkles, ChevronDown, ChevronUp, Clapperboard, Search, Bookmark } from 'lucide-react'

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

          {tasteProfile.creatorScores &&
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
            )}

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