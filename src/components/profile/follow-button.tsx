"use client"
// follow-button.tsx — Geekore style: gradient viola→fuchsia per segui, outline per seguendo

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
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetId)
        setIsFollowing(false); onFollowChange?.(false)
      } else {
        await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetId })
        await supabase.from('notifications').insert({ receiver_id: targetId, sender_id: currentUserId, type: 'follow' })
        setIsFollowing(true); onFollowChange?.(true)
      }
    } finally { setLoading(false) }
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