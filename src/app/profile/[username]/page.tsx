"use client"
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Header } from "@/components/feed/header"
import { Nav } from "@/components/feed/nav"
import { FeedCard } from "@/components/feed/FeedCard"
import { Loader2, Zap, ArrowLeft, UserPlus, UserCheck } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'

export default function PublicProfilePage() {
  const { username } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    loadProfileData()
  }, [username])

  async function loadProfileData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (prof) {
      setProfile(prof)
      
      // Controlla se lo stai già seguendo
      if (user) {
        const { data: followData } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', user.id)
          .eq('following_id', prof.id)
          .single()
        
        setIsFollowing(!!followData)
      }

      const { data: userPosts } = await supabase
        .from('posts')
        .select(`*, profiles(username, avatar_url, display_name), likes(user_id), comments(id, content, profiles(username))`)
        .eq('user_id', prof.id)
        .order('created_at', { ascending: false })

      if (userPosts) setPosts(userPosts)
    }
    setLoading(false)
  }

  async function toggleFollow() {
    if (!currentUser) return alert("Accedi per seguire questo gamer!")
    if (currentUser.id === profile.id) return alert("Non puoi seguire te stesso, narcisista!")

    if (isFollowing) {
      setIsFollowing(false)
      await supabase.from('follows').delete().match({ follower_id: currentUser.id, following_id: profile.id })
    } else {
      setIsFollowing(true)
      await supabase.from('follows').insert([{ follower_id: currentUser.id, following_id: profile.id }])
    }
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><Loader2 className="animate-spin text-[#7c6af7]" size={40} /></div>

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Header />
      <main className="max-w-xl mx-auto pt-24 pb-32 px-4">
        <div className="relative mb-8 bg-[#16161e] border border-white/5 rounded-[3rem] p-8 overflow-hidden shadow-2xl text-center">
          <button onClick={() => router.back()} className="absolute top-6 left-6 text-gray-600"><ArrowLeft size={20} /></button>
          
          <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-tr from-[#7c6af7] to-[#b4a9ff] p-1 mb-4 mx-auto">
            <img src={profile?.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${profile?.id}`} className="w-full h-full object-cover rounded-[1.8rem] bg-[#16161e]" alt="avatar" />
          </div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">{profile?.display_name || 'Gamer'}</h1>
          <p className="text-[#7c6af7] text-xs font-bold uppercase tracking-[0.2em] mt-1">@{profile?.username}</p>
          
          {currentUser?.id !== profile?.id && (
            <button 
              onClick={toggleFollow}
              className={`mt-6 px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 mx-auto ${
                isFollowing ? 'bg-white/5 text-gray-400 border border-white/10' : 'bg-[#7c6af7] text-white shadow-lg shadow-[#7c6af7]/20'
              }`}
            >
              {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
              {isFollowing ? 'Seguito' : 'Segui Gamer'}
            </button>
          )}
        </div>

        <div className="space-y-6">
          {posts.map(post => <FeedCard key={post.id} post={post} />)}
        </div>
      </main>
      <Nav />
    </div>
  )
}
