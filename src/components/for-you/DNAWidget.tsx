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
  totalEntries?: number
}

type DNAWidgetProps = {
  tasteProfile?: Partial<TasteProfile> | null
  profile?: Partial<TasteProfile> | null
  totalEntries?: number
  compact?: boolean
}

const EMPTY_PROFILE: TasteProfile = {
  globalGenres: [],
  topGenres: { anime: [], manga: [], movie: [], tv: [], game: [], boardgame: [] },
  collectionSize: {},
  recentWindow: 6,
  deepSignals: { topThemes: [], topTones: [], topSettings: [] },
  discoveryGenres: [],
  negativeGenres: [],
  creatorScores: { topStudios: [], topDirectors: [] },
  bingeProfile: { isBinger: false, avgCompletionDays: 0, bingeGenres: [], slowGenres: [] },
  wishlistGenres: [],
  searchIntentGenres: [],
  lowConfidence: true,
  totalEntries: 0,
}

function normalizeTasteProfile(profile?: Partial<TasteProfile> | null): TasteProfile {
  return {
    ...EMPTY_PROFILE,
    ...(profile || {}),
    globalGenres: Array.isArray(profile?.globalGenres) ? profile.globalGenres : [],
    topGenres: { ...EMPTY_PROFILE.topGenres, ...(profile?.topGenres || {}) },
    collectionSize: profile?.collectionSize || {},
    deepSignals: { ...EMPTY_PROFILE.deepSignals, ...(profile?.deepSignals || {}) },
    discoveryGenres: Array.isArray(profile?.discoveryGenres) ? profile.discoveryGenres : [],
    negativeGenres: Array.isArray(profile?.negativeGenres) ? profile.negativeGenres : [],
    creatorScores: {
      topStudios: Array.isArray(profile?.creatorScores?.topStudios) ? profile.creatorScores.topStudios : [],
      topDirectors: Array.isArray(profile?.creatorScores?.topDirectors) ? profile.creatorScores.topDirectors : [],
    },
    bingeProfile: {
      ...EMPTY_PROFILE.bingeProfile!,
      ...(profile?.bingeProfile || {}),
      bingeGenres: Array.isArray(profile?.bingeProfile?.bingeGenres) ? profile.bingeProfile.bingeGenres : [],
      slowGenres: Array.isArray(profile?.bingeProfile?.slowGenres) ? profile.bingeProfile.slowGenres : [],
    },
    wishlistGenres: Array.isArray(profile?.wishlistGenres) ? profile.wishlistGenres : [],
    searchIntentGenres: Array.isArray(profile?.searchIntentGenres) ? profile.searchIntentGenres : [],
    totalEntries: typeof profile?.totalEntries === 'number' ? profile.totalEntries : 0,
  }
}

function uniqueStrings(values: string[] | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values ?? []) {
    const clean = typeof value === 'string' ? value.trim() : ''
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    result.push(clean)
  }
  return result
}

