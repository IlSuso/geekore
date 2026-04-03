"use client"
import { useState, useRef } from 'react'
import { Settings, X, Camera, Loader2, Upload, Twitch, MessageSquare, AlignLeft } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export function EditProfileModal({ profile }: { profile: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  
  // Stati per i campi del profilo
  const [formData, setFormData] = useState({
    username: profile?.username || '',
    bio: profile?.bio || '',
    twitch_url: profile?.twitch_url || '',
    discord_username: profile?.discord_username || ''
  })

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(profile?.avatar_url || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let finalAvatarUrl = profile.avatar_url

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop()
        const fileName = `${profile.id}-${Date.now()}.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(`public/${fileName}`, avatarFile)
        
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(`public/${fileName}`)
        finalAvatarUrl = urlData.publicUrl
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          username: formData.username,
          bio: formData.bio,
          twitch_url: formData.twitch_url,
          discord_username: formData.discord_username,
          avatar_url: finalAvatarUrl 
        })
        .eq('id', profile.id)

      if (updateError) throw updateError
      setIsOpen(false)
      router.refresh()
    } catch (error: any) {
      alert("Errore: " + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="absolute -bottom-2 -right-2 p-3 bg-[#16161e] border border-white/10 rounded-2xl text-[#7c6af7] hover:scale-110 transition-all shadow-xl z-10"
      >
        <Settings size={18} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md bg-black/60 overflow-y-auto">
          <div className="bg-[#16161e] border border-white/10 w-full max-w-xl rounded-[3rem] p-6 sm:p-10 shadow-2xl my-auto">
            
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Custom_Avatar</h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white"><X size={24} /></button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-6">
              {/* Avatar Section */}
              <div className="flex justify-center mb-10">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className="w-28 h-28 rounded-[2.5rem] bg-[#0a0a0f] border-2 border-dashed border-[#7c6af7]/30 flex items-center justify-center overflow-hidden group-hover:border-[#7c6af7] transition-all">
                    {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" /> : <Camera size={32} className="text-gray-700" />}
                  </div>
                  <div className="absolute inset-0 bg-[#7c6af7]/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem]"><Upload size={20} className="text-white" /></div>
                  <input type="file" ref={fileInputRef} onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setAvatarFile(e.target.files[0])
                      setPreviewUrl(URL.createObjectURL(e.target.files[0]))
                    }
                  }} className="hidden" accept="image/*" />
                </div>
              </div>

              {/* Grid Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Gamer Tag</label>
                  <input 
                    type="text" 
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-2 focus:ring-[#7c6af7] outline-none"
                    placeholder="Username..."
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block flex items-center gap-2"><Twitch size={12}/> Twitch URL</label>
                  <input 
                    type="text" 
                    value={formData.twitch_url}
                    onChange={(e) => setFormData({...formData, twitch_url: e.target.value})}
                    className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-2 focus:ring-[#6441a5] outline-none"
                    placeholder="twitch.tv/..."
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block flex items-center gap-2"><AlignLeft size={12}/> Bio / About Me</label>
                <textarea 
                  value={formData.bio}
                  onChange={(e) => setFormData({...formData, bio: e.target.value})}
                  rows={3}
                  className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-2 focus:ring-[#7c6af7] outline-none resize-none"
                  placeholder="Scrivi qualcosa sulla tua carriera gaming..."
                />
              </div>

              <button 
                disabled={loading}
                className="w-full bg-[#7c6af7] text-white font-black py-5 rounded-[2rem] uppercase tracking-tighter flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 shadow-xl shadow-[#7c6af7]/20"
              >
                {loading ? <Loader2 className="animate-spin" /> : "Save Configuration_"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}