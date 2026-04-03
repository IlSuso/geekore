"use client"
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { UserPlus, UserCheck } from 'lucide-react'

export function FollowButton({ targetUserId, currentUserId, initialIsFollowing }: any) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [loading, setLoading] = useState(false)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const toggleFollow = async () => {
    setLoading(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetUserId)
      setIsFollowing(false)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetUserId })
      setIsFollowing(true)
    }
    setLoading(false)
  }

  return (
    <button 
      onClick={toggleFollow}
      disabled={loading}
      className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
        isFollowing 
        ? 'bg-white/5 text-gray-400 border border-white/10' 
        : 'bg-[#7c6af7] text-white shadow-lg shadow-[#7c6af7]/20 hover:scale-105'
      }`}
    >
      {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
      {isFollowing ? 'Seguito' : 'Segui'}
    </button>
  )
}
