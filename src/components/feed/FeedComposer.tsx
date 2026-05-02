'use client'

import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { Image as ImageIcon, Loader2, Tag, X, Sparkles } from 'lucide-react'
import { CategorySelector } from '@/components/feed/CategoryControls'

type ComposerModalPos = {
  top: number
  left: number
  width: number
  maxHeight: number
} | null

type FeedComposerProps = {
  profile: any
  placeholder: string
  composerOpen: boolean
  openComposer: () => void
  closeComposer: () => void
  modalPos: ComposerModalPos
  newPostContent: string
  setNewPostContent: (value: string) => void
  newPostCategory: string
  setNewPostCategory: (value: string) => void
  selectedImage: File | null
  setSelectedImage: (value: File | null) => void
  imagePreview: string | null
  setImagePreview: (value: string | null) => void
  isPublishing: boolean
  handleCreatePost: (event: any) => Promise<void>
  handleImageSelect: (event: ChangeEvent<HTMLInputElement>) => void
}

function ProfileAvatar({ profile, className = 'w-9 h-9', textClassName = 'text-xs' }: { profile: any; className?: string; textClassName?: string }) {
  return (
    <div className={`${className} rounded-full overflow-hidden flex-shrink-0 bg-zinc-800`}>
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full bg-zinc-700 flex items-center justify-center text-white font-bold ${textClassName}`}>
          {(profile?.username?.[0] || '?').toUpperCase()}
        </div>
      )}
    </div>
  )
}

function ComposerProgress({ length }: { length: number }) {
  return (
    <>
      {length >= 400 && (
        <span className={`text-[12px] font-semibold ${length >= 490 ? 'text-red-400' : 'text-zinc-500'}`}>
          {500 - length}
        </span>
      )}
      {length > 0 && (
        <svg width="26" height="26" viewBox="0 0 26 26">
          <circle cx="13" cy="13" r="10" fill="none" stroke="#27272a" strokeWidth="2.5" />
          <circle
            cx="13"
            cy="13"
            r="10"
            fill="none"
            stroke={length >= 490 ? '#f87171' : length >= 450 ? '#fb923c' : '#E6FF3D'}
            strokeWidth="2.5"
            strokeDasharray={`${(length / 500) * 62.83} 62.83`}
            strokeLinecap="round"
            transform="rotate(-90 13 13)"
          />
        </svg>
      )}
    </>
  )
}

export function FeedComposer({
  profile,
  placeholder,
  composerOpen,
  openComposer,
  closeComposer,
  modalPos,
  newPostContent,
  setNewPostContent,
  newPostCategory,
  setNewPostCategory,
  selectedImage,
  setSelectedImage,
  imagePreview,
  setImagePreview,
  isPublishing,
  handleCreatePost,
  handleImageSelect,
}: FeedComposerProps) {
  const publishDisabled = isPublishing || (!newPostContent.trim() && !selectedImage)
  const activityPlaceholder = 'Che cosa hai appena visto, letto, giocato o completato?'

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setNewPostContent(e.target.value.slice(0, 500))
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const clearImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
  }

  return (
    <>
      <div
        className="mx-4 my-4 cursor-pointer rounded-[22px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.045),rgba(255,255,255,0.015))] transition-all duration-200 hover:border-[rgba(230,255,61,0.35)] hover:bg-[var(--bg-card)]"
        onClick={openComposer}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <ProfileAvatar profile={profile} />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-[var(--text-secondary)] select-none">
              {activityPlaceholder}
            </span>
            <span className="gk-mono mt-0.5 block text-[var(--text-muted)]">linka un medium e crea activity</span>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-4 pb-3 pt-2.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(230,255,61,0.32)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[12px] font-bold text-[var(--accent)]">
            <Sparkles size={14} strokeWidth={1.8} />
            Activity
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">
            <Tag size={13} strokeWidth={1.6} />
            Medium / titolo
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">
            <ImageIcon size={14} strokeWidth={1.6} />
            Foto opzionale
          </div>
        </div>
      </div>

      {composerOpen && (
        <>
          <div className="hidden md:block fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm" onClick={closeComposer} />

          {modalPos && (
            <div
              className="hidden md:flex fixed z-[260] flex-col rounded-2xl shadow-2xl shadow-black/70 border border-zinc-700/60"
              style={{ top: modalPos.top, left: modalPos.left, width: modalPos.width, maxHeight: modalPos.maxHeight, background: 'var(--bg-primary)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 flex-shrink-0">
                <button onClick={closeComposer} className="text-[14px] font-medium text-zinc-400 hover:text-white transition-colors">Annulla</button>
                <span className="gk-headline text-white">Nuova activity</span>
                <button
                  onClick={async (e) => { await handleCreatePost(e as any); closeComposer() }}
                  disabled={publishDisabled}
                  className="px-5 py-2 rounded-full text-[13px] font-bold disabled:opacity-30 transition-all"
                  style={{ background: 'var(--accent)', color: '#0B0B0F' }}
                >
                  {isPublishing ? <Loader2 size={14} className="animate-spin" /> : 'Pubblica'}
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="flex gap-3 px-5 pt-5 pb-3">
                  <ProfileAvatar profile={profile} className="w-10 h-10" textClassName="text-sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-white mb-1.5">{profile?.display_name || profile?.username}</p>
                    <textarea
                      data-testid="post-composer"
                      autoFocus
                      value={newPostContent}
                      onChange={handleTextChange}
                      placeholder={activityPlaceholder || placeholder}
                      maxLength={500}
                      rows={3}
                      className="no-nav-hide w-full bg-transparent text-[16px] text-white placeholder-zinc-500 outline-none resize-none leading-relaxed"
                      style={{ minHeight: '80px' }}
                    />
                  </div>
                </div>
                {imagePreview && (
                  <div className="relative bg-zinc-950 border-t border-b border-zinc-800/60">
                    <img src={imagePreview} alt="preview" className="w-full object-contain" style={{ maxHeight: '400px' }} />
                    <button type="button" onClick={clearImage} className="absolute top-3 right-3 w-8 h-8 bg-black/75 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 border-t border-zinc-800/60 px-4 py-3 flex items-center gap-3" style={{ background: 'var(--bg-primary)' }}>
                <label className="cursor-pointer flex items-center justify-center w-10 h-10 rounded-2xl text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800 transition-all select-none">
                  <ImageIcon size={22} strokeWidth={1.5} />
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                </label>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="gk-label hidden text-[var(--text-muted)] sm:inline">Medium</span>
                  <CategorySelector value={newPostCategory} onChange={setNewPostCategory} />
                </div>
                <div className="ml-auto flex items-center gap-2.5">
                  <ComposerProgress length={newPostContent.length} />
                </div>
              </div>
            </div>
          )}

          {!modalPos && typeof document !== 'undefined' && createPortal(
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
                <button onClick={closeComposer} style={{ fontSize: 14, color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>Annulla</button>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Nuova activity</span>
                <button
                  onClick={async (e) => { await handleCreatePost(e as any); closeComposer() }}
                  disabled={publishDisabled}
                  style={{ background: 'var(--accent)', color: '#0B0B0F', border: 'none', borderRadius: 999, padding: '8px 20px', fontSize: 13, fontWeight: 700, opacity: publishDisabled ? 0.3 : 1, cursor: 'pointer' }}
                >
                  {isPublishing ? '...' : 'Pubblica'}
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <div style={{ display: 'flex', gap: 12, padding: '20px 20px 12px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#27272a' }}>
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0f766e,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>{(profile?.username?.[0] || '?').toUpperCase()}</div>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 8 }}>{profile?.display_name || profile?.username}</p>
                    <textarea
                      data-testid="post-composer"
                      value={newPostContent}
                      onChange={handleTextChange}
                      placeholder={activityPlaceholder}
                      maxLength={500}
                      rows={4}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px', outline: 'none', resize: 'none', color: 'white', fontSize: 16, lineHeight: 1.6, minHeight: 100, fontFamily: 'inherit' }}
                    />
                  </div>
                </div>

                {imagePreview && (
                  <div style={{ position: 'relative', background: '#09090b', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <img src={imagePreview} alt="preview" style={{ width: '100%', objectFit: 'contain', maxHeight: 300 }} />
                    <button
                      onClick={clearImage}
                      style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'var(--bg-primary)' }}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, color: '#a1a1aa' }}>
                  <ImageIcon size={22} strokeWidth={1.5} />
                  <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
                </label>
                <CategorySelector value={newPostCategory} onChange={setNewPostCategory} />
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {newPostContent.length >= 400 && <span style={{ fontSize: 12, fontWeight: 600, color: newPostContent.length >= 490 ? '#f87171' : '#71717a' }}>{500 - newPostContent.length}</span>}
                  {newPostContent.length > 0 && <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="none" stroke="#27272a" strokeWidth="2.5" /><circle cx="13" cy="13" r="10" fill="none" stroke={newPostContent.length >= 490 ? '#f87171' : newPostContent.length >= 450 ? '#fb923c' : '#E6FF3D'} strokeWidth="2.5" strokeDasharray={`${(newPostContent.length / 500) * 62.83} 62.83`} strokeLinecap="round" transform="rotate(-90 13 13)" /></svg>}
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </>
  )
}
