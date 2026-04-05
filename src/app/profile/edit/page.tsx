// DESTINAZIONE: src/app/profile/edit/page.tsx

'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, Upload, Loader2 } from 'lucide-react'

// ── Costanti di validazione (allineate ai CHECK del DB) ──────────────────────
const USERNAME_MAX = 30
const USERNAME_MIN = 3
const BIO_MAX = 500
const USERNAME_REGEX = /^[a-z0-9_]+$/

function validateUsername(value: string): string | null {
  if (value.length < USERNAME_MIN) return `Username troppo corto (minimo ${USERNAME_MIN} caratteri)`
  if (value.length > USERNAME_MAX) return `Username troppo lungo (massimo ${USERNAME_MAX} caratteri)`
  if (!USERNAME_REGEX.test(value)) return 'Solo lettere minuscole, numeri e underscore'
  return null
}

function validateBio(value: string): string | null {
  if (value.length > BIO_MAX) return `Bio troppo lunga (massimo ${BIO_MAX} caratteri)`
  return null
}

export default function EditProfilePage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [profile, setProfile] = useState<any>(null)
  const [formData, setFormData] = useState({ display_name: '', username: '', bio: '' })
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; bio?: string }>({})
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        setFormData({
          display_name: profileData.display_name || '',
          username: profileData.username || '',
          bio: profileData.bio || '',
        })
        setAvatarPreview(profileData.avatar_url || null)
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleUsernameChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setFormData(prev => ({ ...prev, username: clean }))
    const err = validateUsername(clean)
    setFieldErrors(prev => ({ ...prev, username: err || undefined }))
  }

  const handleBioChange = (value: string) => {
    setFormData(prev => ({ ...prev, bio: value }))
    const err = validateBio(value)
    setFieldErrors(prev => ({ ...prev, bio: err || undefined }))
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Immagine troppo grande (massimo 5MB)')
      setMessageType('error')
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const removeAvatar = async () => {
    if (!profile) return
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    setAvatarPreview(null)
    setAvatarFile(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return

    // Validazione finale prima di salvare
    const usernameErr = validateUsername(formData.username)
    const bioErr = validateBio(formData.bio)
    if (usernameErr || bioErr) {
      setFieldErrors({ username: usernameErr || undefined, bio: bioErr || undefined })
      return
    }

    setSaving(true)
    setMessage('')

    try {
      let avatarUrl = profile.avatar_url

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop()
        const path = `public/${profile.id}-${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }

      const { error } = await supabase.from('profiles').update({
        display_name: formData.display_name.trim().slice(0, 50),
        username: formData.username,
        bio: formData.bio.trim(),
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', profile.id)

      if (error) throw error

      setMessage('Profilo aggiornato con successo!')
      setMessageType('success')
      setTimeout(() => router.push(`/profile/${formData.username}`), 1000)

    } catch (err: any) {
      setMessage(err.message?.includes('profiles_username')
        ? 'Username già in uso, scegline un altro'
        : 'Errore nel salvataggio. Riprova.')
      setMessageType('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <Loader2 size={40} className="animate-spin text-violet-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Modifica Profilo</h1>
          <Link
            href={`/profile/${profile?.username || 'me'}`}
            className="text-zinc-400 hover:text-white text-sm transition"
          >
            Torna al profilo
          </Link>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-8 gap-4">
          <div
            className="w-28 h-28 rounded-full border-4 border-zinc-700 overflow-hidden bg-zinc-800 flex items-center justify-center cursor-pointer group relative"
            onClick={() => fileRef.current?.click()}
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <Camera size={32} className="text-zinc-500" />
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
              <Upload size={24} className="text-white" />
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm text-violet-400 hover:text-violet-300 transition"
            >
              Cambia foto
            </button>
            {avatarPreview && (
              <button
                type="button"
                onClick={removeAvatar}
                className="text-sm text-red-400 hover:text-red-300 transition"
              >
                Rimuovi
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">

          {/* Nome visualizzato */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Nome visualizzato</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              maxLength={50}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-3 focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {/* Username */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-zinc-400">Username</label>
              <span className={`text-xs ${formData.username.length > USERNAME_MAX - 5 ? 'text-amber-400' : 'text-zinc-600'}`}>
                {formData.username.length}/{USERNAME_MAX}
              </span>
            </div>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              maxLength={USERNAME_MAX}
              required
              className={`w-full bg-zinc-800 border rounded-2xl px-5 py-3 focus:outline-none transition ${
                fieldErrors.username ? 'border-red-500 focus:border-red-500' : 'border-zinc-700 focus:border-violet-500'
              }`}
            />
            {fieldErrors.username ? (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.username}</p>
            ) : (
              <p className="text-xs text-zinc-600 mt-1">Solo lettere minuscole, numeri e underscore</p>
            )}
          </div>

          {/* Bio */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-zinc-400">Bio</label>
              <span className={`text-xs ${formData.bio.length > BIO_MAX - 50 ? 'text-amber-400' : 'text-zinc-600'}`}>
                {formData.bio.length}/{BIO_MAX}
              </span>
            </div>
            <textarea
              value={formData.bio}
              onChange={(e) => handleBioChange(e.target.value)}
              rows={3}
              maxLength={BIO_MAX}
              placeholder="Di cosa sei fan?"
              className={`w-full bg-zinc-800 border rounded-2xl px-5 py-3 focus:outline-none transition resize-none ${
                fieldErrors.bio ? 'border-red-500 focus:border-red-500' : 'border-zinc-700 focus:border-violet-500'
              }`}
            />
            {fieldErrors.bio && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.bio}</p>
            )}
          </div>

          {/* Messaggio feedback */}
          {message && (
            <div className={`p-4 rounded-2xl text-sm text-center ${
              messageType === 'success'
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                : 'bg-red-950 border border-red-800 text-red-400'
            }`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !!fieldErrors.username || !!fieldErrors.bio}
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 size={18} className="animate-spin" /> Salvataggio...</>
              : 'Salva modifiche'
            }
          </button>
        </form>
      </div>
    </div>
  )
}