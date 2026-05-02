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
  // Deduplica per genere — evita chiavi React duplicate se globalGenres ha lo stesso genere più volte
  const seenGenres = new Set<string>()
  const top5 = tasteProfile.globalGenres.filter(g => {
    if (seenGenres.has(g.genre)) return false
    seenGenres.add(g.genre)
    return true
  }).slice(0, 5)
  const top5Total = top5.reduce((s, g) => s + g.score, 0) || 1
  const hasCreators = tasteProfile.creatorScores &&
    ((tasteProfile.creatorScores.topStudios?.length ?? 0) > 0 ||
     (tasteProfile.creatorScores.topDirectors?.length ?? 0) > 0)
  const hasStyle = (tasteProfile.deepSignals?.topTones?.length ?? 0) > 0 ||
    (tasteProfile.deepSignals?.topSettings?.length ?? 0) > 0

  // Colori solidi per la barra DNA (gradient non funziona su flex segment)
  const BAR_COLORS = [
    '#8b5cf6', // violet-500
    '#0ea5e9', // sky-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#f43f5e', // rose-500
  ]

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl overflow-hidden mb-8">
      {/* Header — uguale aperto e chiuso */}
      <button onClick={() => setOpen(v => !v)} className="w-full px-5 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#E6FF3D' }}>
            <Brain size={17} className="text-black" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white">Il tuo DNA Geekore</p>
            <p className="text-xs text-zinc-500">
              {totalEntries} titoli · finestra {tasteProfile.recentWindow || 6} mesi
              {binge?.isBinger && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-orange-400">
                  <Flame size={10} className="inline" />binge
                </span>
              )}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500 flex-shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 flex-shrink-0" />}
      </button>

      {/* Collapsed: barra DNA + etichette generi */}
      {!open && top5.length > 0 && (
        <div className="px-5 pb-5">
          {/* Barra proporzionale multi-colore */}
          <div className="flex h-2 rounded-full overflow-hidden gap-px mb-3">
            {top5.map(({ genre, score }, i) => (
              <div
                key={`bar-${genre}-${i}`}
                className="h-full flex-shrink-0"
                style={{
                  width: `${Math.round((score / top5Total) * 100)}%`,
                  backgroundColor: BAR_COLORS[i],
                  opacity: 1 - i * 0.1,
                }}
              />
            ))}
          </div>
          {/* Legenda generi */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {top5.map(({ genre, score }, i) => (
              <div key={`legend-${genre}-${i}`} className="flex items-center gap-1.5 min-w-0">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: BAR_COLORS[i] }} />
                <span className="text-xs text-zinc-300 truncate max-w-[90px]">{genre}</span>
                <span className="text-[10px] text-zinc-600 font-semibold flex-shrink-0">
                  {Math.round((score / maxScore) * 100)}%
                </span>
              </div>
            ))}
          </div>
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
                  const barColor = BAR_COLORS[i % BAR_COLORS.length]
                  return (
                    <div key={`global-${genre}-${i}`} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-300 w-28 truncate font-medium">{genre}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: barColor }}
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
                  <span key={d.name} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.2)', color: 'rgba(230,255,61,0.85)' }}>
                    <User size={10} />{d.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stile personale */}
          {hasStyle && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Toni e ambientazioni</p>
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
                    <Sparkles size={10} style={{ color: '#E6FF3D' }} />Gusto raffinato
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {binge.slowGenres.slice(0, 3).map(g => (
                      <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-full capitalize" style={{ background: 'rgba(230,255,61,0.1)', color: 'rgba(230,255,61,0.8)' }}>{g}</span>
                    ))}
                    {binge.slowGenres.length === 0 && <span className="text-[10px] text-zinc-700">—</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Generi cercati di recente */}
          {(tasteProfile.searchIntentGenres?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Search size={9} />Cerchi spesso
              </p>
              <p className="text-[10px] text-zinc-700 mb-2">Generi che hai cercato di recente — li priorizziamo nei consigli</p>
              <div className="flex flex-wrap gap-1.5">
                {tasteProfile.searchIntentGenres!.map(g => (
                  <span key={g} className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/15">{g}</span>
                ))}
              </div>
            </div>
          )}

          {/* Generi dalla wishlist */}
          {(tasteProfile.wishlistGenres?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Bookmark size={9} />Dalla wishlist
              </p>
              <p className="text-[10px] text-zinc-700 mb-2">Generi dei titoli nella tua wishlist — influenzano i consigli</p>
              <div className="flex flex-wrap gap-1.5">
                {tasteProfile.wishlistGenres!.slice(0, 5).map(g => (
                  <span key={g} className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/15">{g}</span>
                ))}
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
