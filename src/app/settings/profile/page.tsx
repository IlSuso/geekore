// DESTINAZIONE: src/app/profile/edit/page.tsx
// S2: L'upload avatar ora passa per /api/avatar/upload che valida i magic bytes
//     server-side. Il client non può più falsificare il tipo di file.

'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, Upload, Loader2, Sparkles, Download } from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { Avatar } from '@/components/ui/Avatar'
import { useCsrf } from '@/hooks/useCsrf'

const ALL_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery',
  'Romance', 'Sci-Fi', 'Thriller', 'RPG', 'Strategy', 'Simulation', 'Psychological',
]

const USERNAME_MAX = 30
const USERNAME_MIN = 3
const BIO_MAX = 500
const USERNAME_REGEX = /^[a-z0-9_]+$/

// S6: blocca look-alike unicode
function hasUnicodeLookalike(value: string): boolean {
  const normalized = value.normalize('NFKD')
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.codePointAt(i) ?? 0
    if (
      !(code >= 97 && code <= 122) &&
      !(code >= 48 && code <= 57) &&
      code !== 95
    ) return true
  }
  return false
}

export default function EditProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  const { csrfFetch } = useCsrf()
  const { t } = useLocale()
  const pe = t.profileEdit

  const validateUsername = (value: string): string | null => {
    if (value.length < USERNAME_MIN) return pe.usernameTooShort(USERNAME_MIN)
    if (value.length > USERNAME_MAX) return pe.usernameTooLong(USERNAME_MAX)
    if (!USERNAME_REGEX.test(value)) return pe.usernameInvalid
    if (hasUnicodeLookalike(value)) return 'Username contiene caratteri non consentiti'
    return null
  }

  const validateBio = (value: string): string | null => {
    if (value.length > BIO_MAX) return pe.bioTooLong(BIO_MAX)
    return null
  }

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [profile, setProfile] = useState<any>(null)
  const [formData, setFormData] = useState({ display_name: '', username: '', bio: '' })
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; bio?: string }>({})
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [likedGenres, setLikedGenres] = useState<string[]>([])
  const [dislikedGenres, setDislikedGenres] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)

  const handleExportData = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/user/export')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Errore durante l\'esportazione')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `geekore-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

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

      const { data: prefsData } = await supabase
        .from('user_preferences')
        .select('fav_game_genres, fav_anime_genres, fav_movie_genres, disliked_genres')
        .eq('user_id', user.id)
        .single()

      if (prefsData) {
        const liked = [...new Set([
          ...(prefsData.fav_game_genres || []),
          ...(prefsData.fav_anime_genres || []),
          ...(prefsData.fav_movie_genres || []),
        ])]
        setLikedGenres(liked)
        setDislikedGenres(prefsData.disliked_genres || [])
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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Controllo dimensione client-side (feedback immediato)
    if (file.size > 5 * 1024 * 1024) {
      setMessage(pe.imageTooLarge)
      setMessageType('error')
      return
    }

    // Preview immediata
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const removeAvatar = async () => {
    if (!profile) return
    const res = await csrfFetch('/api/profile/update', {
      method: 'PATCH',
      body: JSON.stringify({ avatar_url: null }),
    }).catch(() => null)
    if (res?.ok) {
      setAvatarPreview(null)
      setAvatarFile(null)
      setProfile((prev: any) => prev ? { ...prev, avatar_url: null } : prev)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return

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

      // S2: Upload via API route con validazione magic bytes server-side
      if (avatarFile) {
        setUploadingAvatar(true)
        const formDataUpload = new FormData()
        formDataUpload.append('avatar', avatarFile)

        const uploadRes = await fetch('/api/avatar/upload', {
          method: 'POST',
          body: formDataUpload,
        })

        setUploadingAvatar(false)

        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}))
          throw new Error(err.error || 'Errore upload avatar')
        }

        const { url } = await uploadRes.json()
        avatarUrl = url
      }

      const profileRes = await csrfFetch('/api/profile/update', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: formData.display_name.trim().slice(0, 50),
          username: formData.username,
          bio: formData.bio.trim(),
          avatar_url: avatarUrl,
        }),
      })

      if (!profileRes.ok) {
        const err = await profileRes.json().catch(() => ({}))
        throw new Error(err.error || 'Errore salvataggio profilo')
      }

      await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fav_game_genres: likedGenres.filter(g => ['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Horror', 'Thriller', 'Mystery', 'Psychological'].includes(g)),
          fav_anime_genres: likedGenres.filter(g => ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Psychological'].includes(g)),
          fav_movie_genres: likedGenres.filter(g => ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller'].includes(g)),
          fav_tv_genres: likedGenres.filter(g => ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller'].includes(g)),
          fav_manga_genres: likedGenres.filter(g => ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Psychological'].includes(g)),
          disliked_genres: dislikedGenres,
        }),
      })

      setMessage(pe.saved)
      setMessageType('success')
      setTimeout(() => router.push(`/profile/${formData.username}`), 1000)

    } catch (err: any) {
      setMessage(
        err.message?.includes('profiles_username') ? pe.usernameTaken :
        err.message?.includes('Formato non supportato') ? err.message :
        err.message?.includes('magic') ? 'Formato file non valido.' :
        pe.saveError
      )
      setMessageType('error')
    } finally {
      setSaving(false)
      setUploadingAvatar(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <Loader2 size={40} className="animate-spin" style={{ color: '#E6FF3D' }} />
      </div>
    )
  }

  const isBusy = saving || uploadingAvatar

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">{pe.title}</h1>
          <Link
            href={`/profile/${profile?.username || 'me'}`}
            className="text-zinc-400 hover:text-white text-sm transition"
          >
            {pe.backToProfile}
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
              <Avatar
                src={null}
                username={formData.username || profile?.username || 'u'}
                displayName={formData.display_name}
                size={112}
              />
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
              {uploadingAvatar
                ? <Loader2 size={24} className="text-white animate-spin" />
                : <Upload size={24} className="text-white" />
              }
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm text-violet-400 hover:text-violet-300 transition"
            >
              {pe.changePhoto}
            </button>

            {avatarPreview && (
              <button
                type="button"
                onClick={removeAvatar}
                className="text-sm text-red-400 hover:text-red-300 transition"
              >
                {pe.removePhoto}
              </button>
            )}
          </div>


          <p className="text-[10px] text-zinc-600">JPEG, PNG, GIF o WebP · max 5MB</p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">

          {/* Display name */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">{pe.displayName}</label>
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
              <label className="block text-sm text-zinc-400">{pe.username}</label>
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
              <p className="text-xs text-zinc-600 mt-1">{pe.usernameHint}</p>
            )}
          </div>

          {/* Bio */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-zinc-400">{pe.bio}</label>
              <span className={`text-xs ${formData.bio.length > BIO_MAX - 50 ? 'text-amber-400' : 'text-zinc-600'}`}>
                {formData.bio.length}/{BIO_MAX}
              </span>
            </div>
            <textarea
              value={formData.bio}
              onChange={(e) => handleBioChange(e.target.value)}
              rows={3}
              maxLength={BIO_MAX}
              placeholder={pe.bioPlaceholder}
              className={`w-full bg-zinc-800 border rounded-2xl px-5 py-3 focus:outline-none transition resize-none ${
                fieldErrors.bio ? 'border-red-500 focus:border-red-500' : 'border-zinc-700 focus:border-violet-500'
              }`}
            />
            {fieldErrors.bio && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.bio}</p>
            )}
          </div>

          {/* Gusti & Preferenze */}
          <div className="pt-4 border-t border-zinc-800">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-violet-400" />
              <span className="text-sm font-semibold text-white">Gusti & Preferenze</span>
              <Link href="/for-you" className="ml-auto text-xs text-violet-400 hover:text-violet-300 transition">
                Personalizza tutto →
              </Link>
            </div>
            <div className="mb-4">
              <p className="text-xs text-zinc-400 mb-2">Generi che ami</p>
              <div className="flex flex-wrap gap-2">
                {ALL_GENRES.map(genre => (
                  <button key={genre} type="button"
                    onClick={() => setLikedGenres(prev =>
                      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
                    )}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      likedGenres.includes(genre)
                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >{genre}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-400 mb-2">Generi che non ti piacciono</p>
              <div className="flex flex-wrap gap-2">
                {ALL_GENRES.map(genre => (
                  <button key={genre} type="button"
                    onClick={() => setDislikedGenres(prev =>
                      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
                    )}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      dislikedGenres.includes(genre)
                        ? 'bg-red-500/20 border-red-500/50 text-red-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >{genre}</button>
                ))}
              </div>
            </div>
          </div>

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
            disabled={isBusy || !!fieldErrors.username || !!fieldErrors.bio}
            className="w-full py-4 rounded-2xl font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: '#E6FF3D', color: '#0B0B0F' }}
          >
            {isBusy
              ? <><Loader2 size={18} className="animate-spin" /> {uploadingAvatar ? 'Caricamento avatar...' : pe.saving}</>
              : pe.save
            }
          </button>

          {/* 6.4 — Export dati (GDPR) */}
          <div className="pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 mb-3">Puoi scaricare una copia di tutti i tuoi dati in formato JSON.</p>
            <button
              type="button"
              onClick={handleExportData}
              disabled={exporting}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl text-sm font-medium text-zinc-300 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting
                ? <><Loader2 size={16} className="animate-spin" /> Esportazione in corso...</>
                : <><Download size={16} /> Esporta i tuoi dati</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
