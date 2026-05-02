'use client'
// src/components/profile/ProfileActivityFeed.tsx
// Activity stream compatto per profilo pubblico

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Activity, Clock, Star, Sparkles } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'

const TYPE_LABELS: Record<string, string> = {
  media_added: 'ha aggiunto',
  media_completed: 'ha completato',
  media_dropped: 'ha abbandonato',
  rating_given: 'ha votato',
  steam_imported: 'ha importato giochi da Steam',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2) return 'adesso'
  if (mins < 60) return `${mins}m fa`
  if (hours < 24) return `${hours}h fa`
  if (days < 7) return `${days}g fa`
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

function RatingPill({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 font-mono-data text-[11px] font-black text-yellow-300">
      <Star size={11} fill="currentColor" />
      {Number(value).toFixed(1)}
    </span>
  )
}

export function ProfileActivityFeed({ userId }: { userId: string }) {
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
        <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessuna attività recente</p>
        <p className="gk-body mx-auto max-w-sm">Quando questo profilo aggiunge, completa o valuta media, lo stream apparirà qui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.30)] bg-[rgba(230,255,61,0.07)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
            <Sparkles size={12} />
            Activity stream
          </div>
          <p className="gk-caption">Ultimi segnali pubblici della libreria.</p>
        </div>
        <span className="gk-mono text-[var(--text-muted)]">{activities.length}</span>
      </div>

      {activities.map(a => (
        <div
          key={a.id}
          className="group flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
        >
          {a.media_cover ? (
            <div className="relative h-[72px] w-12 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
              <Image
                src={a.media_cover}
                alt={a.media_title || 'media'}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="48px"
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
              <span className="text-[var(--text-muted)]">{TYPE_LABELS[a.type] || 'ha aggiornato'}</span>
              {a.media_title && (
                <span className="ml-1 font-bold text-[var(--text-primary)]">{a.media_title}</span>
              )}
            </p>
            <p className="gk-mono mt-1 inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Clock size={10} />
              {timeAgo(a.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
