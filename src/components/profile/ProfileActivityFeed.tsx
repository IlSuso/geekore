'use client'
// src/components/profile/ProfileActivityFeed.tsx
// Activity stream compatto per profilo pubblico

import { useState, useEffect } from 'react'
import { Activity, Clock, Star, Sparkles } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { useLocale } from '@/lib/locale'

const TYPE_LABELS: Record<'it' | 'en', Record<string, string>> = {
  it: { media_added: 'ha aggiunto', media_completed: 'ha completato', media_dropped: 'ha abbandonato', rating_given: 'ha votato', steam_imported: 'ha importato giochi da Steam', updated: 'ha aggiornato' },
  en: { media_added: 'added', media_completed: 'completed', media_dropped: 'dropped', rating_given: 'rated', steam_imported: 'imported games from Steam', updated: 'updated' },
}

function timeAgo(dateStr: string, locale: 'it' | 'en'): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2) return locale === 'it' ? 'adesso' : 'now'
  if (mins < 60) return locale === 'it' ? `${mins}m fa` : `${mins}m ago`
  if (hours < 24) return locale === 'it' ? `${hours}h fa` : `${hours}h ago`
  if (days < 7) return locale === 'it' ? `${days}g fa` : `${days}d ago`
  return new Date(dateStr).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-US', { day: 'numeric', month: 'short' })
}

function RatingPill({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 font-mono-data text-[11px] font-black text-yellow-300">
      <Star size={11} fill="currentColor" />
      {Number(value).toFixed(1)}
    </span>
  )
}

function normalizeActivityCover(url?: string | null): string | null {
  if (!url) return null
  const raw = String(url).trim()
  if (!raw) return null

  // Alcune sorgenti importate, tipo MyAnimeList, non sono per forza presenti
  // in next.config.js. Nel feed attività usiamo quindi un <img> normale e,
  // per gli host più problematici/hotlink-protected, passiamo da wsrv.
  if (/myanimelist\.net/i.test(raw)) {
    return `https://wsrv.nl/?url=${encodeURIComponent(raw)}&w=160&output=webp&default=1`
  }

  return raw
}

export function ProfileActivityFeed({ userId }: { userId: string }) {
  const { locale } = useLocale()
  const copy = locale === 'it' ? { emptyTitle: 'Nessuna attività recente', emptyBody: 'Quando questo profilo aggiunge, completa o valuta media, lo stream apparirà qui.', stream: 'Activity stream', streamHint: 'Ultimi segnali pubblici della libreria.', mediaAlt: 'media' } : { emptyTitle: 'No recent activity', emptyBody: 'When this profile adds, completes, or rates media, the stream will appear here.', stream: 'Activity stream', streamHint: 'Latest public library signals.', mediaAlt: 'media' }
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/activity?userId=${userId}&limit=10`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setActivities(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-8 w-8 rounded-2xl bg-[var(--bg-card)] skeleton" />
          <div className="h-5 w-32 rounded-full bg-[var(--bg-card)] skeleton" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[84px] rounded-[20px] bg-[var(--bg-card)] skeleton" />
        ))}
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
          <Activity size={28} className="text-[var(--text-muted)]" />
        </div>
        <p className="gk-headline mb-1 text-[var(--text-primary)]">{copy.emptyTitle}</p>
        <p className="gk-body mx-auto max-w-sm">{copy.emptyBody}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="mb-1 gk-section-eyebrow">
            <Sparkles size={12} />
            {copy.stream}
          </div>
          <p className="gk-caption">{copy.streamHint}</p>
        </div>
        <span className="gk-mono text-[var(--text-muted)]">{activities.length}</span>
      </div>

      {activities.map(a => (
        <div
          key={a.id}
          className="group flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
        >
          {normalizeActivityCover(a.media_cover) ? (
            <div className="relative h-[72px] w-12 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
              <img
                src={normalizeActivityCover(a.media_cover) || undefined}
                alt={a.media_title || copy.mediaAlt}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="flex h-[72px] w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
              <Activity size={20} className="text-[var(--text-muted)]" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-2">
              {a.media_type && <MediaTypeBadge type={a.media_type} size="xs" />}
              {a.rating_value && <RatingPill value={a.rating_value} />}
            </div>
            <p className="line-clamp-2 text-sm leading-snug text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">{TYPE_LABELS[locale][a.type] || TYPE_LABELS[locale].updated}</span>
              {a.media_title && (
                <span className="ml-1 font-bold text-[var(--text-primary)]">{a.media_title}</span>
              )}
            </p>
            <p className="gk-mono mt-1 inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Clock size={10} />
              {timeAgo(a.created_at, locale)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
