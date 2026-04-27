'use client'

import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, Sparkles, Download, User, AtSign, FileText, Heart, ChevronRight } from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { Avatar } from '@/components/ui/Avatar'
import { AniListImport } from '@/components/import/AniListImport'
import Link from 'next/link'

const ALL_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery',
  'Romance', 'Sci-Fi', 'Thriller', 'RPG', 'Strategy', 'Simulation', 'Psychological',
]

const USERNAME_MAX = 30
const USERNAME_MIN = 3
const BIO_MAX = 500
const USERNAME_REGEX = /^[a-z0-9_]+$/

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

  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [message, setMessage]             = useState('')
  const [messageType, setMessageType]     = useState<'success' | 'error'>('success')
  const [profile, setProfile]             = useState<any>(null)
  const [formData, setFormData]           = useState<{ display_name: string; username: string; bio: string }>({ display_name: '', username: '', bio: '' })
  const [fieldErrors, setFieldErrors]     = useState<{ username?: string; bio?: string }>({})
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile]       = useState<File | null>(null)
  const [likedGenres, setLikedGenres]     = useState<string[]>([])
  const [dislikedGenres, setDislikedGenres] = useState<string[]>([])
  // explicit type used by filter callbacks below
  const [exporting, setExporting]         = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setMessage(pe.imageTooLarge)
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

  const handleSave = async (e: FormEvent) => {
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

      if (avatarFile) {
        setUploadingAvatar(true)
        const formDataUpload = new FormData()
        formDataUpload.append('avatar', avatarFile)
        const uploadRes = await fetch('/api/avatar/upload', { method: 'POST', body: formDataUpload })
        setUploadingAvatar(false)
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}))
          throw new Error(err.error || 'Errore upload avatar')
        }
        const { url } = await uploadRes.json()
        avatarUrl = url
      }

      const { error } = await supabase.from('profiles').update({
        display_name: formData.display_name.trim().slice(0, 50),
        username: formData.username,
        bio: formData.bio.trim(),
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', profile.id)

      if (error) throw error

      const inSet = (set: string[]) => (g: string) => set.includes(g)
      await supabase.from('user_preferences').upsert({
        user_id: profile.id,
        fav_game_genres:  likedGenres.filter(inSet(['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Horror', 'Thriller', 'Mystery', 'Psychological'])),
        fav_anime_genres: likedGenres.filter(inSet(['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Psychological'])),
        fav_movie_genres: likedGenres.filter(inSet(['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller'])),
        fav_tv_genres:    likedGenres.filter(inSet(['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller'])),
        fav_manga_genres: likedGenres.filter(inSet(['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Psychological'])),
        disliked_genres: dislikedGenres,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-violet-500" />
      </div>
    )
  }

  const isBusy = saving || uploadingAvatar

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <form onSubmit={handleSave}>
        <div className="max-w-3xl mx-auto px-4 md:px-6 pt-3 md:pt-10 pb-28 space-y-6">

          {/* ── Avatar ── */}
          <section>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col items-center gap-4">
              <div
                className="relative w-24 h-24 rounded-full overflow-hidden ring-4 ring-zinc-700 cursor-pointer group"
                onClick={() => fileRef.current?.click()}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <Avatar
                    src={null}
                    username={formData.username || profile?.username || 'u'}
                    displayName={formData.display_name}
                    size={96}
                    className="w-full h-full"
                  />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                  {uploadingAvatar
                    ? <Loader2 size={22} className="text-white animate-spin" />
                    : <Upload size={22} className="text-white" />
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
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-sm text-violet-400 hover:text-violet-300 font-medium transition"
                >
                  {pe.changePhoto}
                </button>
                {avatarPreview && (
                  <>
                    <span className="w-px h-4 bg-zinc-700" />
                    <button
                      type="button"
                      onClick={removeAvatar}
                      className="text-sm text-red-400 hover:text-red-300 transition"
                    >
                      {pe.removePhoto}
                    </button>
                  </>
                )}
              </div>
              <p className="text-[11px] text-zinc-600">JPEG, PNG, GIF o WebP · max 5MB</p>
            </div>
          </section>

          {/* ── Informazioni profilo ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <User size={15} className="text-zinc-500" />
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Informazioni</h2>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800">

              {/* Display name */}
              <div className="px-5 py-4">
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-widest mb-2">
                  {pe.displayName}
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  maxLength={50}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition"
                />
              </div>

              {/* Username */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                    <AtSign size={13} /> {pe.username}
                  </label>
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
                  className={`w-full bg-zinc-800 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition ${
                    fieldErrors.username ? 'border-red-500 focus:border-red-500' : 'border-zinc-700 focus:border-violet-500'
                  }`}
                />
                {fieldErrors.username
                  ? <p className="text-xs text-red-400 mt-1.5">{fieldErrors.username}</p>
                  : <p className="text-xs text-zinc-600 mt-1.5">{pe.usernameHint}</p>
                }
              </div>

              {/* Bio */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText size={13} /> {pe.bio}
                  </label>
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
                  className={`w-full bg-zinc-800 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition resize-none ${
                    fieldErrors.bio ? 'border-red-500 focus:border-red-500' : 'border-zinc-700 focus:border-violet-500'
                  }`}
                />
                {fieldErrors.bio && (
                  <p className="text-xs text-red-400 mt-1.5">{fieldErrors.bio}</p>
                )}
              </div>
            </div>
          </section>

          {/* ── Gusti & Preferenze ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-zinc-500" />
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Gusti & Preferenze</h2>
              <Link href="/for-you" className="ml-auto text-xs text-violet-400 hover:text-violet-300 transition flex items-center gap-0.5">
                Personalizza tutto <ChevronRight size={13} />
              </Link>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800">
              <div className="p-4">
                <p className="text-xs font-medium text-zinc-400 mb-3">Generi che ami</p>
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
              <div className="p-4">
                <p className="text-xs font-medium text-zinc-400 mb-3">Generi che non ti piacciono</p>
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
          </section>

          {/* ── Feedback salvataggio ── */}
          {message && (
            <div className={`p-4 rounded-2xl text-sm text-center ${
              messageType === 'success'
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                : 'bg-red-950 border border-red-800 text-red-400'
            }`}>
              {message}
            </div>
          )}

          {/* ── Salva ── */}
          <button
            type="submit"
            disabled={isBusy || !!fieldErrors.username || !!fieldErrors.bio}
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isBusy
              ? <><Loader2 size={16} className="animate-spin" /> {uploadingAvatar ? 'Caricamento avatar...' : pe.saving}</>
              : pe.save
            }
          </button>

          {/* ── Importa lista AniList ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Download size={15} className="text-zinc-500" />
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Importa da AniList</h2>
            </div>
            <AniListImport />
          </section>

          {/* ── Esporta dati (GDPR) ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Heart size={15} className="text-zinc-500" />
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">I tuoi dati</h2>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4">
                <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                  Puoi scaricare una copia di tutti i tuoi dati in formato JSON.
                </p>
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm font-medium text-zinc-300 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {exporting
                    ? <><Loader2 size={15} className="animate-spin" /> Esportazione in corso...</>
                    : <><Download size={15} /> Esporta i tuoi dati</>}
                </button>
              </div>
            </div>
          </section>

        </div>
      </form>
    </div>
  )
}
