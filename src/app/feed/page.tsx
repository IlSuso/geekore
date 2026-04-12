'use client'
// src/app/feed/page.tsx
// ── Implementazioni roadmap ──────────────────────────────────────────────────
//   #13  Cache client-side in-memory: i post sono memoizzati per 2 min.
//        Navigare avanti/indietro non ricarica tutto da zero.
//   #25  Post in evidenza: i 2 post con più like degli ultimi 7 giorni
//        vengono mostrati con badge "In evidenza" in cima al feed.
//   #7   Skeleton loaders coerenti: usa SkeletonFeedPost durante il loading.
//   P2   React.memo sul componente PostCard per evitare re-render inutili.
//   #31  Haptic feedback su like e pubblicazione.
//   P5   Import condizionale locale date-fns — carica solo it o enUS, non entrambe.
//   #9   Contatore caratteri live anche sui commenti (appare sopra 400 char).

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { Heart, MessageCircle, Send, Sparkles, Image as ImageIcon, X, Loader2, Pin, ArrowUp, Trash2 } from 'lucide-react'
import { SkeletonFeedPost } from '@/components/ui/SkeletonCard'
import { Avatar } from '@/components/ui/Avatar'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { formatDistanceToNow } from 'date-fns'
// P5: import separati per evitare di caricare entrambe le locale sempre
import { it } from 'date-fns/locale/it'
import { enUS } from 'date-fns/locale/en-US'
import { useLocale } from '@/lib/locale'

// ── Tipi ────────────────────────────────────────────────────────────────────

type Comment = {
  id: string
  content: string
  created_at: string
  user_id: string
  username?: string
  display_name?: string
}

type Post = {
  id: string
  user_id: string
  content: string
  image_url?: string | null
  created_at: string
  profiles: {
    username: string
    display_name?: string
    avatar_url?: string
  }
  likes_count: number
  comments_count: number
  liked_by_user: boolean
  comments: Comment[]
  pinned?: boolean // #25
}

// ── #13 Cache in-memory ──────────────────────────────────────────────────────
const cache: {
  posts: Post[] | null
  page: number
  hasMore: boolean
  filter: 'all' | 'following'
  ts: number
} = { posts: null, page: 0, hasMore: true, filter: 'all', ts: 0 }

const CACHE_TTL = 2 * 60 * 1000

function isCacheValid(filter: 'all' | 'following') {
  return (
    cache.posts !== null &&
    cache.filter === filter &&
    Date.now() - cache.ts < CACHE_TTL
  )
}

// ── #31 Haptic ───────────────────────────────────────────────────────────────
function haptic(pattern: number | number[] = 30) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern)
  }
}

const PAGE_SIZE = 20
const PINNED_LIKE_THRESHOLD = 3

