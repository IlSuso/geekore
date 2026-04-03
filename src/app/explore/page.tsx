import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Header } from "@/components/feed/header"
import { Nav } from "@/components/feed/nav"
import { FeedCard } from "@/components/feed/FeedCard"
import { SearchSection } from "@/components/explore/search-section"

export default async function ExplorePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Recupera tutti i post della piattaforma
  const { data: allPosts } = await supabase
    .from('posts')
    .select(`*, profiles:user_id (*)`)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Header />
      
      <main className="max-w-2xl mx-auto pt-24 pb-24 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-black italic uppercase tracking-tighter">Esplora</h1>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Scopri nuovi player nella community</p>
        </div>

        {/* Sezione di Ricerca Utenti */}
        <SearchSection />

        <div className="space-y-6 mt-10">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#7c6af7]">Post Recenti</h2>
          {allPosts?.map((post: any) => (
            <FeedCard key={post.id} post={post} />
          ))}
        </div>
      </main>

      <Nav />
    </div>
  )
}
