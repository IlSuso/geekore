import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Trophy, Grid, Bookmark, Ghost, Twitch, MessageSquare } from 'lucide-react'
import { EditProfileModal } from '@/components/profile/edit-profile-modal'

export default async function ProfilePage() {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  // 1. Recupero sessione
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // 2. Query robusta con conteggi (Assicurati di aver eseguito lo script SQL dei Follow)
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(`
      *,
      posts (id, image_url, content, created_at),
      followers:follows!following_id(count),
      following:follows!follower_id(count)
    `)
    .eq('id', session.user.id)
    .single()

  if (error || !profile) {
    return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white font-black uppercase italic tracking-tighter">Caricamento Profilo fallito...</div>
  }

  const posts = profile.posts || []
  const followerCount = profile.followers?.[0]?.count || 0
  const followingCount = profile.following?.[0]?.count || 0

  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-24 pb-32 px-6">
      <div className="max-w-2xl mx-auto">
        
        {/* HEADER PROFILO */}
        <div className="relative mb-12">
          <div className="h-40 w-full bg-gradient-to-r from-[#7c6af7] to-[#b06ab3] rounded-[3rem] opacity-10 blur-3xl absolute -top-10" />
          
          <div className="relative flex flex-col items-center">
            {/* Avatar */}
            <div className="relative group">
              <div className="w-32 h-32 rounded-[3rem] p-1 bg-gradient-to-tr from-[#7c6af7] to-[#ff4d4d] mb-4 shadow-2xl">
                <div className="w-full h-full rounded-[2.8rem] bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-black text-white/20">
                      {profile.username?.[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <EditProfileModal profile={profile} />
            </div>

            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
              {profile.username || 'Senza Nome'}
            </h2>
            
            {/* Bio */}
            {profile.bio && (
              <p className="max-w-md text-center text-gray-400 text-sm mt-4 italic px-4 leading-relaxed">
                "{profile.bio}"
              </p>
            )}

            {/* Social Links */}
            <div className="flex gap-4 mt-6">
              {profile.twitch_url && (
                <a href={profile.twitch_url.startsWith('http') ? profile.twitch_url : `https://${profile.twitch_url}`} target="_blank" className="p-3 bg-white/5 rounded-2xl text-gray-400 hover:text-[#6441a5] border border-white/5">
                  <Twitch size={18} />
                </a>
              )}
              {profile.discord_username && (
                <div className="p-3 bg-white/5 rounded-2xl text-gray-400 hover:text-[#5865F2] border border-white/5 group relative">
                  <MessageSquare size={18} />
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#5865F2] text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {profile.discord_username}
                  </span>
                </div>
              )}
            </div>

            {/* Stats Bar con dati reali */}
            <div className="flex gap-10 mt-10 bg-[#16161e]/60 border border-white/5 p-6 rounded-[2rem] w-full justify-around shadow-xl">
              <div className="text-center">
                <span className="block text-xl font-black text-white">{posts.length}</span>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Drops</span>
              </div>
              <div className="text-center border-x border-white/5 px-10">
                <span className="block text-xl font-black text-white">{followerCount}</span>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Followers</span>
              </div>
              <div className="text-center">
                <span className="block text-xl font-black text-white">{followingCount}</span>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Following</span>
              </div>
            </div>
          </div>
        </div>

        {/* FEED */}
        <div className="flex justify-center gap-8 mb-8 border-b border-white/5 pb-4">
          <button className="flex items-center gap-2 text-[#7c6af7] font-black text-xs uppercase tracking-widest border-b-2 border-[#7c6af7] pb-4 -mb-[18px]">
            <Grid size={16} /> My Drops
          </button>
          <button className="flex items-center gap-2 text-gray-600 font-black text-xs uppercase tracking-widest hover:text-white transition-colors pb-4">
            <Bookmark size={16} /> Saved
          </button>
        </div>

        {posts.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {posts.map((post: any) => (
              <div key={post.id} className="aspect-square rounded-[2rem] overflow-hidden border border-white/5 relative group bg-[#16161e]">
                {post.image_url && (
                  <img src={post.image_url} alt="Post" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Trophy className="text-white" size={32} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-[#16161e]/30 rounded-[3rem] border-2 border-dashed border-white/5">
            <Ghost className="mx-auto text-gray-700 mb-4" size={48} />
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Ancora nessun drop...</p>
          </div>
        )}
      </div>
    </main>
  )
}