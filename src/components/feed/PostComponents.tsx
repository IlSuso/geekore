'use client'

import { useEffect, useRef, useState, memo } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale/it'
import { enUS } from 'date-fns/locale/en-US'
import { MessageCircle, MoreHorizontal, Pin, Send, Sparkles, X, Flame } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { ReportButton } from '@/components/ui/ReportButton'
import { UserBadge } from '@/components/ui/UserBadge'
import { androidBack } from '@/hooks/androidBack'
import { CategoryBadge } from '@/components/feed/CategoryBasics'
import type { Post } from '@/components/feed/feedTypes'

// ── VirtualPostCard ────────────────────────────────────────────────────────────
// Wrapper leggero che smonta il contenuto della card quando è lontana dal viewport.
// Misura l'altezza reale prima di smontare → placeholder esatta stessa dimensione.
// Le prime ALWAYS_MOUNTED card non vengono mai smontate (above-the-fold).
const VIRTUAL_MARGIN = '600px'  // margine fuori viewport prima di smontare

export const VirtualPostCard = memo(function VirtualPostCard({
  index, alwaysMounted, children,
}: { index: number; alwaysMounted: boolean; children: React.ReactNode }) {
  const wrapRef   = useRef<HTMLDivElement>(null)
  const heightRef = useRef<number>(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (alwaysMounted) return
    const el = wrapRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
        } else {
          // Misura altezza reale prima di smontare
          heightRef.current = el.getBoundingClientRect().height || heightRef.current
          setVisible(false)
        }
      },
      { rootMargin: VIRTUAL_MARGIN, threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [alwaysMounted])

  return (
    <div ref={wrapRef} style={!visible && heightRef.current ? { height: heightRef.current } : undefined}>
      {(visible || alwaysMounted) ? children : null}
    </div>
  )
})

// ── PostCard ──────────────────────────────────────────────────────────────────

// ── Popup conferma eliminazione ───────────────────────────────────────────────
// ── Bottom Sheet globale stile Instagram ─────────────────────────────────────
// Usato per opzioni post/commento — viene montato a livello di pagina (fuori dal PostCard)
// per evitare che transform/overflow dei parent rompano il fixed positioning.

export type BottomSheetAction = {
  label: string
  onClick: () => void
  danger?: boolean
}

