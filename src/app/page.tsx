import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PostCard } from '@/components/feed/post-card'

export default async function HomePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name) { return cookieStore.get(name)?.value } } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  
  // Query potente: prende Post + Profilo + Conteggio Like
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      profiles (id, username, avatar_url),
      likes (user_id)
    `)
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-10 pb-32 px-4 md:pt-28">
      <div className="max-w-lg mx-auto space-y-8">
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-8">Global_Feed</h1>
        
        {posts?.map((post: any) => (
          <PostCard 
            key={post.id} 
            post={{
              ...post, 
              likes_count: post.likes?.length || 0,
              is_liked_by_me: post.likes?.some((l: any) => l.user_id === session?.user?.id)
            }} 
            currentUser={session?.user} 
          />
        ))}

        {(!posts || posts.length === 0) && (
          <div className="text-center py-20 text-gray-600 font-bold uppercase tracking-widest text-xs">
            Nessun drop rilevato nel settore...
          </div>
        )}
      </div>
    </main>
  )
}