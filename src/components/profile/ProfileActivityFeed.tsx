'use client'
// src/components/profile/ProfileActivityFeed.tsx
// 7.4 — estratto da profile/[username]/page.tsx

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Star } from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  anime: 'bg-sky-500',
  manga: 'bg-orange-500',
  game: 'bg-green-500',
  tv: 'bg-purple-500',
  movie: 'bg-red-500',
  boardgame: 'bg-yellow-500',
}

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

export function ProfileActivityFeed({ userId }: { userId: string }) {
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/activity?userId=${userId}&limit=10`)
      .then(r => r.json())
      .then(data => { setActivities(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-zinc-900 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-600 text-sm">
        Nessuna attività recente
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activities.map(a => (
        <div
          key={a.id}
          className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors"
        >
          {a.media_cover
            ? <div className="relative w-10 h-14 rounded-xl overflow-hidden flex-shrink-0"><Image src={a.media_cover} alt={a.media_title} fill className="object-cover" sizes="40px" /></div>
            : <div className="w-10 h-14 bg-zinc-800 rounded-xl flex-shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-300 leading-snug">
              <span className="text-zinc-500">{TYPE_LABELS[a.type] || 'ha aggiornato'}</span>
              {a.media_title && (
                <span className="font-semibold text-white ml-1">"{a.media_title}"</span>
              )}
              {a.rating_value && (
                <span className="flex items-center gap-0.5 ml-1">{Array.from({length: Math.round(a.rating_value)}).map((_, i) => <Star key={i} size={11} className="text-yellow-400 fill-yellow-400" />)}</span>
              )}
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">{timeAgo(a.created_at)}</p>
          </div>
          {a.media_type && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0 ${TYPE_COLORS[a.media_type] || 'bg-zinc-700'}`}>
              {a.media_type.toUpperCase()}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}