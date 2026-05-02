'use client'

import { useState, useEffect } from 'react'
import { Loader2, UserCheck, UserPlus } from 'lucide-react'
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
      if (isFollowingInitial !== undefined) return
      const { data } = await supabase
        .from('follows').select('follower_id')
        .eq('follower_id', user.id).eq('following_id', targetId).maybeSingle()
      setIsFollowing(!!data)
    }
    check()
  }, [targetId, isFollowingInitial]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isFollowing === null || !currentUserId || currentUserId === targetId) return null

  const toggle = async () => {
    if (!currentUserId || loading) return
    const next = !isFollowing
    setLoading(true)
    setIsFollowing(next)

    const res = await fetch('/api/social/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: targetId, action: next ? 'follow' : 'unfollow' }),
    }).catch(() => null)

    if (!res?.ok) setIsFollowing(!next)
    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2xl px-3 text-[11px] font-black transition-all disabled:opacity-55"
      style={isFollowing
        ? { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
        : { background: 'var(--accent)', color: '#0B0B0F' }}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : isFollowing ? <UserCheck size={12} /> : <UserPlus size={12} />}
      {isFollowing ? t.follow.following : t.follow.follow}
    </button>
  )
}
