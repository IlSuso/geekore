"use client"
// follow-button.tsx — Geekore style: gradient viola→fuchsia per segui, outline per seguendo
// Fix #18 Repair Bible: rollback ottimistico in caso di errore API

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, UserCheck } from 'lucide-react'
import { useLocale } from '@/lib/locale'

export function FollowButton({
  targetId, currentUserId, isFollowingInitial, onFollowChange,
}: {
  targetId: string
  currentUserId: string
  isFollowingInitial: boolean
  onFollowChange?: (isNowFollowing: boolean) => void
}) {
  const [isFollowing, setIsFollowing] = useState(isFollowingInitial)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const { t } = useLocale()

  if (targetId === currentUserId) return null

  const toggleFollow = async () => {
    if (loading) return
    setLoading(true)

    const nextFollowing = !isFollowing

    // Aggiornamento ottimistico immediato
    setIsFollowing(nextFollowing)
    onFollowChange?.(nextFollowing)

    try {
      const res = await fetch('/api/social/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId, action: nextFollowing ? 'follow' : 'unfollow' }),
      })

      if (!res.ok) {
        // Rollback in caso di errore
        setIsFollowing(!nextFollowing)
        onFollowChange?.(!nextFollowing)
      }
    } catch {
      // Rollback in caso di errore di rete
      setIsFollowing(!nextFollowing)
      onFollowChange?.(!nextFollowing)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggleFollow}
      disabled={loading}
      className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-50 ${
        isFollowing
          ? 'bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:border-violet-500/50 hover:text-violet-400'
          : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 shadow-md shadow-violet-500/20'
      }`}
    >
      {isFollowing
        ? <><UserCheck size={14} strokeWidth={2} /> {t.follow.following}</>
        : <><UserPlus size={14} strokeWidth={2} /> {t.follow.follow}</>}
    </button>
  )
}