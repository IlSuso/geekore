'use client'

import { Bell, Globe, Settings, Shield, Sparkles, Tv } from 'lucide-react'

interface SettingsControlHeroProps {
  localeLabel?: string
  sectionsCount?: number
  selectedPlatformsCount?: number
  digestEnabled?: boolean
}

function HeroStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <p className={`font-mono-data text-[20px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

export function SettingsControlHero({
  localeLabel = 'IT',
  sectionsCount = 6,
  selectedPlatformsCount = 0,
  digestEnabled = true,
}: SettingsControlHeroProps) {
  return (
    <section className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.07),rgba(20,20,27,0.92))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-5">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
        <Sparkles size={12} />
        Control center
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="gk-h1 mb-2 text-[var(--text-primary)]">Imposta Geekore intorno al tuo modo di vivere i media.</h1>
          <p className="gk-body max-w-2xl">
            Lingua, notifiche, sicurezza e piattaforme: Settings diventa il pannello operativo del tuo ecosistema.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:w-[220px]">
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
            <Globe size={14} className="text-[var(--accent)]" />
            <span className="gk-mono text-[var(--text-secondary)]">{localeLabel}</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
            <Bell size={14} className={digestEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
            <span className="gk-mono text-[var(--text-secondary)]">digest</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
            <Shield size={14} className="text-[var(--text-muted)]" />
            <span className="gk-mono text-[var(--text-secondary)]">secure</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
            <Tv size={14} className="text-[var(--text-muted)]" />
            <span className="gk-mono text-[var(--text-secondary)]">platform</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
        <HeroStat label="sezioni" value={sectionsCount} accent />
        <HeroStat label="lingua" value={localeLabel} />
        <HeroStat label="platform" value={selectedPlatformsCount} />
      </div>
    </section>
  )
}
