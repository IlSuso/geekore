'use client'

import { List, RefreshCw, Shuffle, SlidersHorizontal, Sparkles } from 'lucide-react'

interface ForYouEngineHeroProps {
  viewMode: 'lista' | 'swipe'
  totalEntries: number
  railsCount: number
  topMatch?: number | string | null
  refreshing?: boolean
  showNewRecsBadge?: boolean
  preferencesLabel?: string
  onModeChange: (mode: 'lista' | 'swipe') => void
  onOpenPreferences: () => void
  onRefresh: () => void
}

export function ForYouEngineHero({
  viewMode,
  totalEntries,
  railsCount,
  topMatch,
  refreshing = false,
  showNewRecsBadge = false,
  preferencesLabel = 'Preferenze',
  onModeChange,
  onOpenPreferences,
  onRefresh,
}: ForYouEngineHeroProps) {
  return (
    <section className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.07),rgba(20,20,27,0.9))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="gk-h1 mb-1 text-[var(--text-primary)]">Per Te</h1>
          <p className="gk-caption text-[var(--text-secondary)]">Consigli personalizzati sul tuo Taste DNA</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-[18px] border border-[rgba(230,255,61,0.18)] bg-[rgba(20,20,27,0.94)] p-1 shadow-[0_14px_40px_rgba(0,0,0,0.24)]">
            <button
              type="button"
              onClick={() => onModeChange('lista')}
              className="inline-flex h-9 items-center gap-2 rounded-[14px] px-3 text-xs font-black transition-all"
              style={{
                background: viewMode === 'lista' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'lista' ? '#0B0B0F' : 'var(--text-secondary)',
              }}
            >
              <List size={14} />
              <span>Lista</span>
              <span className="hidden font-mono-data text-[9px] uppercase tracking-[0.08em] opacity-60 sm:inline">rail</span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange('swipe')}
              className="inline-flex h-9 items-center gap-2 rounded-[14px] px-3 text-xs font-black transition-all"
              style={{
                background: viewMode === 'swipe' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'swipe' ? '#0B0B0F' : 'var(--text-secondary)',
              }}
            >
              <Shuffle size={14} />
              <span>Swipe</span>
              <span className="hidden font-mono-data text-[9px] uppercase tracking-[0.08em] opacity-60 sm:inline">cards</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenPreferences}
            className="inline-flex h-10 items-center gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--bg-card)] px-3.5 text-xs font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(230,255,61,0.28)] hover:text-[var(--text-primary)]"
          >
            <SlidersHorizontal size={14} />
            <span>{preferencesLabel}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)] disabled:opacity-40"
              aria-label="Aggiorna consigli"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            {showNewRecsBadge && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border border-black" style={{ background: 'var(--accent)' }} />
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
        <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
          <p className="font-mono-data text-[18px] font-black leading-none text-[var(--accent)]">{totalEntries}</p>
          <p className="gk-label mt-1">in libreria</p>
        </div>
        <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
          <p className="font-mono-data text-[18px] font-black leading-none text-[var(--text-primary)]">{railsCount}</p>
          <p className="gk-label mt-1">sezioni</p>
        </div>
        <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
          <p className="font-mono-data text-[18px] font-black leading-none text-[var(--text-primary)]">{topMatch ?? '—'}</p>
          <p className="gk-label mt-1">top match</p>
        </div>
      </div>
    </section>
  )
}
