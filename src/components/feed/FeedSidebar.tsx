// src/components/feed/FeedSidebar.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, Users, Award } from 'lucide-react'

interface TrendingItem {
  id: string
  title: string
  count: number
  type: 'post' | 'user' | 'game'
}

export default function FeedSidebar() {
  const [trendingPosts, setTrendingPosts] = useState<TrendingItem[]>([])
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    const fetchSidebarData = async () => {
      setLoading(true)
      try {
        // ── Trending posts ──
        const { data: postsData, error: postsError } = await supabase
          .from('posts')
          .select('id, content, likes_count, user_id')
          .order('likes_count', { ascending: false })
          .limit(5)

        if (postsError) throw postsError

        const mappedPosts: TrendingItem[] = (postsData || []).map((post: any) => ({
          id: post.id,
          title: post.content?.substring(0, 60) + (post.content?.length > 60 ? '...' : ''),
          count: post.likes_count || 0,
          type: 'post' as const
        }))

        setTrendingPosts(mappedPosts)

        // ── Suggested users ──
        const { data: { user } } = await supabase.auth.getUser()

        const { data: usersData } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, followers_count')
          .neq('id', user?.id || '')
          .order('followers_count', { ascending: false })
          .limit(5)

        setSuggestedUsers(usersData || [])

      } catch (error) {
        console.error('Errore caricamento sidebar:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSidebarData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-8 bg-zinc-800 rounded"></div>
        <div className="animate-pulse h-64 bg-zinc-800 rounded-xl"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8 sticky top-20">
      {/* Trending Section */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <TrendingUp className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold text-lg">Trending oggi</h3>
        </div>

        <div className="space-y-4">
          {trendingPosts.length > 0 ? (
            trendingPosts.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-sm">
                <div className="text-zinc-300 line-clamp-2 pr-2">
                  {item.title}
                </div>
                <div className="text-xs text-zinc-500 font-mono">{item.count}</div>
              </div>
            ))
          ) : (
            <p className="text-zinc-500 text-sm">Nessun post trending al momento</p>
          )}
        </div>
      </div>

      {/* Suggested Users */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Users className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-lg">Da seguire</h3>
        </div>

        <div className="space-y-4">
          {suggestedUsers.length > 0 ? (
            suggestedUsers.map((user: any) => (
              <div key={user.id} className="flex items-center gap-3">
                <img
                  src={user.avatar_url || '/default-avatar.png'}
                  alt={user.username}
                  className="w-9 h-9 rounded-full object-cover border border-zinc-700"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">@{user.username}</div>
                  <div className="text-xs text-zinc-500">
                    {user.followers_count || 0} follower
                  </div>
                </div>
                <button className="text-xs px-4 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors">
                  Segui
                </button>
              </div>
            ))
          ) : (
            <p className="text-zinc-500 text-sm">Nessun suggerimento al momento</p>
          )}
        </div>
      </div>

      {/* Leaderboard mini */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Award className="w-5 h-5 text-yellow-400" />
          <h3 className="font-semibold text-lg">Top Gamer</h3>
        </div>
        <p className="text-zinc-500 text-sm">Leaderboard completa in arrivo</p>
      </div>
    </div>
  )
}