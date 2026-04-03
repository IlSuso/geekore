import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PostCard } from '@/components/feed/post-card'
import { Ghost } from 'lucide-react'

export default async function HomePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name) { return cookieStore.get(name)?.value } } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      profiles (id, username, avatar_url),
      likes (user_id)
    `)
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-24 pb-32 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-10 px-2">
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            GEEK<span className="text-[#7c6af7]">ORE</span>
          </h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Sector_Global_Feed</p>
        </div>

        <div className="space-y-8">
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
            <div className="text-center py-32 border-2 border-dashed border-white/5 rounded-[3rem]">
              <Ghost className="mx-auto text-gray-800 mb-4" size={50} />
              <p className="text-gray-600 font-black uppercase italic tracking-widest text-xs">Radar offline...</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}