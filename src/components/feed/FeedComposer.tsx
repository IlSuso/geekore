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

function ProfileAvatar({ profile, className = 'h-9 w-9', textClassName = 'text-xs' }: { profile: any; className?: string; textClassName?: string }) {
  return (
    <div className={`${className} flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/10`}>
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
      ) : (
        <div className={`flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(230,255,61,0.18),rgba(139,92,246,0.18))] font-black text-[var(--text-primary)] ${textClassName}`}>
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
        <span className={`font-mono-data text-[12px] font-black ${length >= 490 ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
          {500 - length}
        </span>
      )}
      {length > 0 && (
        <svg width="26" height="26" viewBox="0 0 26 26">
          <circle cx="13" cy="13" r="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
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

function PublishButton({ disabled, isPublishing, onClick }: { disabled: boolean; isPublishing: boolean; onClick: (e: any) => void }) {
  return (
    <button
      type="button"
      data-no-swipe="true"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center justify-center rounded-2xl px-5 text-[13px] font-black transition-all disabled:opacity-30"
      style={{ background: 'var(--accent)', color: '#0B0B0F' }}
    >
      {isPublishing ? <Loader2 size={14} className="animate-spin" /> : 'Pubblica'}
    </button>
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
      <button
        type="button"
        data-no-swipe="true"
        className="mx-4 my-4 block w-[calc(100%-2rem)] cursor-pointer rounded-[22px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.045),rgba(255,255,255,0.015))] text-left transition-all duration-200 hover:border-[rgba(230,255,61,0.35)] hover:bg-[var(--bg-card)]"
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
        <div className="flex items-center gap-2 overflow-x-auto border-t border-[var(--border-subtle)] px-4 pb-3 pt-2.5 scrollbar-hide">
          <div className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[rgba(230,255,61,0.32)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[12px] font-bold text-[var(--accent)]">
            <Sparkles size={14} strokeWidth={1.8} />
            Activity
          </div>
          <div className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">
            <Tag size={13} strokeWidth={1.6} />
            Medium / titolo
          </div>
          <div className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">
            <ImageIcon size={14} strokeWidth={1.6} />
            Foto opzionale
          </div>
        </div>
      </button>

      {composerOpen && (
        <>
          <div className="fixed inset-0 z-[250] hidden bg-black/70 backdrop-blur-sm md:block" onClick={closeComposer} />

          {modalPos && (
            <div
              data-no-swipe="true"
              className="fixed z-[260] hidden flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:flex"
              style={{ top: modalPos.top, left: modalPos.left, width: modalPos.width, maxHeight: modalPos.maxHeight }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.08),rgba(139,92,246,0.055),transparent)] px-5 py-4">
                <button type="button" onClick={closeComposer} data-no-swipe="true" className="text-[14px] font-bold text-[var(--text-muted)] transition-colors hover:text-white">Annulla</button>
                <div className="text-center">
                  <p className="gk-label text-[var(--accent)]">Activity composer</p>
                  <span className="gk-headline text-[var(--text-primary)]">Nuova activity</span>
                </div>
                <PublishButton disabled={publishDisabled} isPublishing={isPublishing} onClick={async (e) => { await handleCreatePost(e as any); closeComposer() }} />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex gap-3 px-5 pb-3 pt-5">
                  <ProfileAvatar profile={profile} className="h-10 w-10" textClassName="text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 text-[14px] font-black text-[var(--text-primary)]">{profile?.display_name || profile?.username}</p>
                    <textarea
                      data-testid="post-composer"
                      data-no-swipe="true"
                      autoFocus
                      value={newPostContent}
                      onChange={handleTextChange}
                      placeholder={activityPlaceholder || placeholder}
                      maxLength={500}
                      rows={3}
                      className="no-nav-hide w-full resize-none bg-transparent text-[16px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                      style={{ minHeight: '80px' }}
                    />
                  </div>
                </div>
                {imagePreview && (
                  <div className="relative border-y border-[var(--border)] bg-black/50">
                    <img src={imagePreview} alt="preview" className="w-full object-contain" style={{ maxHeight: '400px' }} />
                    <button type="button" data-no-swipe="true" onClick={clearImage} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-2xl bg-black/75 text-white transition-colors hover:bg-red-600">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3">
                <label className="flex h-10 w-10 cursor-pointer select-none items-center justify-center rounded-2xl text-[var(--text-muted)] transition-all hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]">
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
            <div data-no-swipe="true" className="fixed inset-0 z-[9999] flex flex-col bg-[var(--bg-primary)]">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] bg-[rgba(11,11,15,0.92)] px-4 py-3 backdrop-blur-2xl" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <button type="button" onClick={closeComposer} data-no-swipe="true" className="rounded-2xl px-2 py-2 text-sm font-bold text-[var(--text-muted)]">Annulla</button>
                <div className="text-center">
                  <p className="gk-label text-[var(--accent)]">Activity</p>
                  <span className="text-[16px] font-black text-[var(--text-primary)]">Nuova activity</span>
                </div>
                <PublishButton disabled={publishDisabled} isPublishing={isPublishing} onClick={async (e) => { await handleCreatePost(e as any); closeComposer() }} />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex gap-3 px-5 pb-3 pt-5">
                  <ProfileAvatar profile={profile} className="h-10 w-10" textClassName="text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-sm font-black text-[var(--text-primary)]">{profile?.display_name || profile?.username}</p>
                    <textarea
                      data-testid="post-composer"
                      data-no-swipe="true"
                      value={newPostContent}
                      onChange={handleTextChange}
                      placeholder={activityPlaceholder}
                      maxLength={500}
                      rows={4}
                      className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-[16px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
                      style={{ minHeight: 100 }}
                    />
                  </div>
                </div>

                {imagePreview && (
                  <div className="relative border-y border-[var(--border)] bg-black/50">
                    <img src={imagePreview} alt="preview" className="w-full object-contain" style={{ maxHeight: 300 }} />
                    <button type="button" data-no-swipe="true" onClick={clearImage} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-2xl bg-black/75 text-white">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl text-[var(--text-muted)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]">
                  <ImageIcon size={22} strokeWidth={1.5} />
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                </label>
                <CategorySelector value={newPostCategory} onChange={setNewPostCategory} />
                <div className="ml-auto flex items-center gap-2.5">
                  <ComposerProgress length={newPostContent.length} />
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
