import type { ReactNode } from 'react'
import { Star, Sparkles, X } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { optimizeCover } from '@/lib/imageOptimizer'

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
  return (
    <div className="relative overflow-hidden border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.08),rgba(139,92,246,0.055),rgba(20,20,27,0.88))] p-5 pr-12">
      {media.coverImage && (
        <img
          src={optimizeCover(media.coverImage, 'drawer-cover')}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-12 blur-xl"
          aria-hidden
        />
      )}
      <div className="relative z-10 flex gap-4">
        <div className="h-28 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-card)] shadow-[0_14px_40px_rgba(0,0,0,0.28)] ring-1 ring-white/10">
          {media.coverImage ? (
            <img
              src={optimizeCover(media.coverImage, 'drawer-cover')}
              alt={media.title}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
              {fallbackIcon || <Sparkles size={26} />}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 self-center">
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

          <h2 className="line-clamp-2 text-[18px] font-black leading-tight text-[var(--text-primary)]">
            {media.title}
          </h2>

          {(media.year || media.score != null) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
          {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
        </div>
      </div>

      {onClose && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/35 text-[var(--text-secondary)] backdrop-blur transition-colors hover:text-white"
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
    <section className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
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
