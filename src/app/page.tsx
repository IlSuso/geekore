import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PostCard } from '@/components/feed/post-card'
import { Film, Gamepad2, BookOpen, Tv, Ghost, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default async function HomePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name) { return cookieStore.get(name)?.value } } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  
  // Recupera post e info sugli item collegati
  const { data: posts } = await supabase
    .from('posts')
    .select(`*, profiles (username, avatar_url), nerd_items (title, category), likes (user_id)`)
    .order('created_at', { ascending: false })

  const categories = [
    { name: 'Gaming', icon: <Gamepad2 size={20} />, color: 'from-blue-500' },
    { name: 'Cinema', icon: <Film size={20} />, color: 'from-red-500' },
    { name: 'Anime', icon: <Tv size={20} />, color: 'from-purple-500' },
    { name: 'Manga', icon: <BookOpen size={20} />, color: 'from-orange-500' },
  ]

  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-24 pb-32 px-4">
      <div className="max-w-xl mx-auto">
        
        {/* EXPLORER BAR - Le 4 anime del mondo Nerd */}
        <div className="flex gap-4 overflow-x-auto pb-8 no-scrollbar">
          {categories.map((cat) => (
            <div key={cat.name} className={`flex-shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-br ${cat.color} to-transparent border border-white/10 backdrop-blur-md cursor-pointer hover:scale-105 transition-all`}>
              <span className="text-white">{cat.icon}</span>
              <span className="text-xs font-black uppercase tracking-tighter text-white">{cat.name}</span>
            </div>
          ))}
        </div>

        {/* NEWS FLASH / SUGGESTIONS */}
        <div className="mb-10 bg-gradient-to-r from-[#16161e] to-transparent p-6 rounded-[2rem] border border-white/5 relative overflow-hidden">
          <Sparkles className="absolute right-4 top-4 text-[#7c6af7] opacity-20" size={40} />
          <h2 className="text-[10px] font-black text-[#7c6af7] uppercase tracking-[0.3em] mb-2">Consiglio del giorno</h2>
          <p className="text-sm font-bold text-gray-200">Hai visto l'ultimo episodio di Solo Leveling? La community lo sta amando!</p>
        </div>

        {/* FEED MULTIMEDIALE */}
        <div className="space-y-10">
          {posts && posts.length > 0 ? (
            posts.map((post: any) => (
              <PostCard 
                key={post.id} 
                post={{
                  ...post, 
                  likes_count: post.likes?.length || 0,
                  is_liked_by_me: post.likes?.some((l: any) => l.user_id === session?.user?.id)
                }} 
                currentUser={session?.user} 
              />
            ))
          ) : (
            <div className="text-center py-20 opacity-20">
              <Ghost size={48} className="mx-auto mb-4" />
              <p className="text-xs font-black uppercase tracking-widest">Nessun drop rilevato nel settore</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}