'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function FollowBackButton({ targetId }: { targetId: string }) {
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)
      if (user.id === targetId) return // non mostrare se è te stesso
      const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', user.id)
        .eq('following_id', targetId)
        .maybeSingle()
      setIsFollowing(!!data)
    }
    check()
  }, [targetId])

  if (isFollowing === null || !currentUserId || currentUserId === targetId) return null

  const toggle = async () => {
    if (!currentUserId || loading) return
    setLoading(true)
    if (isFollowing) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetId)
      setIsFollowing(false)
    } else {
      await supabase.from('follows').insert({
        follower_id: currentUserId,
        following_id: targetId,
      })
      setIsFollowing(true)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
        isFollowing
          ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700'
          : 'bg-violet-600 text-white hover:bg-violet-500'
      }`}
    >
      {loading ? '...' : isFollowing ? 'Seguito ✓' : 'Segui'}
    </button>
  )
}
