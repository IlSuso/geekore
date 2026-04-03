import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Header } from "@/components/feed/header"
import { Nav } from "@/components/feed/nav"
import { FeedCard } from "@/components/feed/FeedCard"
import { CreatePost } from "@/components/feed/create-post"

export default async function FeedPage() {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Ora che la Foreign Key esiste, questa query funzionerà perfettamente
  const { data: posts, error } = await supabase
    .from('posts') 
    .select(`
      id,
      content,
      created_at,
      user_id,
      profiles (
        username,
        display_name,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Header />
      
      <main className="max-w-2xl mx-auto pt-24 pb-24 px-4">
        <CreatePost />

        <div className="space-y-4">
          {posts && posts.length > 0 ? (
            posts.map((post: any) => (
              <FeedCard key={post.id} post={post} />
            ))
          ) : (
            <div className="text-center py-20 bg-[#16161e] rounded-3xl border border-white/5">
              <p className="text-gray-500 text-sm uppercase tracking-widest font-bold italic">
                {error ? `Errore Database: ${error.message}` : 'Nessun post nel feed'}
              </p>
            </div>
          )}
        </div>
      </main>

      <Nav />
    </div>
  )
}
