// DESTINAZIONE: src/components/social/SimilarTasteFriends.tsx
// ═══════════════════════════════════════════════════════════════════════════
// V3: Sezione "Amici con gusti simili" da mostrare nella For You page
// Usa /api/social/taste-similarity?batch=1 per calcolare match con i following
// ═══════════════════════════════════════════════════════════════════════════

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, Zap } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

interface SimilarFriend {
  userId: string
  profile: {
    id: string
    username: string
    display_name?: string
    avatar_url?: string
  } | null
  score: number
  label: string
  commonGenres: string[]
  entryCount: number
}

function SimilarityRing({ score }: { score: number }) {
  // Piccolo ring SVG che mostra il % visivamente
  const r = 16
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 70 ? '#8b5cf6' : score >= 50 ? '#ec4899' : '#6b7280'

  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <svg width="40" height="40" className="absolute -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#27272a" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={r} fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className="text-[10px] font-black text-white relative z-10">{score}%</span>
    </div>
  )
}

export function SimilarTasteFriends() {
  const [friends, setFriends] = useState<SimilarFriend[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/social/taste-similarity?batch=1')
      .then(r => r.json())
      .then(data => {
        setFriends((data.profiles || []).slice(0, 8))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-10 animate-pulse">
      <div className="h-4 w-40 bg-zinc-800 rounded mb-4" />
      <div className="flex gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex-shrink-0 w-24">
            <div className="w-12 h-12 bg-zinc-800 rounded-full mx-auto mb-2" />
            <div className="h-3 bg-zinc-800 rounded mx-auto w-16 mb-1" />
            <div className="h-2 bg-zinc-800 rounded mx-auto w-10" />
          </div>
        ))}
      </div>
    </div>
  )

  if (!friends.length) return null

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-10">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#E6FF3D' }}>
          <Zap size={16} className="text-black" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Gusti simili ai tuoi</h2>
          <p className="text-[10px] text-zinc-500">Amici con cui condividi più gusti</p>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {friends.map(f => {
          if (!f.profile) return null
          return (
            <Link
              key={f.userId}
              href={`/profile/${f.profile.username}`}
              className="flex-shrink-0 w-24 flex flex-col items-center group"
            >
              {/* Avatar con similarity ring */}
              <div className="relative mb-2">
                <SimilarityRing score={f.score} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Avatar
                    src={f.profile.avatar_url}
                    username={f.profile.username}
                    displayName={f.profile.display_name}
                    size={28}
                  />
                </div>
              </div>

              <p className="text-[10px] font-semibold text-zinc-200 truncate w-full text-center group-hover:text-violet-300 transition-colors">
                {f.profile.display_name || f.profile.username}
              </p>
              <p className="text-[9px] text-violet-400 font-medium">{f.label}</p>

              {/* Top generi in comune */}
              {f.commonGenres.length > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center mt-1">
                  {f.commonGenres.slice(0, 2).map(g => (
                    <span key={g} className="text-[8px] bg-violet-500/10 text-violet-400 px-1 py-0.5 rounded-full truncate max-w-full">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}