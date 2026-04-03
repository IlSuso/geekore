"use client"
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export function ProfileForm({ user, profile }: { user: any, profile: any }) {
  const [loading, setLoading] = useState(false)
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [username, setUsername] = useState(profile?.username || '')
  const [bio, setBio] = useState(profile?.bio || '')
  const [website, setWebsite] = useState(profile?.website || '')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const updateProfile = async () => {
    setLoading(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        display_name: displayName,
        username: username,
        bio: bio,
        website: website,
        updated_at: new Date().toISOString(),
      })

    if (error) alert(error.message)
    else alert("Profilo aggiornato!")
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 text-xs font-bold">
        <div>
          <label className="text-gray-500 uppercase tracking-widest ml-2 mb-2 block">Nome Pubblico</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-[#7c6af7]" />
        </div>
        <div>
          <label className="text-gray-500 uppercase tracking-widest ml-2 mb-2 block">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-[#7c6af7]" />
        </div>
        <div>
          <label className="text-gray-500 uppercase tracking-widest ml-2 mb-2 block">Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-[#7c6af7] min-h-[100px]" placeholder="Di cosa sei fan?" />
        </div>
        <div>
          <label className="text-gray-500 uppercase tracking-widest ml-2 mb-2 block">Sito Web / Link</label>
          <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-[#7c6af7]" />
        </div>
      </div>
      <button onClick={updateProfile} disabled={loading} className="w-full bg-[#7c6af7] py-4 rounded-2xl font-black uppercase tracking-[0.2em] shadow-lg shadow-[#7c6af7]/20 transition-all active:scale-95">
        {loading ? 'Salvataggio...' : 'Salva Profilo'}
      </button>
    </div>
  )
}
