// DESTINAZIONE: src/app/explore/page.tsx

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { FeedCard } from '@/components/feed/FeedCard'
import { SearchSection } from '@/components/explore/search-section'

export default async function ExplorePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: allPosts } = await supabase
    .from('posts')
    .select(`*, profiles:user_id (*)`)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <main className="max-w-2xl mx-auto pt-8 pb-24 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-black italic uppercase tracking-tighter">Esplora</h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-1">
            Scopri nuovi player nella community
          </p>
        </div>

        <SearchSection />

        <div className="space-y-6 mt-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-violet-400">Post Recenti</h2>
          {allPosts?.map((post: any) => (
            <FeedCard key={post.id} post={post} />
          ))}
        </div>
      </main>
    </div>
  )
}