export const DNAWidget = memo(function DNAWidget({ tasteProfile, profile: legacyProfile, totalEntries, compact = false }: DNAWidgetProps) {
  const sourceProfile = tasteProfile || legacyProfile || null
  const profile = normalizeTasteProfile(sourceProfile)
  const resolvedTotalEntries = typeof totalEntries === 'number'
    ? totalEntries
    : typeof profile.totalEntries === 'number'
      ? profile.totalEntries
      : 0
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    if (!localStorage.getItem('dna_widget_seen')) { localStorage.setItem('dna_widget_seen', '1'); return true }
    return false
  })

  const maxScore = profile.globalGenres[0]?.score || 1
  const binge = profile.bingeProfile
  const seenGenres = new Set<string>()
  const top5 = profile.globalGenres.filter(g => {
    if (seenGenres.has(g.genre)) return false
    seenGenres.add(g.genre)
    return true
  }).slice(0, 5)
  const top5Total = top5.reduce((s, g) => s + g.score, 0) || 1
  const topTones = uniqueStrings(profile.deepSignals?.topTones)
  const topSettings = uniqueStrings(profile.deepSignals?.topSettings)
  const bingeGenres = uniqueStrings(binge?.bingeGenres)
  const slowGenres = uniqueStrings(binge?.slowGenres)
  const searchIntentGenres = uniqueStrings(profile.searchIntentGenres)
  const wishlistGenres = uniqueStrings(profile.wishlistGenres)
  const discoveryGenres = uniqueStrings(profile.discoveryGenres)

  const hasCreators = profile.creatorScores &&
    ((profile.creatorScores.topStudios?.length ?? 0) > 0 ||
     (profile.creatorScores.topDirectors?.length ?? 0) > 0)
  const hasStyle = topTones.length > 0 || topSettings.length > 0

  const BAR_COLORS = ['#E6FF3D', '#38BDF8', '#4ADE80', '#FB923C', '#F97066']

  return (
    <div className={`mb-8 overflow-hidden rounded-[28px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.07),rgba(20,20,27,0.88))] shadow-[0_18px_60px_rgba(0,0,0,0.28)] ${compact ? 'md:mb-6' : ''}`}>
      <button type="button" data-no-swipe="true" onClick={() => setOpen(v => !v)} className="w-full px-5 pb-4 pt-5 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
              <Brain size={12} /> Taste DNA
            </div>
            <h2 className="gk-title mb-1 text-[var(--text-primary)]">Il tuo algoritmo parte da qui.</h2>
            <p className="gk-caption">
              {resolvedTotalEntries} titoli · ultimi {profile.recentWindow || 6} mesi
              {binge?.isBinger && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-orange-400">
                  <Flame size={10} className="inline" />binge mode
                </span>
              )}
            </p>
          </div>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-[#0B0B0F] shadow-[0_0_32px_rgba(230,255,61,0.25)]">
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </button>

      {!open && top5.length > 0 && (
        <div className="px-5 pb-5">
          <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-black/30 ring-1 ring-white/5">
            {top5.map(({ genre, score }, i) => (
              <div
                key={`bar-${genre}-${i}`}
                className="h-full flex-shrink-0"
                style={{
                  width: `${Math.max(7, Math.round((score / top5Total) * 100))}%`,
                  backgroundColor: BAR_COLORS[i],
                  opacity: 1 - i * 0.08,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {top5.map(({ genre, score }, i) => (
              <div key={`legend-${genre}-${i}`} className="flex min-w-0 items-center gap-1.5">
                <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: BAR_COLORS[i] }} />
                <span className="truncate text-xs font-semibold text-zinc-200 max-w-[90px]">{genre}</span>
                <span className="font-mono-data text-[10px] font-bold text-zinc-500">
                  {Math.round((score / maxScore) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-6 border-t border-[rgba(255,255,255,0.06)] px-5 pb-5 pt-5">
          {profile.globalGenres.length > 0 ? (
            <div>
              <p className="gk-label mb-3">Generi dominanti</p>
              <div className="space-y-2.5">
                {profile.globalGenres.slice(0, 6).map(({ genre, score }, i) => {
                  const pct = Math.round((score / maxScore) * 100)
                  const barColor = BAR_COLORS[i % BAR_COLORS.length]
                  return (
                    <div key={`global-${genre}-${i}`} className="flex items-center gap-3">
                      <span className="w-28 truncate text-xs font-semibold text-zinc-300">{genre}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/30">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                      </div>
                      <span className="font-mono-data w-8 text-right text-[10px] font-bold text-zinc-400">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-black/18 p-4">
              <p className="gk-label mb-1 text-[var(--accent)]">DNA in costruzione</p>
              <p className="gk-caption">Aggiungi e valuta più media per vedere generi, creator e segnali di gusto più precisi.</p>
            </div>
          )}

          {hasCreators && (
            <div>
              <p className="gk-label mb-3">Creator amati</p>
              <div className="flex flex-wrap gap-2">
                {(profile.creatorScores?.topStudios ?? []).slice(0, 4).map((s, i) => (
                  <span key={`studio-${s.name}-${i}`} className="flex items-center gap-1.5 rounded-xl border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300">
                    <Clapperboard size={10} />{s.name}
                  </span>
                ))}
                {(profile.creatorScores?.topDirectors ?? []).slice(0, 3).map((d, i) => (
                  <span key={`director-${d.name}-${i}`} className="flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.2)', color: 'rgba(230,255,61,0.85)' }}>
                    <User size={10} />{d.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasStyle && (
            <div>
              <p className="gk-label mb-3">Toni e ambientazioni</p>
              <div className="grid grid-cols-2 gap-4">
                {topTones.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] text-zinc-500">Toni preferiti</p>
                    <div className="flex flex-wrap gap-1.5">
                      {topTones.map((t, i) => (
                        <span key={`tone-${t}-${i}`} className="rounded-full px-2 py-0.5 text-[10px] capitalize" style={{ background: 'rgba(230,255,61,0.08)', color: 'var(--accent)', border: '1px solid rgba(230,255,61,0.15)' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {topSettings.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] text-zinc-500">Setting amati</p>
                    <div className="flex flex-wrap gap-1.5">
                      {topSettings.map((s, i) => (
                        <span key={`setting-${s}-${i}`} className="rounded-full px-2 py-0.5 text-[10px] capitalize" style={{ background: 'rgba(230,255,61,0.06)', color: 'rgba(230,255,61,0.7)', border: '1px solid rgba(230,255,61,0.12)' }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {binge && (bingeGenres.length > 0 || slowGenres.length > 0) && (
            <div>
              <p className="gk-label mb-3">Il tuo ritmo</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
                  <p className="mb-2 flex items-center gap-1 text-[10px] text-zinc-500">
                    <Flame size={10} className="text-orange-400" />Binge watch
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {bingeGenres.slice(0, 3).map((g, i) => (
                      <span key={`binge-${g}-${i}`} className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] capitalize text-orange-300">{g}</span>
                    ))}
                    {bingeGenres.length === 0 && <span className="text-[10px] text-zinc-700">—</span>}
                  </div>
                </div>
                <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
                  <p className="mb-2 flex items-center gap-1 text-[10px] text-zinc-500">
                    <Sparkles size={10} style={{ color: 'var(--accent)' }} />Gusto raffinato
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {slowGenres.slice(0, 3).map((g, i) => (
                      <span key={`slow-${g}-${i}`} className="rounded-full px-1.5 py-0.5 text-[10px] capitalize" style={{ background: 'rgba(230,255,61,0.1)', color: 'rgba(230,255,61,0.8)' }}>{g}</span>
                    ))}
                    {slowGenres.length === 0 && <span className="text-[10px] text-zinc-700">—</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {searchIntentGenres.length > 0 && (
            <div>
              <p className="gk-label mb-2 flex items-center gap-1.5"><Search size={9} />Cerchi spesso</p>
              <p className="mb-2 text-[10px] text-zinc-600">Generi cercati di recente: li usiamo per dare priorità ai consigli.</p>
              <div className="flex flex-wrap gap-1.5">
                {searchIntentGenres.map((g, i) => (
                  <span key={`search-intent-${g}-${i}`} className="rounded-full border border-amber-500/15 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">{g}</span>
                ))}
              </div>
            </div>
          )}

          {wishlistGenres.length > 0 && (
            <div>
              <p className="gk-label mb-2 flex items-center gap-1.5"><Bookmark size={9} />Dalla wishlist</p>
              <p className="mb-2 text-[10px] text-zinc-600">Generi dei titoli salvati: influenzano i consigli.</p>
              <div className="flex flex-wrap gap-1.5">
                {wishlistGenres.slice(0, 5).map((g, i) => (
                  <span key={`wishlist-${g}-${i}`} className="rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">{g}</span>
                ))}
              </div>
            </div>
          )}

          {discoveryGenres.length > 0 && (
            <div>
              <p className="gk-label mb-2">Generi da esplorare</p>
              <div className="flex flex-wrap gap-1.5">
                {discoveryGenres.map((g, i) => (
                  <span key={`discovery-${g}-${i}`} className="rounded-full border border-teal-500/15 bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-300">{g}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
