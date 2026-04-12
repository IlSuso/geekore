// DESTINAZIONE: src/components/social/TasteSimilarityBadge.tsx
// ═══════════════════════════════════════════════════════════════════════════
// V3: Badge "X% match" che appare sul profilo di un altro utente
// Mostra quanto l'utente loggato ha gusti simili al profilo visitato.
//
// Uso nella profile page:
//   <TasteSimilarityBadge targetUserId={profile.id} />
// (mostrare solo se !isOwner)
// ═══════════════════════════════════════════════════════════════════════════

'use client'

import { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'

interface Props {
  targetUserId: string
}

export function TasteSimilarityBadge({ targetUserId }: Props) {
  const [data, setData] = useState<{ score: number; label: string; commonGenres: string[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetUserId) return
    fetch(`/api/social/taste-similarity?userId=${targetUserId}`)
      .then(r => r.json())
      .then(d => {
        if (d.score !== undefined) setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [targetUserId])

  if (loading) return (
    <div className="h-7 w-28 bg-zinc-800 rounded-full animate-pulse" />
  )

  if (!data || data.score < 20) return null

  const color = data.score >= 70
    ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
    : data.score >= 50
    ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-300'
    : 'bg-zinc-800 border-zinc-700 text-zinc-400'

  return (
    <div className={`flex flex-col gap-1.5 px-3 py-2 rounded-2xl border ${color}`}>
      <div className="flex items-center gap-1.5">
        <Zap size={12} className="fill-current" />
        <span className="text-xs font-bold">{data.score}% match</span>
        <span className="text-[10px] opacity-70">· {data.label}</span>
      </div>
      {data.commonGenres.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {data.commonGenres.slice(0, 3).map(g => (
            <span key={g} className="text-[9px] bg-black/20 px-1.5 py-0.5 rounded-full opacity-80">{g}</span>
          ))}
        </div>
      )}
    </div>
  )
}