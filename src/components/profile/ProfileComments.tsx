'use client'
// src/components/profile/ProfileComments.tsx

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { MessageSquare, Send, MoreHorizontal, Loader2 } from 'lucide-react'
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
  }, [profileId])

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
    if (newComment.trim().length > 500) { return }

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

    const { data: inserted, error } = await supabase
      .from('profile_comments')
      .insert({ profile_id: profileId, author_id: currentUserId, content: draft })
      .select('id, content, created_at, author_id')
      .single()

    if (error || !inserted) {
      setComments(prev => prev.filter(c => c.id !== optimistic.id))
    } else {
      const { data: authorProfile } = await supabase
        .from('profiles').select('username, display_name, avatar_url').eq('id', currentUserId).single()
      setComments(prev => prev.map(c =>
        c.id === optimistic.id
          ? { ...inserted, author: authorProfile || { username: currentUsername || 'tu', display_name: undefined, avatar_url: undefined } }
          : c
      ))
      if (profileId !== currentUserId) {
        await supabase.from('notifications').insert({
          receiver_id: profileId, sender_id: currentUserId, type: 'comment',
        }).then(() => {})
        fetch('/api/social/profile-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: profileId }),
        }).catch(() => {})
      }
    }
    setPosting(false)
  }

  const handleDelete = async (commentId: string, authorId: string) => {
    if (!currentUserId) return
    if (currentUserId !== authorId && !isOwner) return
    const { error } = await supabase.from('profile_comments').delete().eq('id', commentId)
    if (error) { return }
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  return (
    <>
      <div className="mt-12">
        <div className="flex items-center gap-2 mb-6">
          <MessageSquare size={18} className="text-zinc-400" />
          <h3 className="text-xl font-semibold">Bacheca</h3>
          <span className="text-xs text-zinc-600 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full ml-1">
            {comments.length}
          </span>
        </div>

        {currentUserId && (
          <div className="mb-6 flex gap-3">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value.slice(0, 500))}
              placeholder={`Lascia un messaggio su @${profileUsername}...`}
              rows={2}
              className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none transition-colors"
            />
            <button
              onClick={handlePost}
              disabled={!newComment.trim() || posting}
              className="self-end px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-2xl transition"
            >
              {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-violet-400" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-10 text-zinc-600 text-sm">
            Nessun messaggio ancora. Sii il primo a scrivere qualcosa!
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map(comment => (
              <div key={comment.id} className="flex gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl group">
                <Link href={`/profile/${comment.author?.username}`} className="flex-shrink-0">
                  <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800">
                    {comment.author?.avatar_url ? (
                      <img src={comment.author.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
                        {(comment.author?.display_name?.[0] || comment.author?.username?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/profile/${comment.author?.username}`} className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors">
                      @{comment.author?.username || 'utente'}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: it })}
                      </span>
                      {(currentUserId === comment.author_id || isOwner) && (
                        <button
                          onClick={() => setConfirmDelete({ id: comment.id, authorId: comment.author_id })}
                          className="opacity-40 hover:opacity-100 text-zinc-500 hover:text-white transition-all"
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-300 mt-1 leading-relaxed">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete !== null && portalMounted && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 16px 16px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ background: '#27272a', borderRadius: 16, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ color: '#a1a1aa', fontSize: 12, textAlign: 'center' }}>Eliminare il commento?</p>
              </div>
              <button
                onClick={() => {
                  const target = confirmDelete
                  setConfirmDelete(null)
                  handleDelete(target.id, target.authorId)
                }}
                style={{ width: '100%', padding: '14px', color: '#f87171', fontWeight: 600, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Elimina
              </button>
            </div>
            <button
              onClick={() => setConfirmDelete(null)}
              style={{ width: '100%', padding: '14px', background: '#27272a', borderRadius: 16, color: 'white', fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer' }}
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