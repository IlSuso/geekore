"use client"
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Plus } from 'lucide-react'

export function StoriesBar() {
  const [profiles, setProfiles] = useState<any[]>([])
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function fetchActiveProfiles() {
      // Prendiamo i profili che hanno un username (quindi completi)
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .limit(10)
      
      if (data) setProfiles(data)
    }
    fetchActiveProfiles()
  }, [supabase])

  return (
    <div className="flex gap-5 overflow-x-auto pb-6 scrollbar-hide">
      {/* Bottone "Aggiungi Storia" dell'utente */}
      <div className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group">
        <div className="w-20 h-20 rounded-[2rem] bg-[#16161e] border-2 border-dashed border-white/10 flex items-center justify-center text-white group-hover:border-[#7c6af7]/50 transition-all relative">
          <Plus size={24} className="text-gray-500 group-hover:text-[#7c6af7]" />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#7c6af7] rounded-xl border-4 border-[#0a0a0f] flex items-center justify-center">
            <Plus size={12} className="text-white stroke-[4]" />
          </div>
        </div>
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tu</span>
      </div>

      {/* Lista Profili Dinamici */}
      {profiles.map((profile, i) => (
        <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group">
          <div className="w-20 h-20 rounded-[2.2rem] p-[3px] bg-gradient-to-tr from-[#7c6af7] via-[#b06ab3] to-[#ff4d4d] group-hover:scale-105 transition-transform duration-300">
            <div className="w-full h-full rounded-[2rem] bg-[#0a0a0f] p-1">
              <div className="w-full h-full rounded-[1.8rem] bg-[#1c1c27] flex items-center justify-center overflow-hidden border border-white/5">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-black text-white/20">
                    {profile.username?.[0]?.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-black text-gray-400 group-hover:text-white uppercase tracking-tighter transition-colors">
            {profile.username || 'Gamer'}
          </span>
        </div>
      ))}

      {/* Placeholder se ci sono pochi profili */}
      {profiles.length < 5 && [1, 2, 3].map((n) => (
        <div key={n} className="flex flex-col items-center gap-2 flex-shrink-0 opacity-30 grayscale">
          <div className="w-20 h-20 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center">
            <div className="w-10 h-1 border-t-2 border-white/20 rounded-full" />
          </div>
          <div className="w-8 h-2 bg-white/10 rounded-full" />
        </div>
      ))}
    </div>
  )
}