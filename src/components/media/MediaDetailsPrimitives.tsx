import type { ReactNode } from 'react'
import { Star, Sparkles, X } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { optimizeCover } from '@/lib/imageOptimizer'
import { getMediaTypeColor } from '@/lib/mediaTypes'

type DrawerPrimitiveMedia = {
  title: string
  type: string
  coverImage?: string | null
  year?: number | string | null
  score?: number | string | null
  matchScore?: number | string | null
  isAwardWinner?: boolean
}

interface MediaDetailsHeroProps {
  media: DrawerPrimitiveMedia
  fallbackIcon?: ReactNode
  meta?: ReactNode
  subtitle?: ReactNode
  onClose?: () => void
}

export function MediaDetailsHero({ media, fallbackIcon, meta, subtitle, onClose }: MediaDetailsHeroProps) {
  const typeColor = getMediaTypeColor(media.type)

  return (
    <div className="gk-media-details-hero relative min-h-[320px] overflow-hidden border-b border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(11,11,15,0.96))] p-5 pt-10 md:min-h-[360px] md:p-7 md:pt-12">
      {media.coverImage && (
        <img
          src={optimizeCover(media.coverImage, 'drawer-cover')}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-35 blur-[2px]"
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(11,11,15,0.72)_48%,var(--bg-primary)_100%)]" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(0deg,var(--bg-primary),transparent)]" aria-hidden />

      <div className="relative z-10 flex min-h-[250px] flex-col justify-end gap-4 md:min-h-[280px] md:flex-row md:items-end md:justify-start">
        <div
          className="gk-poster-first relative h-40 w-[108px] flex-shrink-0 overflow-hidden rounded-[20px] bg-[var(--bg-card)] shadow-[0_18px_60px_rgba(0,0,0,0.48)] ring-1 ring-white/12 md:h-52 md:w-[140px]"
          style={{ boxShadow: `0 18px 60px rgba(0,0,0,0.48), inset 0 -3px 0 ${typeColor}` }}
        >
          {media.coverImage ? (
            <img
              src={optimizeCover(media.coverImage, 'drawer-cover')}
              alt={media.title}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
          ) : (
            <div
              className="gk-cover-placeholder h-full w-full"
              style={{ ['--gk-type' as string]: typeColor }}
            >
              <span className="line-clamp-5">{media.title}</span>
              <span className="sr-only">{fallbackIcon || <Sparkles size={26} />}</span>
            </div>
          )}
          <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: typeColor }} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1 self-auto md:max-w-[520px] md:pb-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <MediaTypeBadge type={media.type} size="xs" />
            {media.isAwardWinner && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                <Star size={10} fill="currentColor" /> Acclamato
              </span>
            )}
            {media.matchScore != null && media.matchScore !== '' && (
              <span className="rounded-full border border-[rgba(230,255,61,0.25)] bg-[rgba(230,255,61,0.10)] px-2 py-0.5 font-mono-data text-[10px] font-black text-[var(--accent)]">
                {media.matchScore}% match
              </span>
            )}
          </div>

          <h2 className="font-display text-[28px] font-black leading-[0.96] tracking-[-0.045em] text-[var(--text-primary)] md:text-[42px]">
            {media.title}
          </h2>

          {(media.year || media.score != null) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {media.year && <span className="font-mono-data text-[11px] font-bold text-[var(--text-muted)]">{media.year}</span>}
              {media.score != null && media.score !== '' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/15 bg-yellow-500/8 px-1.5 py-0.5 font-mono-data text-[10px] font-black text-yellow-300">
                  <Star size={10} fill="currentColor" />
                  {media.score}
                </span>
              )}
            </div>
          )}

          {subtitle && <div className="mt-2 text-[11px] text-[var(--text-secondary)]">{subtitle}</div>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-1.5">{meta}</div>}
        </div>
      </div>

      <div className="absolute left-1/2 top-3 z-20 h-1.5 w-9 -translate-x-1/2 rounded-full bg-zinc-500/70 md:hidden" aria-hidden />

      {onClose && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/45 text-white backdrop-blur-xl transition-colors hover:bg-white/10"
          aria-label="Chiudi"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function MediaDetailsSection({ title, children, icon }: { title?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="gk-panel rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
      {title && (
        <div className="mb-3 flex items-center gap-2">
          {icon && <span className="text-[var(--accent)]">{icon}</span>}
          <p className="gk-label">{title}</p>
        </div>
      )}
      {children}
    </section>
  )
}

export function MediaDetailsStat({ label, value, accent = false, icon }: { label: string; value: ReactNode; accent?: boolean; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5">
      <div className={`font-mono-data text-[18px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
        {value}
      </div>
      <p className="gk-label mt-1 inline-flex items-center justify-center gap-1">
        {icon}{label}
      </p>
    </div>
  )
}

export function MediaDetailsTag({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold"
      style={accent
        ? { background: 'rgba(230,255,61,0.07)', borderColor: 'rgba(230,255,61,0.22)', color: 'rgba(230,255,61,0.85)' }
        : { background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {children}
    </span>
  )
}
