"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { UserPlus, UserCheck } from 'lucide-react'

export function FollowButton({
  targetId,
  currentUserId,
  isFollowingInitial,
}: {
  targetId: string
  currentUserId: string
  isFollowingInitial: boolean
}) {
  const [isFollowing, setIsFollowing] = useState(isFollowingInitial)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  if (targetId === currentUserId) return null

  const toggleFollow = useCallback(async () => {
    if (loading) return
    setLoading(true)

    // Optimistic update
    const prev = isFollowing
    setIsFollowing(!prev)

    try {
      if (prev) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', targetId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: currentUserId, following_id: targetId })
        if (error) throw error

        // Notification — best effort, don't block on failure
        await supabase.from('notifications').insert({
          receiver_id: targetId,
          sender_id: currentUserId,
          type: 'follow',
        })
      }
    } catch {
      // Rollback optimistic update
      setIsFollowing(prev)
      showToast('Errore. Riprova tra poco.', 'error')
    } finally {
      setLoading(false)
    }
  }, [loading, isFollowing, targetId, currentUserId])

  return (
    <button
      onClick={toggleFollow}
      disabled={loading}
      aria-label={isFollowing ? `Smetti di seguire` : `Segui`}
      aria-pressed={isFollowing}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-60 ${
        isFollowing
          ? 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600'
          : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 shadow-lg shadow-violet-500/20'
      }`}
    >
      {isFollowing ? (
        <><UserCheck size={16} /> Following</>
      ) : (
        <><UserPlus size={16} /> Segui</>
      )}
    </button>
  )
}
