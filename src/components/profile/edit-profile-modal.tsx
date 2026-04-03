"use client"
import { useState, useRef } from 'react'
import { Settings, X, Camera, Loader2, Upload, Twitch, MessageSquare, AlignLeft, Trash2 } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export function EditProfileModal({ profile }: { profile: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle')
  const [deleteLoading, setDeleteLoading] = useState(false)
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

  const handleDeleteAvatar = async () => {
    if (!profile.avatar_url) return
    setDeleteLoading(true)
    try {
      const urlParts = profile.avatar_url.split('/')
      const fileName = urlParts[urlParts.length - 1]
      const filePath = `public/${fileName}`
      await supabase.storage.from('avatars').remove([filePath])
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
      setPreviewUrl(null)
      setAvatarFile(null)
      setDeleteStep('idle')
      router.refresh()
    } catch (error: any) {
      console.error(error)
    } finally {
      setDeleteLoading(false)
    }
  }

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
    } catch (error: any) {
      alert("Errore nel salvataggio")
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
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-md bg-black/60 overflow-y-auto">
          <div className="bg-[#16161e] border border-white/10 w-full max-w-xl rounded-[3rem] p-8 shadow-2xl my-auto relative">
            
            {/* Header Pulito */}
            <div className="flex justify-between items-center mb-10">
              <div className="flex flex-col">
                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                  Modifica Profilo
                </h3>
                <span className="text-[10px] text-[#7c6af7] font-bold uppercase tracking-[0.2em]">Personalizza la tua scheda</span>
              </div>
              <button onClick={() => { setIsOpen(false); setDeleteStep('idle'); }} className="p-2 text-gray-500 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-8">
              
              {/* Avatar Section */}
              <div className="flex flex-col items-center gap-6">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className="w-28 h-28 rounded-[2.5rem] bg-[#0a0a0f] border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden group-hover:border-[#7c6af7] transition-all duration-300">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={32} className="text-gray-400" />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-[#7c6af7]/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem]">
                    <Upload size={20} className="text-white" />
                  </div>
                </div>

                {/* Delete Photo UI */}
                {(previewUrl || avatarFile) && (
                  <div className="h-8">
                    {deleteStep === 'idle' ? (
                      <button
                        type="button"
                        onClick={() => setDeleteStep('confirm')}
                        className="text-[10px] font-black text-gray-500 hover:text-red-500 uppercase tracking-widest transition-all"
                      >
                        Rimuovi foto attuale
                      </button>
                    ) : (
                      <div className="flex items-center gap-4 animate-in fade-in zoom-in duration-200">
                        <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Sicuro di volerla eliminare?</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleDeleteAvatar} className="text-[10px] font-black text-white bg-red-500 px-3 py-1 rounded-lg uppercase">Sì</button>
                          <button type="button" onClick={() => setDeleteStep('idle')} className="text-[10px] font-black text-gray-400 uppercase border border-white/5 px-3 py-1 rounded-lg">No</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) { setAvatarFile(e.target.files[0]); setPreviewUrl(URL.createObjectURL(e.target.files[0])); }}} className="hidden" accept="image/*" />
              </div>

              {/* Input Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Gamer Tag</label>
                  <input 
                    type="text" 
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-1 focus:ring-[#7c6af7] outline-none font-bold placeholder:text-gray-700"
                    placeholder="Il tuo tag..."
                    required
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Twitch</label>
                  <input 
                    type="text" 
                    value={formData.twitch_url}
                    onChange={(e) => setFormData({...formData, twitch_url: e.target.value})}
                    className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-1 focus:ring-[#6441a5] outline-none placeholder:text-gray-700"
                    placeholder="twitch.tv/username"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Bio</label>
                <textarea 
                  value={formData.bio}
                  onChange={(e) => setFormData({...formData, bio: e.target.value})}
                  rows={3}
                  className="w-full bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 text-white focus:ring-1 focus:ring-[#7c6af7] outline-none resize-none placeholder:text-gray-700"
                  placeholder="Racconta chi sei..."
                />
              </div>

              {/* Pulsante di Salvataggio */}
              <button 
                disabled={loading || deleteLoading}
                className="w-full bg-[#7c6af7] text-white font-black py-5 rounded-[2rem] uppercase tracking-tighter flex items-center justify-center gap-3 hover:bg-[#6b5ae0] transition-all disabled:opacity-50 shadow-xl shadow-[#7c6af7]/10"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : "Salva Modifiche"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}