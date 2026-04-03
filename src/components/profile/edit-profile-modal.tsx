"use client"
import { useState, useRef } from 'react'
import { Settings, X, Camera, Loader2, Upload, Twitch, MessageSquare, AlignLeft, Trash2 } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export function EditProfileModal({ profile }: { profile: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle')
  const router = useRouter()
  
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
        const filePath = `public/${fileName}`
        await supabase.storage.from('avatars').upload(filePath, avatarFile, { upsert: true })
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
        finalAvatarUrl = urlData.publicUrl
      }
      await supabase.from('profiles').update({ ...formData, avatar_url: finalAvatarUrl }).eq('id', profile.id)
      setIsOpen(false)
      router.refresh()
    } catch (error) {
      alert("Errore nel salvataggio")
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePhoto = async () => {
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    setPreviewUrl(null)
    setDeleteStep('idle')
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="absolute -bottom-2 -right-2 p-3 bg-[#16161e] border border-white/10 rounded-2xl text-[#7c6af7] hover:scale-110 transition-all shadow-xl z-10">
        <Settings size={18} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-md bg-black/60">
          <div className="bg-[#16161e] border border-white/10 w-full max-w-xl rounded-[3rem] p-8 relative">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Modifica Profilo</h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white"><X size={24} /></button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                <div className="w-28 h-28 rounded-[2.5rem] bg-[#0a0a0f] border-2 border-dashed border-white/10 overflow-hidden relative group" onClick={() => fileInputRef.current?.click()}>
                  {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" /> : <Camera size={32} className="text-gray-700 m-auto" />}
                  <div className="absolute inset-0 bg-[#7c6af7]/20 opacity-0 group-hover:opacity-100 flex items-center justify-center"><Upload size={20} className="text-white"/></div>
                </div>
                {previewUrl && (
                  deleteStep === 'idle' ? 
                  <button type="button" onClick={() => setDeleteStep('confirm')} className="text-[10px] font-black text-gray-500 uppercase">Rimuovi foto</button> :
                  <div className="flex gap-2"><button type="button" onClick={handleDeletePhoto} className="text-[10px] font-black text-red-500 uppercase">Sì, elimina</button><button type="button" onClick={() => setDeleteStep('idle')} className="text-[10px] font-black text-gray-400 uppercase">No</button></div>
                )}
                <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) { setAvatarFile(e.target.files[0]); setPreviewUrl(URL.createObjectURL(e.target.files[0])); }}} className="hidden" accept="image/*" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Gamer Tag</label>
                  <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-1 focus:ring-[#7c6af7] outline-none" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Twitch</label>
                  <input type="text" value={formData.twitch_url} onChange={(e) => setFormData({...formData, twitch_url: e.target.value})} className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-1 focus:ring-[#6441a5] outline-none" placeholder="Link..." />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase">Bio</label>
                <textarea value={formData.bio} onChange={(e) => setFormData({...formData, bio: e.target.value})} rows={3} className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-1 focus:ring-[#7c6af7] outline-none resize-none" placeholder="Chi sei?" />
              </div>

              <button disabled={loading} className="w-full bg-[#7c6af7] text-white font-black py-5 rounded-[2rem] uppercase tracking-tighter hover:bg-[#6b5ae0] transition-all">
                {loading ? <Loader2 className="animate-spin m-auto" size={20} /> : "Salva Modifiche"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}