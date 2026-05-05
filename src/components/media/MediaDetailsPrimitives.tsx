import type { ReactNode } from 'react'
import { Star, Sparkles, X } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { useLocale } from '@/lib/locale'
import { appCopy, typeLabel } from '@/lib/i18n/uiCopy'
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

function hasRealScore(score?: number | string | null): boolean {
  if (score == null || score === '') return false
  const numeric = typeof score === 'string' ? Number(score) : score
  if (Number.isNaN(numeric)) return true
  return numeric > 0
}

export function MediaDetailsHero({ media, fallbackIcon, meta, subtitle, onClose }: MediaDetailsHeroProps) {
  const { locale } = useLocale()
  const copy = appCopy[locale].drawer
  const common = appCopy[locale].common
  const typeColor = getMediaTypeColor(media.type)
  const visibleScore = hasRealScore(media.score) ? media.score : null

  return (
    <div className="gk-media-details-hero relative border-b border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.026),rgba(11,11,15,0.98))] p-3">
      {media.coverImage && (
        <img
          src={optimizeCover(media.coverImage, 'drawer-cover')}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover opacity-[0.035] blur-[2px]"
          aria-hidden
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(11,11,15,0.96),rgba(11,11,15,0.88),rgba(11,11,15,0.98))]" aria-hidden />

      <div className="relative z-10 flex items-start gap-3 pr-10">
        <div
          className="gk-poster-first relative h-[112px] w-[75px] flex-shrink-0 overflow-hidden rounded-[14px] bg-[var(--bg-card)] shadow-[0_12px_34px_rgba(0,0,0,0.40)] ring-1 ring-white/12"
          style={{ boxShadow: `0 12px 34px rgba(0,0,0,0.42), inset 0 -3px 0 ${typeColor}` }}
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

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <MediaTypeBadge type={media.type} label={typeLabel(media.type, locale)} size="xs" />
            {media.isAwardWinner && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                <Star size={10} fill="currentColor" /> {copy.awardWinner}
              </span>
            )}
            {media.matchScore != null && media.matchScore !== '' && (
              <span className="rounded-full border border-[rgba(230,255,61,0.25)] bg-[rgba(230,255,61,0.10)] px-2 py-0.5 font-mono-data text-[10px] font-black text-[var(--accent)]">
                {media.matchScore}% {common.match.toLowerCase()}
              </span>
            )}
          </div>

          <h2 className="font-display text-[22px] font-black leading-[0.98] tracking-[-0.045em] text-[var(--text-primary)] md:text-[24px]">
            {media.title}
          </h2>

          {(media.year || visibleScore != null) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {media.year && <span className="font-mono-data text-[11px] font-bold text-[var(--text-muted)]">{media.year}</span>}
              {visibleScore != null && (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/15 bg-yellow-500/8 px-1.5 py-0.5 font-mono-data text-[10px] font-black text-yellow-300">
                  <Star size={10} fill="currentColor" />
                  {visibleScore}
                </span>
              )}
            </div>
          )}

          {subtitle && <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">{subtitle}</div>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
        </div>
      </div>

      {onClose && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-2xl border border-white/10 bg-black/50 text-white backdrop-blur-xl transition-colors hover:bg-white/10"
          aria-label={common.close}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function MediaDetailsSection({ title, children, icon }: { title?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.022)] p-2.5 ring-1 ring-white/5">
      {title && (
        <div className="mb-2 flex items-center gap-2">
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
    <div className="rounded-2xl bg-black/18 p-2.5 text-center ring-1 ring-white/5">
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
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
      style={accent
        ? { background: 'rgba(230,255,61,0.07)', borderColor: 'rgba(230,255,61,0.22)', color: 'rgba(230,255,61,0.85)' }
        : { background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {children}
    </span>
  )
}
