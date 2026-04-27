'use client'

import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Upload } from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { Avatar } from '@/components/ui/Avatar'
import { SteamIcon } from '@/components/icons/SteamIcon'

interface Profile {
  id: string
  username?: string | null
  display_name?: string | null
  bio?: string | null
  avatar_url?: string | null
}

interface SteamAccount {
  steam_id64: string
  personaname?: string | null
  avatar?: string | null
}

const USERNAME_MAX = 30
const USERNAME_MIN = 3
const BIO_MAX = 500
const USERNAME_REGEX = /^[a-z0-9_]+$/

function hasUnicodeLookalike(value: string): boolean {
  const normalized = value.normalize('NFKD')
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.codePointAt(i) ?? 0
    if (!(code >= 97 && code <= 122) && !(code >= 48 && code <= 57) && code !== 95) return true
  }
  return false
}

export default function EditProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  const { t } = useLocale()
  const pe = t.profileEdit
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [message, setMessage]         = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  const [profile, setProfile]         = useState<Profile | null>(null)
  const [steamAccount, setSteamAccount] = useState<SteamAccount | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername]       = useState('')
  const [bio, setBio]                 = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [bioError, setBioError]       = useState<string | null>(null)

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile]   = useState<File | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [profileRes, steamRes] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, bio, avatar_url').eq('id', user.id).single(),
        supabase.from('steam_accounts').select('steam_id64, personaname, avatar').eq('user_id', user.id).maybeSingle(),
      ])

      if (profileRes.data) {
        setProfile(profileRes.data)
        setDisplayName(profileRes.data.display_name || '')
        setUsername(profileRes.data.username || '')
        setBio(profileRes.data.bio || '')
        setAvatarPreview(profileRes.data.avatar_url || null)
      }

      if (steamRes.data) setSteamAccount(steamRes.data)

      setLoading(false)
    }
    load()
  }, [])

  const validateUsername = (v: string): string | null => {
    if (v.length < USERNAME_MIN) return pe.usernameTooShort(USERNAME_MIN)
    if (v.length > USERNAME_MAX) return pe.usernameTooLong(USERNAME_MAX)
    if (!USERNAME_REGEX.test(v)) return pe.usernameInvalid
    if (hasUnicodeLookalike(v)) return 'Username contiene caratteri non consentiti'
    return null
  }

  const handleUsernameChange = (v: string) => {
    const clean = v.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(clean)
    setUsernameError(validateUsername(clean))
  }

  const handleBioChange = (v: string) => {
    setBio(v)
    setBioError(v.length > BIO_MAX ? pe.bioTooLong(BIO_MAX) : null)
  }

  // ── Foto profilo ──────────────────────────────────────────────────────────────

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setMessage(pe.imageTooLarge); setMessageType('error'); return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleRemove = async () => {
    if (!profile) return
    setAvatarFile(null)
    setAvatarPreview(null)
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
  }

  // ── Steam ─────────────────────────────────────────────────────────────────────

  const handleDisconnect = async () => {
    if (!profile || !steamAccount) return
    setDisconnecting(true)
    await supabase.from('steam_accounts').delete().eq('user_id', profile.id)
    setSteamAccount(null)
    setDisconnecting(false)
  }

  // ── Salva ─────────────────────────────────────────────────────────────────────

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return

    const uErr = validateUsername(username)
    if (uErr || usernameError || bioError) {
      if (uErr) setUsernameError(uErr)
      return
    }

    setSaving(true)
    setMessage('')

    try {
      let avatarUrl = profile.avatar_url ?? null

      if (avatarFile) {
        setUploading(true)
        const fd = new FormData()
        fd.append('avatar', avatarFile)
        const res = await fetch('/api/avatar/upload', { method: 'POST', body: fd })
        setUploading(false)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Errore upload avatar')
        }
        avatarUrl = (await res.json()).url
      }

      const { error } = await supabase.from('profiles').update({
        display_name: displayName.trim().slice(0, 50),
        username,
        bio: bio.trim(),
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', profile.id)

      if (error) throw error

      setMessage(pe.saved)
      setMessageType('success')
      setTimeout(() => router.push(`/profile/${username}`), 1000)

    } catch (err: any) {
      setMessage(
        err.message?.includes('profiles_username') ? pe.usernameTaken :
        err.message?.includes('magic') ? 'Formato file non valido.' :
        pe.saveError
      )
      setMessageType('error')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-violet-500" />
      </div>
    )
  }

  const isBusy = saving || uploading

  return (
    <div className="max-w-2xl mx-auto p-6 min-h-screen bg-zinc-950 text-white">
      <form onSubmit={handleSave}>
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 md:p-8 space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{pe.title}</h1>
            <Link href={profile?.username ? `/profile/${profile.username}` : '/profile/me'}
              className="text-sm text-zinc-400 hover:text-white transition">
              ← {pe.backToProfile}
            </Link>
          </div>

          {/* ── Foto profilo ── */}
          <div className="flex flex-col items-center gap-4">
            <div
              className="relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-zinc-700 cursor-pointer group"
              onClick={() => fileRef.current?.click()}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <Avatar
                  src={null}
                  username={username || profile?.username || 'u'}
                  displayName={displayName}
                  size={112}
                  className="w-full h-full"
                />
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                {uploading
                  ? <Loader2 size={22} className="text-white animate-spin" />
                  : <Upload size={22} className="text-white" />
                }
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleUpload} className="hidden" />
            <div className="flex items-center gap-4 text-sm">
              <button type="button" onClick={() => fileRef.current?.click()} className="text-violet-400 hover:text-violet-300 font-medium transition">
                {pe.changePhoto}
              </button>
              {avatarPreview && (
                <>
                  <span className="w-px h-4 bg-zinc-700" />
                  <button type="button" onClick={handleRemove} className="text-zinc-400 hover:text-red-400 transition">
                    {pe.removePhoto}
                  </button>
                </>
              )}
            </div>
            <p className="text-[11px] text-zinc-600">JPEG, PNG, GIF o WebP · max 5MB</p>
          </div>

          {/* ── Campi profilo ── */}
          <div className="space-y-4">

            {/* Display name */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">{pe.displayName}</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={50}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
              />
            </div>

            {/* Username */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-zinc-400">{pe.username}</label>
                <span className={`text-xs ${username.length > USERNAME_MAX - 5 ? 'text-amber-400' : 'text-zinc-600'}`}>
                  {username.length}/{USERNAME_MAX}
                </span>
              </div>
              <input
                type="text"
                value={username}
                onChange={e => handleUsernameChange(e.target.value)}
                maxLength={USERNAME_MAX}
                required
                className={`w-full bg-zinc-800 border rounded-2xl px-5 py-3 text-sm focus:outline-none transition ${
                  usernameError ? 'border-red-500' : 'border-zinc-700 focus:border-violet-500'
                }`}
              />
              {usernameError
                ? <p className="text-xs text-red-400 mt-1.5">{usernameError}</p>
                : <p className="text-xs text-zinc-600 mt-1.5">{pe.usernameHint}</p>
              }
            </div>

            {/* Bio */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-zinc-400">{pe.bio}</label>
                <span className={`text-xs ${bio.length > BIO_MAX - 50 ? 'text-amber-400' : 'text-zinc-600'}`}>
                  {bio.length}/{BIO_MAX}
                </span>
              </div>
              <textarea
                value={bio}
                onChange={e => handleBioChange(e.target.value)}
                rows={3}
                maxLength={BIO_MAX}
                placeholder={pe.bioPlaceholder}
                className={`w-full bg-zinc-800 border rounded-2xl px-5 py-3 text-sm focus:outline-none transition resize-none ${
                  bioError ? 'border-red-500' : 'border-zinc-700 focus:border-violet-500'
                }`}
              />
              {bioError && <p className="text-xs text-red-400 mt-1.5">{bioError}</p>}
            </div>
          </div>

          {/* ── Account Steam ── */}
          <div className="pt-2 border-t border-zinc-800">
            <p className="text-sm text-zinc-400 mb-3">Account Steam</p>
            {steamAccount ? (
              <div className="flex items-center justify-between p-4 bg-zinc-800 rounded-2xl">
                <div className="flex items-center gap-3">
                  {steamAccount.avatar ? (
                    <img src={steamAccount.avatar} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#1b2838] flex items-center justify-center">
                      <SteamIcon className="w-4 h-4 text-[#66C0F4]" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{steamAccount.personaname || 'Account Steam'}</p>
                    <p className="text-xs text-zinc-500">Connesso</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-xs text-red-400 hover:text-red-300 transition disabled:opacity-50"
                >
                  {disconnecting ? 'Scollegamento...' : 'Disconnetti'}
                </button>
              </div>
            ) : (
              <a
                href="/api/steam/connect"
                className="flex items-center gap-3 p-4 bg-[#1b2838] hover:bg-[#2a475e] border border-[#66C0F4]/20 rounded-2xl transition-colors group"
              >
                <SteamIcon className="w-5 h-5 text-[#66C0F4]" />
                <div>
                  <p className="text-sm font-medium text-white">Connetti Steam</p>
                  <p className="text-xs text-zinc-400">Importa i tuoi giochi automaticamente</p>
                </div>
                <span className="ml-auto text-zinc-500 group-hover:text-zinc-300 transition">→</span>
              </a>
            )}
          </div>

          {/* ── Feedback ── */}
          {message && (
            <div className={`p-4 rounded-2xl text-sm text-center border ${
              messageType === 'success'
                ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                : 'bg-red-950 border-red-800 text-red-400'
            }`}>
              {message}
            </div>
          )}

          {/* ── Salva ── */}
          <button
            type="submit"
            disabled={isBusy || !!usernameError || !!bioError}
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isBusy
              ? <><Loader2 size={16} className="animate-spin" /> {uploading ? 'Caricamento avatar...' : pe.saving}</>
              : pe.save
            }
          </button>

        </div>
      </form>
    </div>
  )
}
