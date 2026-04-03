"use client"
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Header } from "@/components/feed/header"
import { Nav } from "@/components/feed/nav"
import { FeedCard } from "@/components/feed/FeedCard"
import { Loader2, Globe, Users } from 'lucide-react'

export default function Home() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'following'>('all')
  const [user, setUser] = useState<any>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    fetchPosts()
  }, [filter])

  async function fetchPosts() {
    setLoading(true)
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    setUser(currentUser)

    let query = supabase
      .from('posts')
      .select(`
        *,
        profiles (username, avatar_url, display_name),
        likes (user_id),
        comments (id, content, profiles (username))
      `)
      .order('created_at', { ascending: false })

    // Se il filtro è 'following', scarichiamo solo i post di chi seguiamo
    if (filter === 'following' && currentUser) {
      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUser.id)

      const followingIds = following?.map(f => f.following_id) || []
      query = query.in('user_id', [...followingIds, currentUser.id]) // Includi te stesso
    }

    const { data } = await query
    if (data) setPosts(data)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Header />
      
      <main className="max-w-xl mx-auto pt-24 pb-32 px-4">
        
        {/* Toggle Filtro */}
        <div className="flex bg-[#16161e] p-1 rounded-full border border-white/5 mb-8 w-fit mx-auto">
          <button 
            onClick={() => setFilter('all')}
            className={`flex items-center gap-2 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              filter === 'all' ? 'bg-[#7c6af7] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Globe size={14} /> Global
          </button>
          <button 
            onClick={() => setFilter('following')}
            className={`flex items-center gap-2 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              filter === 'following' ? 'bg-[#7c6af7] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Users size={14} /> Following
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-[#7c6af7]" size={32} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {posts.map((post) => (
              <FeedCard key={post.id} post={post} />
            ))}
            
            {posts.length === 0 && (
              <div className="text-center py-20 opacity-30">
                <Users size={48} className="mx-auto mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">L'arena è vuota. Inizia a seguire qualcuno!</p>
              </div>
            )}
          </div>
        )}
      </main>

      <Nav />
    </div>
  )
}
