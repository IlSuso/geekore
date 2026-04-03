"use client"
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export function FollowButton({ targetId, currentUserId, isFollowingInitial }: { targetId: string, currentUserId: string, isFollowingInitial: boolean }) {
  const [isFollowing, setIsFollowing] = useState(isFollowingInitial)
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const toggleFollow = async () => {
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetId)
      setIsFollowing(false)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetId })
      // Notifica di follow
      await supabase.from('notifications').insert({ receiver_id: targetId, sender_id: currentUserId, type: 'follow' })
      setIsFollowing(true)
    }
  }

  if (targetId === currentUserId) return null

  return (
    <button 
      onClick={toggleFollow}
      className={`px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${
        isFollowing ? 'bg-white/5 text-gray-400 border border-white/10' : 'bg-[#7c6af7] text-white shadow-lg shadow-[#7c6af7]/20 hover:scale-105'
      }`}
    >
      {isFollowing ? 'Following' : 'Follow Player'}
    </button>
  )
}