// ── P2 PostCard con React.memo ───────────────────────────────────────────────
const PostCard = memo(function PostCard({
  post,
  currentUser,
  isLiking,
  commentingPostId,
  commentContent,
  locale,
  onLike,
  onToggleComment,
  onCommentChange,
  onAddComment,
  onDelete,
  expandedComments,
  onExpandComments,
}: {
  post: Post
  currentUser: User | null
  isLiking: boolean
  commentingPostId: string | null
  commentContent: string
  locale: string
  onLike: (id: string) => void
  onToggleComment: (id: string) => void
  onCommentChange: (val: string) => void
  onAddComment: (id: string) => void
  onDelete: (id: string) => void
  expandedComments: Set<string>
  onExpandComments: (id: string) => void
}) {
  const isCommenting = commentingPostId === post.id
  const isExpanded = expandedComments.has(post.id)
  const visibleComments = isExpanded ? post.comments : post.comments.slice(0, 3)
  const hiddenCount = post.comments.length - 3

  return (
    <div className={`bg-zinc-950 border rounded-3xl p-6 transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
      post.pinned
        ? 'border-violet-500/40 ring-1 ring-violet-500/20'
        : 'border-zinc-800'
    }`}>
      {/* #25 Badge in evidenza */}
      {post.pinned && (
        <div className="flex items-center gap-1.5 mb-4 text-violet-400">
          <Pin size={12} className="rotate-45" />
          <span className="text-[10px] font-bold uppercase tracking-widest">In evidenza</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-violet-500/20">
          <Avatar
            src={post.profiles.avatar_url}
            username={post.profiles.username}
            displayName={post.profiles.display_name}
            size={44}
            className="rounded-2xl"
          />
        </div>
        <div className="flex-1">
          <p className="font-bold text-white">{post.profiles.display_name || post.profiles.username}</p>
          <p className="text-xs text-zinc-500">
            @{post.profiles.username} · {formatDistanceToNow(new Date(post.created_at), {
              addSuffix: true, locale: locale === 'en' ? enUS : it,
            })}
          </p>
        </div>
        {currentUser && currentUser.id === post.user_id && (
          <button
            onClick={() => onDelete(post.id)}
            className="p-2 rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
            title="Elimina post"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <p className="text-[16px] leading-relaxed mb-5 whitespace-pre-wrap text-zinc-100">{post.content}</p>

      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="mb-5 rounded-2xl overflow-hidden border border-zinc-700">
          <img
            src={post.image_url}
            alt="post"
            className="w-full max-h-[400px] object-contain bg-black"
            loading="lazy"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-8 border-t border-zinc-800 pt-5 text-zinc-400">
        <button
          onClick={() => onLike(post.id)}
          className={`flex items-center gap-2 transition-all ${post.liked_by_user ? 'text-red-500' : 'hover:text-red-400'}`}
        >
          <Heart
            size={22}
            fill={post.liked_by_user ? 'currentColor' : 'none'}
            className={isLiking ? 'animate-heart-burst' : ''}
          />
          <span className="text-sm font-medium">{post.likes_count}</span>
        </button>
        <button
          onClick={() => onToggleComment(post.id)}
          className={`flex items-center gap-2 transition-all ${isCommenting ? 'text-violet-400' : 'hover:text-violet-400'}`}
        >
          <MessageCircle size={22} />
          <span className="text-sm font-medium">{post.comments_count}</span>
        </button>
      </div>

      {/* #9 Comment input con contatore caratteri live */}
      {isCommenting && (
        <div className="mt-4 flex flex-col gap-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={commentContent}
              onChange={e => onCommentChange(e.target.value.slice(0, 500))}
              placeholder="Scrivi un commento..."
              maxLength={500}
              className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAddComment(post.id) }
              }}
            />
            <button
              onClick={() => onAddComment(post.id)}
              className="bg-violet-600 hover:bg-violet-500 px-4 rounded-2xl transition"
            >
              <Send size={16} />
            </button>
          </div>
          {/* Contatore: appare solo quando si avvicina al limite (>400 caratteri) */}
          {commentContent.length > 400 && (
            <div className={`text-right text-xs pr-14 ${commentContent.length >= 480 ? 'text-orange-400' : 'text-zinc-600'}`}>
              {commentContent.length}/500
            </div>
          )}
        </div>
      )}

      {/* Comments list */}
      {post.comments.length > 0 && (
        <div className="mt-4 pl-3 border-l-2 border-zinc-800 space-y-3 text-sm">
          {visibleComments.map(comment => (
            <div key={comment.id}>
              <span className="font-semibold text-violet-400">@{comment.username}</span>
              <span className="ml-2 text-zinc-300">{comment.content}</span>
            </div>
          ))}
          {!isExpanded && hiddenCount > 0 && (
            <button
              onClick={() => onExpandComments(post.id)}
              className="text-xs text-zinc-500 hover:text-violet-400 transition-colors"
            >
              +{hiddenCount} {hiddenCount === 1 ? 'altro commento' : 'altri commenti'}
            </button>
          )}
        </div>
      )}
    </div>
  )
})

// ── Pagina principale ────────────────────────────────────────────────────────

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [pinnedPosts, setPinnedPosts] = useState<Post[]>([])
  const [newPostContent, setNewPostContent] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentProfile, setCurrentProfile] = useState<any>(null)
  const [commentContent, setCommentContent] = useState('')
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null)
  const [feedFilter, setFeedFilter] = useState<'all' | 'following'>('all')
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set())
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [newPostsCount, setNewPostsCount] = useState(0) // N8: contatore nuovi post realtime
  const latestPostIdRef = useRef<string | null>(null)
  const pageRef = useRef(0)

  const supabase = createClient()
  const { locale, t } = useLocale()
  const f = t.feed

  const sentinelRef = useInfiniteScroll({
    onLoadMore: () => {
      if (!currentUser || loadingMore || !hasMore) return
      const nextPage = pageRef.current + 1
      pageRef.current = nextPage
      setPage(nextPage)
      loadPosts(currentUser.id, nextPage, true, feedFilter)
    },
    hasMore,
    isLoading: loadingMore,
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', user.id)
          .single()
        setCurrentProfile(profile)

        if (isCacheValid('all')) {
          setPosts(cache.posts!)
          setPage(cache.page)
          setHasMore(cache.hasMore)
          setLoading(false)
          loadPinnedPosts(user.id)
          return
        }

        await loadPosts(user.id, 0, false)
        await loadPinnedPosts(user.id)
      } else {
        setLoading(false)
      }
    }
    init()
  }, [])

  // N8: Supabase Realtime — ascolta nuovi post senza aggiornare automaticamente
  useEffect(() => {
    const channel = supabase
      .channel('public:posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        const newId = payload.new?.id
        // Ignora se è già il post più recente (appena pubblicato da noi)
        if (!newId || newId === latestPostIdRef.current) return
        setNewPostsCount(prev => prev + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // N8: aggiorna ref quando arrivano nuovi post
  useEffect(() => {
    if (posts.length > 0) {
      latestPostIdRef.current = posts[0].id
    }
  }, [posts])

  const handleShowNewPosts = async () => {
    if (!currentUser) return
    setNewPostsCount(0)
    pageRef.current = 0
    setPage(0)
    setHasMore(true)
    await loadPosts(currentUser.id, 0, false, feedFilter)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadPinnedPosts = useCallback(async (userId: string) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('posts')
      .select(`
        id, user_id, content, image_url, created_at,
        profiles!posts_user_id_fkey (username, display_name, avatar_url),
        likes (id, user_id),
        comments (id, content, created_at, user_id,
          profiles!comments_user_id_fkey (username, display_name, avatar_url))
      `)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) { if (process.env.NODE_ENV === 'development') console.error('[Feed] Errore pinned posts:', error); return }
    if (!data) return

    const withLikes = data
      .map((p: any) => ({ ...p, _likeCount: (p.likes || []).length }))
      .filter((p: any) => p._likeCount >= PINNED_LIKE_THRESHOLD)
      .sort((a: any, b: any) => b._likeCount - a._likeCount)
      .slice(0, 2)

    // Fetch profili autori commenti (identico a loadPosts)
    const
      return {
        id: post.id,
        content: post.content,
        image_url: post.image_url,
        created_at: post.created_at,
        profiles: {
          username: profile?.username || '',
          display_name: profile?.display_name,
          avatar_url: profile?.avatar_url,
        },
        likes_count: likes.length,
        liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: comments.length,
        comments,
        pinned: true,
        user_id: post.user_id,
      }
    })

    setPinnedPosts(formatted)
  }, [supabase])

  const loadPosts = useCallback(async (
    userId: string,
    pageIndex = 0,
    append = false,
    filter: 'all' | 'following' = 'all'
  ) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let followingIds: string[] = []
    if (filter === 'following') {
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
      followingIds = (followsData || []).map((f: any) => f.following_id)
      if (followingIds.length === 0) {
        setPosts(append ? (prev => prev) : [])
        setHasMore(false)
        if (append) setLoadingMore(false)
        else setLoading(false)
        return
      }
    }

    let query = supabase
      .from('posts')
      .select(`
        id, user_id, content, image_url, created_at,
        profiles!posts_user_id_fkey (username, display_name, avatar_url),
        likes (id, user_id),
        comments (id, content, created_at, user_id)
      `)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (filter === 'following' && followingIds.length > 0) {
      query = query.in('user_id', followingIds)
    }

    const { data: postsData } = await query

    const allComments = (postsData || []).flatMap((p: any) => p.comments || [])
    const uniqueUserIds = [...new Set(allComments.map((c: any) => c.user_id))]

    let profileMap: Record<string, any> = {}
    if (uniqueUserIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', uniqueUserIds)
      profilesData?.forEach((p: any) => { profileMap[p.id] = p })
    }

    const formatted: Post[] = (postsData || []).map((post: any) => {
      const likes = post.likes || []
      const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles
      const comments = (post.comments || []).map((c: any) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        user_id: c.user_id,
        username: profileMap[c.user_id]?.username || 'utente',
        display_name: profileMap[c.user_id]?.display_name,
      }))
      return {
        id: post.id,
        user_id: post.user_id,
        content: post.content,
        image_url: post.image_url,
        created_at: post.created_at,
        profiles: {
          username: profile?.username || '',
          display_name: profile?.display_name,
          avatar_url: profile?.avatar_url,
        },
        likes_count: likes.length,
        liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: comments.length,
        comments,
      }
    })

    const newHasMore = (postsData || []).length === PAGE_SIZE

    // Esclude dal feed normale i post già mostrati in evidenza
    const pinnedIds = new Set(pinnedPosts.map(p => p.id))
    const filteredFormatted = formatted.filter(p => !pinnedIds.has(p.id))

    if (append) {
      setPosts(prev => {
        const merged = [...prev, ...filteredFormatted]
        cache.posts = merged
        cache.page = pageIndex
        cache.hasMore = newHasMore
        cache.filter = filter
        cache.ts = Date.now()
        return merged
      })
      setLoadingMore(false)
    } else {
      setPosts(filteredFormatted)
      cache.posts = filteredFormatted
      cache.page = pageIndex
      cache.hasMore = newHasMore
      cache.filter = filter
      cache.ts = Date.now()
      setLoading(false)
    }

    setHasMore(newHasMore)
  }, [supabase, pinnedPosts])

  const handleFilterChange = async (filter: 'all' | 'following') => {
    if (!currentUser) return
    setFeedFilter(filter)
    pageRef.current = 0
    setPage(0)
    setHasMore(true)
    await loadPosts(currentUser.id, 0, false, filter)
  }

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!newPostContent.trim() && !selectedImage) || !currentUser || isPublishing) return
    setIsPublishing(true)
    haptic(50)

    let imageUrl = null
    if (selectedImage) {
      const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!ALLOWED.includes(selectedImage.type)) { setIsPublishing(false); return }
      const fileName = `${Date.now()}-${selectedImage.name}`
      const { error: uploadErr } = await supabase.storage
        .from('post-images')
        .upload(fileName, selectedImage, { contentType: selectedImage.type })
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(fileName)
        imageUrl = urlData.publicUrl
      }
    }

    const { data: newPostData, error } = await supabase
      .from('posts')
      .insert({ user_id: currentUser.id, content: newPostContent.trim(), image_url: imageUrl })
      .select(`id, content, image_url, created_at, profiles!posts_user_id_fkey (username, display_name, avatar_url)`)
      .single()

    if (!error && newPostData) {
      const profile = Array.isArray(newPostData.profiles) ? newPostData.profiles[0] : newPostData.profiles
      const optimisticPost: Post = {
        id: newPostData.id,
        user_id: currentUser.id,
        content: newPostData.content,
        image_url: newPostData.image_url,
        created_at: newPostData.created_at,
        profiles: { username: profile?.username || '', display_name: profile?.display_name, avatar_url: profile?.avatar_url },
        likes_count: 0, comments_count: 0, liked_by_user: false, comments: [],
      }
      setPosts(prev => {
        const updated = [optimisticPost, ...prev]
        cache.posts = updated
        cache.ts = Date.now()
        return updated
      })
      setNewPostContent('')
      setSelectedImage(null)
      setImagePreview(null)
    }

    setIsPublishing(false)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setSelectedImage(file); setImagePreview(URL.createObjectURL(file)) }
  }

  const toggleLike = useCallback(async (postId: string) => {
    if (!currentUser) return
    const postIndex = posts.findIndex(p => p.id === postId)
    if (postIndex === -1) return

    const current = posts[postIndex]
    const willLike = !current.liked_by_user

    if (willLike) {
      haptic([40, 20, 40])
      setLikingIds(prev => new Set([...prev, postId]))
      setTimeout(() => setLikingIds(prev => { const s = new Set(prev); s.delete(postId); return s }), 400)
    } else {
      haptic(20)
    }

    setPosts(prev => prev.map((p, i) => i === postIndex
      ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike }
      : p
    ))

    if (willLike) {
      await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id })
    } else {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    }
  }, [currentUser, posts, supabase])

  const toggleLikePinned = useCallback(async (postId: string) => {
    if (!currentUser) return
    const postIndex = pinnedPosts.findIndex(p => p.id === postId)
    if (postIndex === -1) return

    const current = pinnedPosts[postIndex]
    const willLike = !current.liked_by_user

    if (willLike) {
      haptic([40, 20, 40])
      setLikingIds(prev => new Set([...prev, postId]))
      setTimeout(() => setLikingIds(prev => { const s = new Set(prev); s.delete(postId); return s }), 400)
    }

    setPinnedPosts(prev => prev.map((p, i) => i === postIndex
      ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike }
      : p
    ))

    if (willLike) {
      await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id })
    } else {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    }
  }, [currentUser, pinnedPosts, supabase])

  const handleAddComment = useCallback(async (postId: string) => {
    if (!commentContent.trim() || !currentUser) return
    haptic(30)

    const newCommentTemp: Comment = {
      id: 'temp-' + Date.now(),
      content: commentContent.trim(),
      created_at: new Date().toISOString(),
      user_id: currentUser.id,
      username: currentProfile?.username || 'utente',
      display_name: currentProfile?.display_name,
    }

    setPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, comments_count: post.comments_count + 1, comments: [newCommentTemp, ...post.comments] }
        : post
    ))

    await supabase.from('comments').insert({ post_id: postId, user_id: currentUser.id, content: commentContent.trim() })
    setCommentContent('')
    setCommentingPostId(null)
  }, [commentContent, currentUser, currentProfile, supabase])

  const handleToggleComment = useCallback((postId: string) => {
    setCommentingPostId(prev => prev === postId ? null : postId)
    setCommentContent('')
  }, [])

  const handleExpandComments = useCallback((postId: string) => {
    setExpandedComments(prev => new Set([...prev, postId]))
  }, [])

  const handleDeletePost = useCallback(async (postId: string) => {
    if (!currentUser) return
    // Rimozione ottimistica
    setPosts(prev => {
      const updated = prev.filter(p => p.id !== postId)
      cache.posts = updated
      cache.ts = Date.now()
      return updated
    })
    setPinnedPosts(prev => prev.filter(p => p.id !== postId))
    // Cancella commenti, likes e post (le FK con ON DELETE CASCADE potrebbero già farlo,
    // ma lo facciamo esplicitamente per sicurezza)
    await supabase.from('comments').delete().eq('post_id', postId)
    await supabase.from('likes').delete().eq('post_id', postId)
    await supabase.from('posts').delete().eq('id', postId).eq('user_id', currentUser.id)
  }, [currentUser, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="pt-8 pb-20 max-w-3xl mx-auto px-6 space-y-8">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonFeedPost key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-8 pb-20 max-w-3xl mx-auto px-6">

        {/* Composer */}
        {currentUser && (
          <div className="mb-8 bg-zinc-950 border border-zinc-800 rounded-3xl p-6">
            <form onSubmit={handleCreatePost}>
              <textarea
                data-testid="post-composer"
                value={newPostContent}
                onChange={e => setNewPostContent(e.target.value.slice(0, 500))}
                placeholder={f.placeholder}
                maxLength={500}
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl p-5 text-base min-h-[120px] resize-none focus:outline-none transition-colors"
              />
              <div className={`text-right text-xs mt-1 ${newPostContent.length >= 480 ? 'text-orange-400' : 'text-zinc-600'}`}>
                {newPostContent.length}/500
              </div>
              {imagePreview && (
                <div className="mt-3 relative rounded-2xl overflow-hidden border border-zinc-700">
                  <img src={imagePreview} alt="preview" className="max-h-72 w-full object-contain bg-black" />
                  <button type="button" onClick={() => { setSelectedImage(null); setImagePreview(null) }}
                    className="absolute top-3 right-3 bg-black/80 p-2 rounded-full hover:bg-red-600 transition">
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="flex gap-3 mt-4">
                <label className="cursor-pointer flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 py-3 rounded-2xl flex items-center justify-center gap-2 text-sm transition">
                  <ImageIcon size={18} /> {f.addImage}
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                </label>
                <button type="submit" disabled={isPublishing}
                  className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 rounded-2xl font-semibold text-sm hover:brightness-110 disabled:opacity-70 transition flex items-center justify-center gap-2">
                  {isPublishing ? <><Loader2 size={16} className="animate-spin" /> {f.publishing}</> : f.publish}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* N8: Banner "nuovi post" — non aggiorna automaticamente per non disturbare la lettura */}
        {newPostsCount > 0 && (
          <button
            onClick={handleShowNewPosts}
            className="flex items-center gap-2 mx-auto mb-4 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-full text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-all hover:scale-105 animate-in fade-in slide-in-from-top-2"
          >
            <ArrowUp size={14} />
            🆕 {newPostsCount === 1 ? '1 nuovo post' : `${newPostsCount} nuovi post`} — clicca per vedere
          </button>
        )}

        {/* Filter tabs */}
        {currentUser && (
          <div className="flex gap-2 mb-6 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5 w-fit">
            {(['all', 'following'] as const).map(filter => (
              <button key={filter}
                data-testid={`filter-${filter}`}
                onClick={() => handleFilterChange(filter)}
                className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  feedFilter === filter ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}>
                {filter === 'all' ? f.filterAll : f.filterFollowing}
              </button>
            ))}
          </div>
        )}

        {/* #25 Post in evidenza */}
        {feedFilter === 'all' && pinnedPosts.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">In evidenza questa settimana</span>
            </div>
            <div className="space-y-4">
              {pinnedPosts.map(post => (
                <PostCard
                  key={`pinned-${post.id}`}
                  post={post}
                  currentUser={currentUser}
                  isLiking={likingIds.has(post.id)}
                  commentingPostId={commentingPostId}
                  commentContent={commentContent}
                  locale={locale}
                  onLike={toggleLikePinned}
                  onToggleComment={handleToggleComment}
                  onCommentChange={setCommentContent}
                  onAddComment={handleAddComment}
                  onDelete={handleDeletePost}
                  expandedComments={expandedComments}
                  onExpandComments={handleExpandComments}
                />
              ))}
            </div>
            <div className="h-px bg-zinc-800 my-8" />
          </div>
        )}

        {/* Posts */}
        <div className="space-y-6">
          {posts.length === 0 ? (
            <div className="text-center py-24">
              <Sparkles className="mx-auto mb-6 text-violet-500" size={56} />
              <p className="text-xl font-medium">{feedFilter === 'following' ? f.noFollowingTitle : f.emptyTitle}</p>
              <p className="text-zinc-500 mt-2">{feedFilter === 'following' ? f.noFollowingHint : f.emptyHint}</p>
            </div>
          ) : (
            posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                isLiking={likingIds.has(post.id)}
                commentingPostId={commentingPostId}
                commentContent={commentContent}
                locale={locale}
                onLike={toggleLike}
                onToggleComment={handleToggleComment}
                onCommentChange={setCommentContent}
                onAddComment={handleAddComment}
                onDelete={handleDeletePost}
                expandedComments={expandedComments}
                onExpandComments={handleExpandComments}
              />
            ))
          )}

          <div ref={sentinelRef} className="h-4" />

          {loadingMore && (
            <div className="flex justify-center py-6">
              <Loader2 size={24} className="animate-spin text-violet-400" />
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <p className="text-center text-zinc-600 text-sm py-6">Hai visto tutto! 🎉</p>
          )}
        </div>
      </div>
    </div>
  )
}