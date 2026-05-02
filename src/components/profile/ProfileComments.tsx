'use client'
// src/components/profile/ProfileComments.tsx

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { MessageSquare, Send, MoreHorizontal, Loader2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale'

interface Comment {
  id: string
  content: string
  created_at: string
  author_id: string
  author: {
    username: string
    display_name?: string
    avatar_url?: string
  }
}

interface ProfileCommentsProps {
  profileId: string
  profileUsername: string
  isOwner: boolean
}

function CommentAvatar({ author }: { author: Comment['author'] }) {
  return (
    <div className="h-10 w-10 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
      {author?.avatar_url ? (
        <img src={author.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(230,255,61,0.22),rgba(74,222,128,0.16))] text-sm font-black text-[var(--text-primary)]">
          {(author?.display_name?.[0] || author?.username?.[0] || '?').toUpperCase()}
        </div>
      )}
    </div>
  )
}

export function ProfileComments({ profileId, profileUsername, isOwner }: ProfileCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUsername, setCurrentUsername] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; authorId: string } | null>(null)
  const [portalMounted, setPortalMounted] = useState(false)
  const supabase = createClient()

  useEffect(() => { setPortalMounted(true) }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const { data: profile } = await supabase
          .from('profiles').select('username').eq('id', user.id).single()
        setCurrentUsername(profile?.username || null)
      }
      await loadComments()
    }
    init()
  }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadComments = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profile_comments')
      .select('id, content, created_at, author_id')
      .eq('profile_id', profileId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(30)

    if (!data || data.length === 0) { setComments([]); setLoading(false); return }

    const authorIds = [...new Set(data.map((c: any) => c.author_id))]
    const { data: profiles } = await supabase
      .from('profiles').select('id, username, display_name, avatar_url').in('id', authorIds)
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))

    setComments(data.map((c: any) => ({
      ...c,
      author: profileMap.get(c.author_id) || { username: 'utente', display_name: undefined, avatar_url: undefined },
    })))
    setLoading(false)
  }

  const handlePost = async () => {
    if (!newComment.trim() || !currentUserId || posting) return
    if (newComment.trim().length > 500) return

    setPosting(true)
    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      content: newComment.trim(),
      created_at: new Date().toISOString(),
      author_id: currentUserId,
      author: { username: currentUsername || 'tu', display_name: undefined, avatar_url: undefined },
    }
    setComments(prev => [optimistic, ...prev])
    const draft = newComment.trim()
    setNewComment('')

    const res = await fetch('/api/social/profile-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId, content: draft }),
    }).catch(() => null)

    if (!res?.ok) {
      setComments(prev => prev.filter(c => c.id !== optimistic.id))
    } else {
      const { comment: inserted } = await res.json()
      const { data: authorProfile } = await supabase
        .from('profiles').select('username, display_name, avatar_url').eq('id', currentUserId).single()
      setComments(prev => prev.map(c =>
        c.id === optimistic.id
          ? { ...inserted, author: authorProfile || { username: currentUsername || 'tu', display_name: undefined, avatar_url: undefined } }
          : c
      ))
    }
    setPosting(false)
  }

  const handleDelete = async (commentId: string, authorId: string) => {
    if (!currentUserId) return
    if (currentUserId !== authorId && !isOwner) return
    const res = await fetch('/api/social/profile-comment', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId }),
    }).catch(() => null)
    if (!res?.ok) return
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  return (
    <>
      <div className="mt-12">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 gk-section-eyebrow">
              <Sparkles size={12} />
              Profile wall
            </div>
            <h3 className="gk-title text-[var(--text-primary)]">Bacheca</h3>
            <p className="gk-caption">Messaggi pubblici lasciati dalla community.</p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 font-mono-data text-xs font-black text-[var(--text-secondary)]">
            {comments.length}
          </span>
        </div>

        {currentUserId && (
          <div className="mb-5 rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value.slice(0, 500))}
              placeholder={`Lascia un messaggio su @${profileUsername}...`}
              rows={3}
              className="mb-3 w-full resize-none bg-transparent px-1 text-sm leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
              <span className={`font-mono-data text-[11px] font-bold ${newComment.length >= 480 ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                {500 - newComment.length}
              </span>
              <button
                onClick={handlePost}
                disabled={!newComment.trim() || posting}
                className="inline-flex h-9 items-center gap-2 rounded-2xl px-4 text-xs font-black transition-all disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#0B0B0F' }}
              >
                {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Pubblica
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[86px] rounded-[20px] bg-[var(--bg-card)] skeleton" />
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
              <MessageSquare size={28} className="text-[var(--text-muted)]" />
            </div>
            <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun messaggio ancora</p>
            <p className="gk-body mx-auto max-w-sm">Sii il primo a lasciare un commento su questo profilo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {comments.map(comment => (
              <div key={comment.id} className="group flex gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                <Link href={`/profile/${comment.author?.username}`} className="flex-shrink-0">
                  <CommentAvatar author={comment.author} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/profile/${comment.author?.username}`} className="truncate text-sm font-black text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]">
                      @{comment.author?.username || 'utente'}
                    </Link>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="gk-mono text-[var(--text-muted)]">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: it })}
                      </span>
                      {(currentUserId === comment.author_id || isOwner) && (
                        <button
                          onClick={() => setConfirmDelete({ id: comment.id, authorId: comment.author_id })}
                          className="rounded-lg p-1 text-[var(--text-muted)] opacity-55 transition-all hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] hover:opacity-100"
                          aria-label="Opzioni commento"
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete !== null && portalMounted && createPortal(
        <div
          className="fixed inset-0 z-[20000] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-[var(--border)] px-5 py-4 text-center">
              <p className="gk-headline text-[var(--text-primary)]">Eliminare il commento?</p>
              <p className="gk-caption mt-1">L’azione non può essere annullata.</p>
            </div>
            <button
              onClick={() => {
                const target = confirmDelete
                setConfirmDelete(null)
                handleDelete(target.id, target.authorId)
              }}
              className="w-full border-b border-[var(--border-subtle)] px-5 py-4 text-sm font-black text-red-400 transition-colors hover:bg-red-500/10"
            >
              Elimina
            </button>
            <button
              onClick={() => setConfirmDelete(null)}
              className="w-full px-5 py-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
            >
              Annulla
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
