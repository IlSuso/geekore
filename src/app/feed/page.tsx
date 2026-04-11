'use client'
// src/app/feed/page.tsx
// Versione aggiornata: infinite scroll automatico + skeleton loaders + like animation

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { Heart, MessageCircle, Send, Sparkles, Image as ImageIcon, X, Loader2 } from 'lucide-react'
import { SkeletonFeedPost } from '@/components/ui/SkeletonCard'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { formatDistanceToNow } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { useLocale } from '@/lib/locale'

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
}

const PAGE_SIZE = 20

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([])
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
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set()) // per animazione

  const supabase = createClient()
  const { locale, t } = useLocale()
  const f = t.feed

  // Infinite scroll sentinel
  const sentinelRef = useInfiniteScroll({
    onLoadMore: () => {
      if (!currentUser || loadingMore || !hasMore) return
      const nextPage = page + 1
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
        await loadPosts(user.id, 0, false)
      } else {
        setLoading(false)
      }
    }
    init()
  }, [])

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
        id, content, image_url, created_at,
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

    const formatted = (postsData || []).map((post: any) => {
      const likes = post.likes || []
      const comments = (post.comments || []).map((c: any) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        user_id: c.user_id,
        username: profileMap[c.user_id]?.username || 'utente',
        display_name: profileMap[c.user_id]?.display_name,
      }))
      return {
        ...post,
        likes_count: likes.length,
        liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: comments.length,
        comments,
      }
    })

    setHasMore((postsData || []).length === PAGE_SIZE)

    if (append) {
      setPosts(prev => [...prev, ...formatted])
      setLoadingMore(false)
    } else {
      setPosts(formatted)
      setLoading(false)
    }
  }, [supabase])

  const handleFilterChange = async (filter: 'all' | 'following') => {
    if (!currentUser) return
    setFeedFilter(filter)
    setPage(0)
    setHasMore(true)
    await loadPosts(currentUser.id, 0, false, filter)
  }

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!newPostContent.trim() && !selectedImage) || !currentUser || isPublishing) return
    setIsPublishing(true)

    let imageUrl = null
    if (selectedImage) {
      const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!ALLOWED.includes(selectedImage.type)) {
        setIsPublishing(false)
        return
      }
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
        content: newPostData.content,
        image_url: newPostData.image_url,
        created_at: newPostData.created_at,
        profiles: { username: profile?.username || '', display_name: profile?.display_name, avatar_url: profile?.avatar_url },
        likes_count: 0,
        comments_count: 0,
        liked_by_user: false,
        comments: [],
      }
      setPosts(prev => [optimisticPost, ...prev])
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

  const toggleLike = async (postId: string) => {
    if (!currentUser) return
    const postIndex = posts.findIndex(p => p.id === postId)
    if (postIndex === -1) return

    const current = posts[postIndex]
    const willLike = !current.liked_by_user

    // Animazione like
    if (willLike) {
      setLikingIds(prev => new Set([...prev, postId]))
      setTimeout(() => setLikingIds(prev => { const s = new Set(prev); s.delete(postId); return s }), 400)
    }

    // Ottimistico
    setPosts(prev => prev.map((p, i) => i === postIndex
      ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike }
      : p
    ))

    if (willLike) {
      await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id })
    } else {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    }
  }

  const handleAddComment = async (postId: string) => {
    if (!commentContent.trim() || !currentUser) return

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
  }

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

        {/* Filter tabs */}
        {currentUser && (
          <div className="flex gap-2 mb-6 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5 w-fit">
            {(['all', 'following'] as const).map(filter => (
              <button key={filter}
                onClick={() => handleFilterChange(filter)}
                className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  feedFilter === filter ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}>
                {filter === 'all' ? f.filterAll : f.filterFollowing}
              </button>
            ))}
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
              <div key={post.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-violet-500/20">
                    {post.profiles.avatar_url
                      ? <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
                          {(post.profiles.display_name?.[0] || post.profiles.username?.[0] || '?').toUpperCase()}
                        </div>
                    }
                  </div>
                  <div>
                    <p className="font-bold text-white">{post.profiles.display_name || post.profiles.username}</p>
                    <p className="text-xs text-zinc-500">
                      @{post.profiles.username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
                    </p>
                  </div>
                </div>

                <p className="text-[16px] leading-relaxed mb-5 whitespace-pre-wrap">{post.content}</p>

                {post.image_url && (
                  <div className="mb-5 rounded-2xl overflow-hidden border border-zinc-700">
                    <img src={post.image_url} alt="post" className="w-full max-h-[400px] object-contain bg-black" loading="lazy" />
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-8 border-t border-zinc-800 pt-5 text-zinc-400">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`flex items-center gap-2 transition-all ${post.liked_by_user ? 'text-red-500' : 'hover:text-red-400'}`}
                  >
                    <Heart
                      size={22}
                      fill={post.liked_by_user ? 'currentColor' : 'none'}
                      className={likingIds.has(post.id) ? 'animate-heart-burst' : ''}
                    />
                    <span className="text-sm font-medium">{post.likes_count}</span>
                  </button>
                  <button
                    onClick={() => setCommentingPostId(commentingPostId === post.id ? null : post.id)}
                    className={`flex items-center gap-2 transition-all ${commentingPostId === post.id ? 'text-violet-400' : 'hover:text-violet-400'}`}
                  >
                    <MessageCircle size={22} />
                    <span className="text-sm font-medium">{post.comments_count}</span>
                  </button>
                </div>

                {/* Comments */}
                {commentingPostId === post.id && (
                  <div className="mt-4 flex gap-2">
                    <input
                      type="text"
                      value={commentContent}
                      onChange={e => setCommentContent(e.target.value)}
                      placeholder="Scrivi un commento..."
                      className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(post.id) } }}
                    />
                    <button onClick={() => handleAddComment(post.id)}
                      className="bg-violet-600 hover:bg-violet-500 px-4 rounded-2xl transition">
                      <Send size={16} />
                    </button>
                  </div>
                )}

                {post.comments.length > 0 && (
                  <div className="mt-4 pl-3 border-l-2 border-zinc-800 space-y-3 text-sm">
                    {post.comments.slice(0, 3).map(comment => (
                      <div key={comment.id}>
                        <span className="font-semibold text-violet-400">@{comment.username}</span>
                        <span className="ml-2 text-zinc-300">{comment.content}</span>
                      </div>
                    ))}
                    {post.comments.length > 3 && (
                      <p className="text-xs text-zinc-600">+{post.comments.length - 3} altri commenti</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Sentinel per infinite scroll */}
          <div ref={sentinelRef} className="h-4" />

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="flex justify-center py-6">
              <Loader2 size={24} className="animate-spin text-violet-400" />
            </div>
          )}

          {/* Fine contenuti */}
          {!hasMore && posts.length > 0 && (
            <p className="text-center text-zinc-600 text-sm py-6">Hai visto tutto! 🎉</p>
          )}
        </div>
      </div>
    </div>
  )
}