export function BottomSheet({
  open, title, actions, onClose,
}: {
  open: boolean
  title?: string
  actions: BottomSheetAction[]
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    androidBack.push(onClose)
    return () => androidBack.pop(onClose)
  }, [open, onClose])

  if (!open || !mounted) return null

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const content = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      {/* Desktop: modale centrato */}
      <div className="hidden md:flex items-center justify-center h-full">
        <div className="bg-[#262626] rounded-2xl overflow-hidden w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
          {title && <div className="px-6 py-4 border-b border-zinc-700/50"><p className="text-zinc-400 text-xs text-center leading-relaxed">{title}</p></div>}
          {actions.map((action, i) => (
            <button key={i} onClick={() => { action.onClick() }}
              className={`w-full py-4 font-semibold text-[15px] transition-colors border-b border-zinc-700/40 last:border-0 hover:bg-zinc-700/30 ${action.danger ? 'text-red-400' : 'text-white'}`}>
              {action.label}
            </button>
          ))}
          <button onClick={onClose} className="w-full py-4 text-white text-[15px] font-normal hover:bg-zinc-700/30 transition-colors border-t border-zinc-700/40">Annulla</button>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden flex items-end justify-center h-full">
        <div className="w-full max-w-sm mb-4 mx-4" onClick={e => e.stopPropagation()}>
          <div className="bg-zinc-800 rounded-2xl overflow-hidden mb-2">
            {title && <div className="px-4 py-3 border-b border-zinc-700/50"><p className="text-zinc-400 text-xs text-center leading-relaxed">{title}</p></div>}
            {actions.map((action, i) => (
              <button key={i} onClick={() => { action.onClick() }}
                className={`w-full py-4 font-semibold text-[15px] border-b border-zinc-700/30 last:border-0 active:bg-zinc-700/50 ${action.danger ? 'text-red-400' : 'text-white'}`}>
                {action.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-full bg-zinc-800 rounded-2xl py-4 text-white font-semibold text-[15px] active:bg-zinc-700">Annulla</button>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

export const PostCard = memo(function PostCard({
  post, currentUser, isLiking, locale,
  onLike, onOpenModal, onPostOptions, onCategoryClick,
}: {
  post: Post
  currentUser: User | null
  isLiking: boolean
  locale: string
  onLike: (id: string) => void
  onOpenModal: (id: string) => void
  onPostOptions: (postId: string) => void
  onCategoryClick?: (category: string) => void
}) {
  return (
    <div className={`rounded-2xl transition-all duration-300 animate-fade-in ${
      post.pinned ? 'bg-zinc-900 border border-zinc-700 ring-1 ring-zinc-700/30'
      : post.isDiscovery ? 'bg-zinc-900 border border-fuchsia-500/25 ring-1 ring-fuchsia-500/10'
      : 'bg-zinc-900 border border-zinc-800/70'
    }`}>

      {post.pinned && (
        <div className="flex items-center gap-1.5 px-5 pt-4 pb-1" style={{ color: '#E6FF3D' }}>
          <Pin size={11} className="rotate-45" />
          <span className="text-[10px] font-bold uppercase tracking-widest">In evidenza</span>
        </div>
      )}
      {post.isDiscovery && !post.pinned && (
        <div className="flex items-center gap-1.5 px-5 pt-4 pb-1 text-fuchsia-400">
          <Sparkles size={11} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Consigliato per te</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <Link href={`/profile/${post.profiles.username}`} className="group shrink-0" onClick={e => e.stopPropagation()}>
          <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-zinc-600/20 group-hover:ring-zinc-600/50 transition-all">
            <Avatar src={post.profiles.avatar_url} username={post.profiles.username} displayName={post.profiles.display_name} size={40} className="rounded-full" />
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${post.profiles.username}`} className="hover:text-[#E6FF3D] transition-colors" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text-primary)] text-[15px] leading-tight">
              <UserBadge badge={post.profiles.badge} displayName={post.profiles.display_name || post.profiles.username} />
            </p>
          </Link>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
          </p>
        </div>
        {currentUser?.id === post.user_id && (
          <button onClick={() => onPostOptions(post.id)} className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all" aria-label="Opzioni post">
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Testo del post */}
      <div className="px-5 pb-3">
        <p className="text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap">{post.content.replace(/\n{3,}/g, '\n\n')}</p>
        {post.is_edited && (
          <p className="text-[11px] text-zinc-600 mt-1">modificato</p>
        )}
      </div>

      {/* Categoria */}
      {post.category && (
        <div className="px-5 pb-3 -mt-1">
          <CategoryBadge category={post.category} onClick={onCategoryClick ? () => onCategoryClick(post.category!) : undefined} />
        </div>
      )}

      {/* Immagine */}
      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="mx-5 mb-4 rounded-2xl overflow-hidden border border-zinc-800">
          <img src={post.image_url} alt={`Post di ${post.profiles.username}`}
            className="w-full max-h-[420px] object-cover hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
                          decoding="async" />
        </div>
      )}

      {/* Azioni */}
      <div className="px-5 py-2.5 flex items-center gap-6 border-t border-zinc-800/50">
        <button
          onClick={() => onLike(post.id)}
          aria-label={post.liked_by_user ? 'Rimuovi like' : 'Metti like'}
          className={`flex items-center gap-2 group transition-all ${post.liked_by_user ? 'text-orange-500' : 'text-zinc-500 hover:text-orange-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${post.liked_by_user ? 'bg-orange-500/15' : 'group-hover:bg-orange-500/10'}`}>
            <Flame size={19} className={`transition-transform ${post.liked_by_user ? 'fill-orange-500' : ''} ${isLiking ? 'animate-heart-burst' : ''}`} />
          </div>
          <span className="text-xs font-bold">{post.likes_count}</span>
        </button>

        <button
          onClick={() => onOpenModal(post.id)}
          aria-label="Vedi commenti"
          className="flex items-center gap-2 group transition-all text-zinc-500 hover:text-[#E6FF3D]"
        >
          <div className="p-1.5 rounded-xl transition-colors group-hover:bg-zinc-800/60">
            <MessageCircle size={19} />
          </div>
          <span className="text-xs font-bold">{post.comments_count}</span>
        </button>

        {currentUser && currentUser.id !== post.user_id && (
          <div className="ml-auto">
            <ReportButton targetType="post" targetId={post.id} iconOnly />
          </div>
        )}

        {/* Share — Web Share API nativa, fallback clipboard */}
        <button
          onClick={async () => {
            const url = `${window.location.origin}/home?post=${post.id}`
            if (navigator.share) {
              await navigator.share({ title: 'Geekore', text: post.content.slice(0, 80), url }).catch(() => {})
            } else {
              await navigator.clipboard.writeText(url).catch(() => {})
            }
          }}
          aria-label="Condividi post"
          className={`flex items-center gap-2 group text-zinc-500 hover:text-[#E6FF3D] transition-all ${currentUser && currentUser.id !== post.user_id ? '' : 'ml-auto'}`}
        >
          <div className="p-1.5 rounded-xl transition-colors group-hover:bg-zinc-800/60">
            <Send size={18} aria-hidden="true" />
          </div>
        </button>
      </div>
    </div>
  )
})

// ── PostModal — Facebook style ────────────────────────────────────────────────

export function PostModal({
  post, currentUser, currentProfile, onClose, onLike, onAddComment, onCommentOptions, isLiking, locale,
}: {
  post: Post
  currentUser: User | null
  currentProfile: any
  onClose: () => void
  onLike: (id: string) => void
  onAddComment: (postId: string, content: string) => void
  onCommentOptions: (commentId: string, postId: string) => void
  isLiking: boolean
  locale: string
}) {
  const [commentText, setCommentText] = useState('')

  const submitComment = () => {
    if (!commentText.trim()) return
    onAddComment(post.id, commentText.trim())
    setCommentText('')
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      data-no-swipe
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 flex-shrink-0">
          <h3 className="font-semibold text-white text-[15px]">Post</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {post.pinned && (
            <div className="flex items-center gap-1.5 px-5 pt-4 pb-1" style={{ color: '#E6FF3D' }}>
              <Pin size={11} className="rotate-45" />
              <span className="text-[10px] font-bold uppercase tracking-widest">In evidenza</span>
            </div>
          )}
          {post.isDiscovery && !post.pinned && (
            <div className="flex items-center gap-1.5 px-5 pt-4 pb-1 text-fuchsia-400">
              <Sparkles size={11} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Consigliato per te</span>
            </div>
          )}

          {/* Post header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
            <Link href={`/profile/${post.profiles.username}`} onClick={onClose} className="group shrink-0">
              <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-zinc-600/20 group-hover:ring-zinc-600/50 transition-all">
                <Avatar src={post.profiles.avatar_url} username={post.profiles.username} displayName={post.profiles.display_name} size={40} className="rounded-full" />
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/profile/${post.profiles.username}`} onClick={onClose} className="hover:text-[#E6FF3D] transition-colors">
                <p className="font-semibold text-[var(--text-primary)] text-[15px] leading-tight">
                  <UserBadge badge={post.profiles.badge} displayName={post.profiles.display_name || post.profiles.username} />
                </p>
              </Link>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
              </p>
            </div>
          </div>

          {/* Post content */}
          <div className="px-5 pb-3">
            <p className="text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap">{post.content.replace(/\n{3,}/g, '\n\n')}</p>
            {post.is_edited && <p className="text-[11px] text-zinc-600 mt-1">modificato</p>}
          </div>

          {/* Categoria */}
          {post.category && (
            <div className="px-5 pb-3 -mt-1">
              <CategoryBadge category={post.category} />
            </div>
          )}

          {/* Post image */}
          {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
            <div className="mx-5 mb-4 rounded-2xl overflow-hidden border border-zinc-800">
              <img src={post.image_url} alt={`Post di ${post.profiles.username}`}
                className="w-full max-h-[320px] object-cover" loading="lazy"
                          decoding="async" />
            </div>
          )}

          {/* Like/comment counts */}
          <div className="px-5 py-2.5 flex items-center gap-6 border-t border-zinc-800/50">
            <button
              onClick={() => onLike(post.id)}
              aria-label={post.liked_by_user ? 'Rimuovi like' : 'Metti like'}
              className={`flex items-center gap-2 group transition-all ${post.liked_by_user ? 'text-orange-500' : 'text-zinc-500 hover:text-orange-400'}`}
            >
              <div className={`p-1.5 rounded-xl transition-colors ${post.liked_by_user ? 'bg-orange-500/15' : 'group-hover:bg-orange-500/10'}`}>
                <Flame size={19} className={`transition-transform ${post.liked_by_user ? 'fill-orange-500' : ''} ${isLiking ? 'animate-heart-burst' : ''}`} />
              </div>
              <span className="text-xs font-bold">{post.likes_count}</span>
            </button>
            <div className="flex items-center gap-2 text-zinc-500">
              <MessageCircle size={17} />
              <span className="text-xs font-bold">{post.comments_count}</span>
            </div>
          </div>

          {/* Comments */}
          {post.comments.length > 0 ? (
            <>
              <div className="h-px bg-zinc-800/70 mx-5" />
              <div className="px-5 py-3 space-y-4">
                {post.comments.map(comment => (
                  <div key={comment.id} className="flex items-start gap-3 group/mc">
                    <Link href={`/profile/${comment.username}`} onClick={onClose} className="shrink-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-zinc-700/60">
                        <Avatar src={undefined} username={comment.username || 'user'} displayName={comment.display_name} size={32} className="rounded-full" />
                      </div>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-snug">
                        <Link href={`/profile/${comment.username}`} onClick={onClose}
                          className="font-semibold text-white hover:text-[#E6FF3D] transition-colors mr-1">
                          {comment.username}
                        </Link>
                        <span className="text-zinc-400">{comment.content}</span>
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
                      </p>
                    </div>
                    {currentUser?.id === comment.user_id && (
                      <button
                        onClick={() => onCommentOptions(comment.id, post.id)}
                        aria-label="Opzioni commento"
                        className="text-zinc-600 hover:text-white opacity-0 group-hover/mc:opacity-100 transition-all shrink-0 mt-0.5"
                      >
                        <MoreHorizontal size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-zinc-600">Nessun commento ancora. Sii il primo!</p>
            </div>
          )}
        </div>

        {/* Comment input */}
        {currentUser && (
          <div className="border-t border-zinc-800 px-5 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-zinc-700/60">
              <Avatar src={currentProfile?.avatar_url} username={currentProfile?.username || 'user'} displayName={currentProfile?.display_name} size={32} className="rounded-full" />
            </div>
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value.slice(0, 500))}
              placeholder="Aggiungi un commento..."
              maxLength={500}
              className="flex-1 bg-transparent text-[14px] text-white placeholder-zinc-500 focus:outline-none min-w-0"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
            />
            {commentText.trim() && (
              <button onClick={submitComment} className="font-bold text-sm shrink-0" style={{ color: '#E6FF3D' }}>
                Pubblica
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

