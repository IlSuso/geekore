'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/locale'

export function FollowBackButton({
  targetId,
  isFollowingInitial,
}: {
  targetId: string
  isFollowingInitial?: boolean
}) {
  const [isFollowing, setIsFollowing] = useState<boolean | null>(isFollowingInitial ?? null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const { t } = useLocale()

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)
      if (user.id === targetId) return
      // Se isFollowingInitial è già stato passato, non fare la query
      if (isFollowingInitial !== undefined) return
      const { data } = await supabase
        .from('follows').select('follower_id')
        .eq('follower_id', user.id).eq('following_id', targetId).maybeSingle()
      setIsFollowing(!!data)
    }
    check()
  }, [targetId, isFollowingInitial])

  if (isFollowing === null || !currentUserId || currentUserId === targetId) return null

  const toggle = async () => {
    if (!currentUserId || loading) return
    setLoading(true)
    if (isFollowing) {
      await fetch('/api/social/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId, action: 'unfollow' }),
      }).catch(() => {})
      setIsFollowing(false)
    } else {
      await fetch('/api/social/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId, action: 'follow' }),
      }).catch(() => {})
      setIsFollowing(true)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle} disabled={loading}
      className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
        isFollowing
          ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700'
          : 'bg-violet-600 text-white hover:bg-violet-500'
      }`}
    >
      {loading ? '…' : isFollowing ? t.follow.following : t.follow.follow}
    </button>
  )
}
