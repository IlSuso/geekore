"use client"
// follow-button.tsx — Instagram-style: "Segui" blu pieno, "Seguendo" outline sottile

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
        await supabase.from('follows').delete()
          .eq('follower_id', currentUserId).eq('following_id', targetId)
        setIsFollowing(false)
        onFollowChange?.(false)
      } else {
        await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetId })
        await supabase.from('notifications').insert({
          receiver_id: targetId, sender_id: currentUserId, type: 'follow',
        })
        setIsFollowing(true)
        onFollowChange?.(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggleFollow}
      disabled={loading}
      className="transition-all disabled:opacity-50"
      style={{
        padding: '7px 24px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        lineHeight: '18px',
        ...(isFollowing
          ? {
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }
          : {
              background: '#0095f6',
              color: '#ffffff',
              border: '1px solid #0095f6',
            }
        ),
      }}
    >
      {isFollowing ? t.follow.following : t.follow.follow}
    </button>
  )
}