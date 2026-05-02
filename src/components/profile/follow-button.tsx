"use client"
// follow-button.tsx — social CTA coerente con Profile/Friends
// Fix #18 Repair Bible: rollback ottimistico in caso di errore API

import { useState } from 'react'
import { UserPlus, UserCheck, Loader2 } from 'lucide-react'
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
  const { t } = useLocale()

  if (targetId === currentUserId) return null

  const toggleFollow = async () => {
    if (loading) return
    setLoading(true)

    const nextFollowing = !isFollowing
    setIsFollowing(nextFollowing)
    onFollowChange?.(nextFollowing)

    try {
      const res = await fetch('/api/social/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId, action: nextFollowing ? 'follow' : 'unfollow' }),
      })

      if (!res.ok) {
        setIsFollowing(!nextFollowing)
        onFollowChange?.(!nextFollowing)
      }
    } catch {
      setIsFollowing(!nextFollowing)
      onFollowChange?.(!nextFollowing)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={loading}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-black transition-all disabled:opacity-55"
      style={isFollowing
        ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
        : { background: 'var(--accent)', color: '#0B0B0F', boxShadow: '0 0 26px rgba(230,255,61,0.16)' }}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : isFollowing ? (
        <UserCheck size={14} strokeWidth={2.4} />
      ) : (
        <UserPlus size={14} strokeWidth={2.4} />
      )}
      <span>{isFollowing ? t.follow.following : t.follow.follow}</span>
    </button>
  )
}
