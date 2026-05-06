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
  const { t, locale } = useLocale()
  const pe = t.profileEdit
  const ui = locale === 'it' ? {
    title: 'Modifica profilo', subtitle: 'Aggiorna identità, avatar e pochi segnali di gusto essenziali.', invalidFile: 'Formato file non valido.', avatarHint: 'JPEG, PNG, GIF o WebP · max 5MB. Usa un avatar leggibile anche in piccolo.', dataSecurity: 'Dati e sicurezza', exporting: 'Esportazione...', exportData: 'Esporta dati', exportHint: 'Scarica una copia JSON dei dati del tuo account.', publicIdentity: 'Identità pubblica', publicIdentityHint: 'Nome, username e bio visibili nel profilo.', quickTaste: 'Gusti rapidi', likedExcluded: (liked: number, disliked: number) => `${liked} amati · ${disliked} esclusi`, like: 'Ami', avoid: 'Eviti', uploadingAvatar: 'Caricamento avatar...', account: 'Account', tasteDna: 'Taste DNA →', usernameUnsupported: 'Username contiene caratteri non consentiti', exportError: 'Errore durante l\'esportazione'
  } : {
    title: 'Edit profile', subtitle: 'Update identity, avatar, and a few essential taste signals.', invalidFile: 'Invalid file format.', avatarHint: 'JPEG, PNG, GIF, or WebP · max 5MB. Use an avatar that stays readable when small.', dataSecurity: 'Data and security', exporting: 'Exporting...', exportData: 'Export data', exportHint: 'Download a JSON copy of your account data.', publicIdentity: 'Public identity', publicIdentityHint: 'Name, username, and bio visible on your profile.', quickTaste: 'Quick taste', likedExcluded: (liked: number, disliked: number) => `${liked} liked · ${disliked} excluded`, like: 'Like', avoid: 'Avoid', uploadingAvatar: 'Uploading avatar...', account: 'Account', tasteDna: 'Taste DNA →', usernameUnsupported: 'Username contains unsupported characters', exportError: 'Could not export data'
  }

  const validateUsername = (value: string): string | null => {
    if (value.length < USERNAME_MIN) return pe.usernameTooShort(USERNAME_MIN)
    if (value.length > USERNAME_MAX) return pe.usernameTooLong(USERNAME_MAX)
    if (!USERNAME_REGEX.test(value)) return pe.usernameInvalid
    if (hasUnicodeLookalike(value)) return ui.usernameUnsupported
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
        alert(err.error || ui.exportError)
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
        err.message?.includes('magic') ? ui.invalidFile :
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
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center text-white">
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  const isBusy = saving || uploadingAvatar
  const likedCount = likedGenres.length
  const dislikedCount = dislikedGenres.length

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_30%_0%,rgba(230,255,61,0.06),transparent_34%),var(--bg-primary)] px-4 py-6 text-white md:px-8 md:py-10">
      <div className="mx-auto w-full max-w-screen-lg">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="gk-section-eyebrow mb-2"><Sparkles size={12} /> {ui.account}</p>
            <h1 className="font-display text-[34px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)] md:text-[42px]">{ui.title}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">{ui.subtitle}</p>
          </div>
          <Link
            href={`/profile/${profile?.username || 'me'}`}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-black text-[var(--text-secondary)] transition-colors hover:text-white"
          >
            {pe.backToProfile}
          </Link>
        </div>

        {message && (
          <div className={`mb-5 rounded-[22px] border px-4 py-3 text-sm font-bold ${
            messageType === 'success'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/25 bg-red-500/10 text-red-300'
          }`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <div className="rounded-[30px] border border-[var(--border)] bg-[var(--bg-card)] p-5 ring-1 ring-white/5">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-secondary)] ring-1 ring-white/5"
                  onClick={() => fileRef.current?.click()}
                  aria-label={locale === 'it' ? 'Cambia avatar' : 'Change avatar'}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt={locale === 'it' ? 'Avatar profilo' : 'Profile avatar'} className="h-full w-full object-cover" />
                  ) : (
                    <Avatar
                      src={null}
                      username={formData.username || profile?.username || 'u'}
                      displayName={formData.display_name}
                      size={96}
                    />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingAvatar
                      ? <Loader2 size={22} className="animate-spin text-white" />
                      : <Upload size={22} className="text-white" />
                    }
                  </span>
                </button>
                <div className="min-w-0">
                  <p className="line-clamp-1 font-display text-[24px] font-black leading-none tracking-[-0.04em] text-[var(--text-primary)]">
                    {formData.display_name || profile?.display_name || 'Profilo'}
                  </p>
                  <p className="mt-1 truncate font-mono-data text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">@{formData.username || profile?.username}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="rounded-full border border-[rgba(230,255,61,0.28)] bg-[rgba(230,255,61,0.08)] px-3 py-1.5 text-xs font-black text-[var(--accent)] transition-opacity hover:opacity-80"
                    >
                      {pe.changePhoto}
                    </button>
                    {avatarPreview && (
                      <button type="button" onClick={removeAvatar} className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 transition-opacity hover:opacity-80">
                        {pe.removePhoto}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <p className="mt-4 text-[11px] leading-5 text-[var(--text-muted)]">{ui.avatarHint}</p>
            </div>

            <div className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/70 p-4 ring-1 ring-white/5">
              <p className="gk-label mb-3">{ui.dataSecurity}</p>
              <button
                type="button"
                onClick={handleExportData}
                disabled={exporting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm font-black text-[var(--text-secondary)] transition-colors hover:text-white disabled:opacity-50"
              >
                {exporting
                  ? <><Loader2 size={16} className="animate-spin" /> {ui.exporting}</>
                  : <><Download size={16} /> {ui.exportData}</>}
              </button>
              <p className="mt-3 text-[11px] leading-5 text-[var(--text-muted)]">{ui.exportHint}</p>
            </div>
          </aside>

          <section className="rounded-[30px] border border-[var(--border)] bg-[var(--bg-card)] p-5 ring-1 ring-white/5 md:p-6">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
              <div>
                <p className="gk-label">{ui.publicIdentity}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{ui.publicIdentityHint}</p>
              </div>
              <button
                type="submit"
                disabled={isBusy || !!fieldErrors.username || !!fieldErrors.bio}
                className="hidden h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02] disabled:opacity-50 md:inline-flex"
              >
                {isBusy ? <><Loader2 size={17} className="animate-spin" /> {uploadingAvatar ? ui.uploadingAvatar : pe.saving}</> : pe.save}
              </button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--text-secondary)]">{pe.displayName}</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  maxLength={50}
                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 text-sm font-bold text-[var(--text-primary)] outline-none transition focus:border-[rgba(230,255,61,0.45)]"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-bold text-[var(--text-secondary)]">{pe.username}</label>
                  <span className={`font-mono-data text-[10px] font-bold ${formData.username.length > USERNAME_MAX - 5 ? 'text-amber-300' : 'text-[var(--text-muted)]'}`}>
                    {formData.username.length}/{USERNAME_MAX}
                  </span>
                </div>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  maxLength={USERNAME_MAX}
                  required
                  className={`h-12 w-full rounded-2xl border bg-[var(--bg-secondary)] px-4 text-sm font-bold text-[var(--text-primary)] outline-none transition ${
                    fieldErrors.username ? 'border-red-500 focus:border-red-500' : 'border-[var(--border)] focus:border-[rgba(230,255,61,0.45)]'
                  }`}
                />
                {fieldErrors.username ? (
                  <p className="mt-1 text-xs text-red-300">{fieldErrors.username}</p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{pe.usernameHint}</p>
                )}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-bold text-[var(--text-secondary)]">{pe.bio}</label>
                <span className={`font-mono-data text-[10px] font-bold ${formData.bio.length > BIO_MAX - 50 ? 'text-amber-300' : 'text-[var(--text-muted)]'}`}>
                  {formData.bio.length}/{BIO_MAX}
                </span>
              </div>
              <textarea
                value={formData.bio}
                onChange={(e) => handleBioChange(e.target.value)}
                rows={4}
                maxLength={BIO_MAX}
                placeholder={pe.bioPlaceholder}
                className={`w-full resize-none rounded-2xl border bg-[var(--bg-secondary)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition ${
                  fieldErrors.bio ? 'border-red-500 focus:border-red-500' : 'border-[var(--border)] focus:border-[rgba(230,255,61,0.45)]'
                }`}
              />
              {fieldErrors.bio && <p className="mt-1 text-xs text-red-300">{fieldErrors.bio}</p>}
            </div>

            <div className="mt-6 rounded-[24px] border border-[var(--border-subtle)] bg-black/16 p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[var(--accent)]" />
                  <div>
                    <p className="text-sm font-black text-[var(--text-primary)]">{ui.quickTaste}</p>
                    <p className="text-xs text-[var(--text-muted)]">{ui.likedExcluded(likedCount, dislikedCount)}</p>
                  </div>
                </div>
                <Link href="/for-you" className="inline-flex h-8 items-center justify-center rounded-full border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.07)] px-3 text-xs font-black text-[var(--accent)] transition-opacity hover:opacity-80">{ui.tasteDna}</Link>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="gk-label">{ui.like}</p>
                    <span className="font-mono-data text-[10px] font-black text-[var(--accent)]">{likedCount}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_GENRES.map(genre => (
                      <button key={genre} type="button"
                        onClick={() => setLikedGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre])}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                          likedGenres.includes(genre)
                            ? 'border-[rgba(230,255,61,0.45)] bg-[rgba(230,255,61,0.12)] text-[var(--accent)]'
                            : 'border-[var(--border)] bg-black/14 text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >{genre}</button>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="gk-label">{ui.avoid}</p>
                    <span className="font-mono-data text-[10px] font-black text-red-300">{dislikedCount}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_GENRES.map(genre => (
                      <button key={genre} type="button"
                        onClick={() => setDislikedGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre])}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                          dislikedGenres.includes(genre)
                            ? 'border-red-500/45 bg-red-500/12 text-red-300'
                            : 'border-[var(--border)] bg-black/14 text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >{genre}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy || !!fieldErrors.username || !!fieldErrors.bio}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.01] disabled:opacity-50 md:hidden"
            >
              {isBusy
                ? <><Loader2 size={18} className="animate-spin" /> {uploadingAvatar ? ui.uploadingAvatar : pe.saving}</>
                : pe.save
              }
            </button>
          </section>
        </form>
      </div>
    </div>
  )
}
