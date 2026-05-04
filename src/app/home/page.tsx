'use client'
// src/app/home/page.tsx
// ── Implementazioni ──────────────────────────────────────────────────────────
//   #13  Cache client-side in-memory (2 min TTL)
//   #25  Post in evidenza: i 2 con più like negli ultimi 7 giorni
//   #7   Skeleton loaders
//   P2   React.memo su PostCard
//   #31  Haptic feedback su like e pubblicazione
//   P5   Import condizionale locale date-fns
//   #9   Contatore caratteri live sui commenti (>400 char)
//   CAT  Categoria post: macro fissa + titolo specifico libero (es: Film:Forrest Gump)
//   AFF  Tracking affinità utente per categoria su like/commento
//   IGF  Algoritmo feed Instagram-like: ogni 5 post dei seguiti → 1 post discovery
//   FLT  Filtro feed per macro-categoria + ricerca sottocategoria libera

import { useState, useEffect, useCallback, useRef } from 'react'
import { useScrollPanel } from '@/context/ScrollPanelContext'
import { useTabActive } from '@/context/TabActiveContext'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { User } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { useLocale } from '@/lib/locale'
import { FeedSidebar } from '@/components/feed/FeedSidebar'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { PullWrapper } from '@/components/ui/PullWrapper'
import { StickyFromBottom } from '@/components/ui/StickyFromBottom'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'
import { parseCategoryString } from '@/components/feed/CategoryBasics'
import { FeedComposer } from '@/components/feed/FeedComposer'
import { EndOfFeedNotice, FeedLoadingSkeleton, MobileCreatePostFab } from '@/components/feed/FeedChrome'
import { EditPostModal, EmptyFeedState, FeedFilterTabs, MediumTypeChipRow, NewPostsBanner } from '@/components/feed/FeedPanels'
import type { Comment, Post } from '@/components/feed/feedTypes'
import { BottomSheet, PostCard, PostModal, VirtualPostCard } from '@/components/feed/PostComponents'
import { buildFeedSheetActions, getFeedSheetTitle, type FeedSheetState } from '@/components/feed/feedSheet'
import { cache, haptic, invalidateCache, isCacheValid, trackAffinity, type FeedFilter } from '@/components/feed/feedUtils'
import { fetchFeedPostsPage, fetchPinnedPosts } from '@/components/feed/feedData'
import { localizePostMediaPreviews } from '@/lib/i18n/clientMediaLocalization'


// ── Pagina principale ────────────────────────────────────────────────────────

export default function FeedPage() {
  const pathname = usePathname()
  const { scrollToTop } = useScrollPanel()
  const [posts, setPosts] = useState<Post[]>([])
  const [pinnedPosts, setPinnedPosts] = useState<Post[]>([])
  const [localizedPosts, setLocalizedPosts] = useState<Post[]>([])
  const [localizedPinnedPosts, setLocalizedPinnedPosts] = useState<Post[]>([])
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostCategory, setNewPostCategory] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentProfile, setCurrentProfile] = useState<any>(null)
  const [modalPostId, setModalPostId] = useState<string | null>(null)

  // Lock body scroll + horizontal swipe when comment modal is open
  useEffect(() => {
    if (modalPostId) {
      document.body.style.overflow = 'hidden'
      gestureState.drawerActive = true
      const closeModal = () => setModalPostId(null)
      androidBack.push(closeModal)
      return () => {
        document.body.style.overflow = ''
        gestureState.drawerActive = false
        androidBack.pop(closeModal)
      }
    } else {
      document.body.style.overflow = ''
      gestureState.drawerActive = false
    }
    return () => { document.body.style.overflow = ''; gestureState.drawerActive = false }
  }, [modalPostId])

  // ── Bottom Sheet globale ──────────────────────────────────────────────────
  const [sheet, setSheet] = useState<FeedSheetState>({ open: false })
  const closeSheet = useCallback(() => setSheet({ open: false }), [])

  const handlePostOptions = useCallback((postId: string) => {
    setSheet({ open: true, type: 'post', postId })
  }, [])

  const handleCommentOptions = useCallback((commentId: string, postId: string) => {
    setSheet({ open: true, type: 'comment', commentId, postId })
  }, [])
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all')
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set())
  const [newPostsCount, setNewPostsCount] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [modalPos, setModalPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  const latestPostIdRef = useRef<string | null>(null)
  const pageRef = useRef(0)
  const supabase = createClient()
  // PERF FIX: user da AuthContext — nessun getUser() extra
  const { user: authUser, loading: authLoading } = useAuth()
  const { locale, t } = useLocale()
  const f = t.feed

  useEffect(() => {
    let cancelled = false
    setLocalizedPosts(posts)
    localizePostMediaPreviews(posts, locale).then(next => { if (!cancelled) setLocalizedPosts(next) })
    return () => { cancelled = true }
  }, [posts, locale])

  useEffect(() => {
    let cancelled = false
    setLocalizedPinnedPosts(pinnedPosts)
    localizePostMediaPreviews(pinnedPosts, locale).then(next => { if (!cancelled) setLocalizedPinnedPosts(next) })
    return () => { cancelled = true }
  }, [pinnedPosts, locale])

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
    const init = async (user: import('@supabase/supabase-js').User | null) => {
      setCurrentUser(user)
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('username, display_name, avatar_url').eq('id', user.id).single()
        setCurrentProfile(profile)
        if (isCacheValid('all')) {
          setPosts(cache.posts!); setPage(cache.page); setHasMore(cache.hasMore); setLoading(false)
          loadPinnedPosts(user.id); return
        }
        await loadPosts(user.id, 0, false)
        await loadPinnedPosts(user.id)
      } else {
        setLoading(false)
      }
    }
    if (authLoading) return // aspetta che l'auth sia risolto — evita il doppio render
    init(authUser)
  }, [authUser, authLoading]) // eslint-disable-line

  const isActive = useTabActive()

  // Realtime: si iscrive solo quando il tab è visibile.
  // Quando l'utente swippa su un altro tab, il canale viene rimosso.
  // Così il feed non consuma risorse durante lo swipe e non causa lag.
  useEffect(() => {
    if (!isActive) return // non attivo → non aprire il canale
    const CHANNEL_NAME = 'feed:posts:live'
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${CHANNEL_NAME}`)
    if (existing) return
    const channel = supabase.channel(CHANNEL_NAME)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        const newId = payload.new?.id
        if (!newId || newId === latestPostIdRef.current) return
        setNewPostsCount(prev => prev + 1)
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (posts.length > 0) latestPostIdRef.current = posts[0].id
  }, [posts])

  const handleShowNewPosts = async () => {
    if (!currentUser) return
    setNewPostsCount(0); pageRef.current = 0; setPage(0); setHasMore(true)
    await loadPosts(currentUser.id, 0, false, feedFilter)
    scrollToTop('smooth')
  }

  const loadPinnedPosts = useCallback(async (userId: string) => {
    setPinnedPosts(await fetchPinnedPosts(supabase, userId))
  }, [supabase])

  const loadPosts = useCallback(async (userId: string, pageIndex = 0, append = false, filter: FeedFilter = 'all', silent = false) => {
    if (append) setLoadingMore(true)
    else if (!silent) setLoading(true)

    const { posts: finalPosts, hasMore: newHasMore } = await fetchFeedPostsPage({
      supabase,
      userId,
      pageIndex,
      filter,
      pinnedPosts,
    })

    if (append) {
      setPosts(prev => {
        const merged = [...prev, ...finalPosts]
        cache.posts = merged; cache.page = pageIndex; cache.hasMore = newHasMore; cache.filter = filter; cache.ts = Date.now()
        return merged
      })
      setLoadingMore(false)
    } else {
      setPosts(finalPosts)
      cache.posts = finalPosts; cache.page = pageIndex; cache.hasMore = newHasMore; cache.filter = filter; cache.ts = Date.now()
      if (!silent) setLoading(false)
    }

    setHasMore(newHasMore)
  }, [supabase, pinnedPosts])

  const closeComposerRef = useRef<() => void>(null as any)
  const closeComposer = useCallback(() => {
    if (closeComposerRef.current) androidBack.pop(closeComposerRef.current)
    document.body.style.overflow = ''
    setComposerOpen(false)
    setNewPostContent('')
    setNewPostCategory('')
    setSelectedImage(null)
    setImagePreview(null)
  }, [])
  closeComposerRef.current = closeComposer

  const openComposer = () => {
    document.body.style.overflow = 'hidden'
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (vw >= 640) {
      const sidebarW = vw >= 1280 ? 240 : 0   // left nav solo su xl+
      const contentW = vw - sidebarW
      const modalW = Math.min(560, contentW - 48)
      const top = 40
      const bottomMargin = 80
      setModalPos({
        top,
        left: Math.round(sidebarW + (contentW - modalW) / 2),
        width: modalW,
        maxHeight: vh - top - bottomMargin,
      })
    } else {
      setModalPos(null)
    }
    androidBack.push(closeComposer)
    setComposerOpen(true)
  }

  // Pull-to-refresh su mobile
  const handlePullRefresh = async () => {
    if (!currentUser) return
    invalidateCache(feedFilter)
    // Silent: non mostra skeleton, aggiorna i post in background.
    // Dopo che i dati arrivano, scrolla silenziosamente in cima — come Instagram.
    await loadPosts(currentUser.id, 0, false, feedFilter, true)
    // Scroll to top senza flash: i dati sono già aggiornati, scroll smooth invisibile
    scrollToTop('smooth')
  }
  const { distance: pullDistance, refreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handlePullRefresh,
    enabled: pathname === '/home' || pathname === '/',
  })

  const handleFilterChange = async (filter: FeedFilter) => {
    if (!currentUser) return
    setFeedFilter(filter); pageRef.current = 0; setPage(0); setHasMore(true)
    await loadPosts(currentUser.id, 0, false, filter)
  }

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser || isPublishing) return
    if (!newPostContent.trim() && !selectedImage) return
    if (newPostContent.trim().length > 0 && newPostContent.trim().length < 1) return // minimo 1 char visibile
    setIsPublishing(true); haptic(50)

    let imageUrl = null
    if (selectedImage) {
      const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!ALLOWED.includes(selectedImage.type)) { setIsPublishing(false); return }
      const formData = new FormData()
      formData.append('image', selectedImage)
      const uploadRes = await fetch('/api/posts/upload-image', {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) {
        setIsPublishing(false)
        return
      }
      const uploadData = await uploadRes.json()
      imageUrl = uploadData.url || null
    }

    const createRes = await fetch('/api/social/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: newPostContent,
        image_url: imageUrl,
        category: newPostCategory || null,
      }),
    }).catch(() => null)

    if (createRes?.ok) {
      const { post: newPostData } = await createRes.json()
      const optimisticPost: Post = {
        id: newPostData.id, user_id: currentUser.id, content: newPostData.content,
        image_url: newPostData.image_url, created_at: newPostData.created_at, category: newPostData.category,
        profiles: { username: currentProfile?.username || '', display_name: currentProfile?.display_name, avatar_url: currentProfile?.avatar_url },
        likes_count: 0, comments_count: 0, liked_by_user: false, comments: [],
      }
      setPosts(prev => { const updated = [optimisticPost, ...prev]; cache.posts = updated; cache.ts = Date.now(); return updated })
      setNewPostContent(''); setNewPostCategory(''); setSelectedImage(null); setImagePreview(null)
      setComposerOpen(false)
    }
    setIsPublishing(false)
  }

  // Compressione client-side via canvas.
  // Max 1200px wide (sufficiente per qualsiasi feed mobile/desktop), quality 0.82 JPEG.
  // L'output è già quello che verrà uploadato: preview = risultato finale, zero sorprese.
  const compressImage = (file: File): Promise<{ blob: Blob; previewUrl: string }> =>
    new Promise((resolve, reject) => {
      const img = new window.Image()
      const objectUrl = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        const MAX_W = 1200
        let { width, height } = img
        if (width > MAX_W) { height = Math.round((height * MAX_W) / width); width = MAX_W }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas not available')); return }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          blob => {
            if (!blob) { reject(new Error('compression failed')); return }
            const previewUrl = URL.createObjectURL(blob)
            resolve({ blob, previewUrl })
          },
          'image/jpeg',
          0.82
        )
      }
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load failed')) }
      img.src = objectUrl
    })

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Mostra subito la preview con l'originale — zero attesa per l'utente
    const immediateUrl = URL.createObjectURL(file)
    setSelectedImage(file)
    setImagePreview(immediateUrl)
    // Comprimi in background: quando finisce, sostituisce il file da uploadare
    // (la preview rimane quella immediata, non cambia visivamente)
    compressImage(file).then(({ blob, previewUrl }) => {
      URL.revokeObjectURL(immediateUrl)
      const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
      setSelectedImage(compressed)
      setImagePreview(previewUrl)
    }).catch(() => {
      // fallback: tieni il file originale già impostato sopra
    })
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
      if (current.category) trackAffinity(supabase, currentUser.id, current.category)
    } else { haptic(20) }
    // UI ottimistica immediata
    setPosts(prev => prev.map((p, i) => i === postIndex ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike } : p))
    // La scrittura reale passa dall'API server-side; la UI resta ottimistica.
    if (willLike) {
      await fetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'like' }),
      }).catch(() => {})
    } else {
      await fetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'unlike' }),
      }).catch(() => {})
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
      if (current.category) trackAffinity(supabase, currentUser.id, current.category)
    } else { haptic(20) }
    // UI ottimistica immediata
    setPinnedPosts(prev => prev.map((p, i) => i === postIndex ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike } : p))
    // La scrittura reale passa dall'API server-side; la UI resta ottimistica.
    if (willLike) {
      await fetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'like' }),
      }).catch(() => {})
    } else {
      await fetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'unlike' }),
      }).catch(() => {})
    }
  }, [currentUser, pinnedPosts, supabase])

  const handleAddComment = useCallback(async (postId: string, content: string) => {
    if (!content.trim() || !currentUser) return
    haptic(30)
    const post = [...posts, ...pinnedPosts].find(p => p.id === postId)
    if (post?.category) trackAffinity(supabase, currentUser.id, post.category)
    const trimmedContent = content.trim()
    const newCommentTemp: Comment = {
      id: 'temp-' + Date.now(), content: trimmedContent,
      created_at: new Date().toISOString(), user_id: currentUser.id,
      username: currentProfile?.username || 'utente', display_name: currentProfile?.display_name,
    }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1, comments: [newCommentTemp, ...p.comments] } : p))
    setPinnedPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1, comments: [newCommentTemp, ...p.comments] } : p))
    const res = await fetch('/api/social/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, content: trimmedContent }),
    }).catch(() => null)

    if (!res?.ok) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1), comments: p.comments.filter(c => c.id !== newCommentTemp.id) } : p))
      setPinnedPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1), comments: p.comments.filter(c => c.id !== newCommentTemp.id) } : p))
      return
    }

    const data = await res.json()
    if (data?.comment?.id) {
      const replaceTemp = (p: Post) => p.id === postId
        ? { ...p, comments: p.comments.map(c => c.id === newCommentTemp.id ? { ...c, id: data.comment.id, created_at: data.comment.created_at } : c) }
        : p
      setPosts(prev => prev.map(replaceTemp))
      setPinnedPosts(prev => prev.map(replaceTemp))
    }
  }, [currentUser, currentProfile, posts, pinnedPosts, supabase])

  const handleDeleteComment = useCallback(async (commentId: string, postId: string) => {
    if (!currentUser) return
    const res = await fetch('/api/social/comment', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId }),
    }).catch(() => null)
    if (!res?.ok) return
    const remove = (p: Post) => p.id === postId ? { ...p, comments_count: p.comments_count - 1, comments: p.comments.filter(c => c.id !== commentId) } : p
    setPosts(prev => prev.map(remove)); setPinnedPosts(prev => prev.map(remove))
  }, [currentUser])

  const handleDeletePost = useCallback(async (postId: string) => {
    if (!currentUser) return
    setPosts(prev => { const updated = prev.filter(p => p.id !== postId); cache.posts = updated; cache.ts = Date.now(); return updated })
    setPinnedPosts(prev => prev.filter(p => p.id !== postId))
    await fetch('/api/social/post', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId }),
    }).catch(() => {})
  }, [currentUser])

  // ── Edit post ─────────────────────────────────────────────────────────────
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const startEditPost = useCallback((postId: string) => {
    const post = [...posts, ...pinnedPosts].find(p => p.id === postId)
    if (!post) return
    setEditingPostId(postId)
    setEditContent(post.content)
    closeSheet()
  }, [posts, pinnedPosts])

  const handleEditPost = useCallback(async () => {
    if (!currentUser || !editingPostId || !editContent.trim()) return
    const newContent = editContent.trim()
    const res = await fetch('/api/social/post', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: editingPostId, content: newContent }),
    }).catch(() => null)
    if (!res?.ok) return
    const update = (p: Post) => p.id === editingPostId ? { ...p, content: newContent, is_edited: true } : p
    setPosts(prev => { const updated = prev.map(update); cache.posts = updated; cache.ts = Date.now(); return updated })
    setPinnedPosts(prev => prev.map(update))
    setEditingPostId(null)
    setEditContent('')
  }, [currentUser, editingPostId, editContent])

  // Filtro client-side: supporta sia "Film" (solo macro) che "Film:Forrest Gump" (match esatto sottocategoria)
  const filteredPosts = categoryFilter
    ? localizedPosts.filter(p => {
        if (!p.category) return false
        const filterParsed = parseCategoryString(categoryFilter)
        const postParsed = parseCategoryString(p.category)
        if (!filterParsed || !postParsed) return false
        if (filterParsed.category !== postParsed.category) return false
        // Se il filtro ha una sottocategoria, controlla match case-insensitive
        if (filterParsed.subcategory) {
          return postParsed.subcategory.toLowerCase().includes(filterParsed.subcategory.toLowerCase())
        }
        return true // solo macro, mostra tutto
      })
    : localizedPosts

  // DOM cap: manteniamo al massimo DOM_CAP post renderizzati contemporaneamente.
  // Cresce di DOM_CAP_STEP ogni volta che posts si estende (nuova pagina Supabase).
  // Tiene il DOM leggero senza rompere l'infinite scroll esistente.
  const DOM_CAP_INITIAL = 25
  const DOM_CAP_STEP = 15
  const [domCap, setDomCap] = useState(DOM_CAP_INITIAL)
  const prevPostsLen = useRef(0)
  useEffect(() => {
    if (posts.length > prevPostsLen.current) {
      // Nuovi post arrivati: estendi il cap per mostrare quelli nuovi
      setDomCap(cap => Math.max(cap, posts.length))
    }
    prevPostsLen.current = posts.length
  }, [posts.length])
  // Reset cap quando cambia il filtro (lista completamente diversa)
  useEffect(() => { setDomCap(DOM_CAP_INITIAL) }, [categoryFilter])

  const displayedPosts = filteredPosts.slice(0, domCap)

  // Click su un badge categoria in un post → attiva il filtro per quella categoria
  const handleCategoryClick = useCallback((category: string) => {
    setCategoryFilter(prev => prev === category ? '' : category)
    scrollToTop('smooth')
  }, [])

  if (loading) return <FeedLoadingSkeleton />

  const sheetActions = buildFeedSheetActions(sheet, {
    startEditPost,
    handleDeletePost,
    handleDeleteComment,
    closeSheet,
    setSheet,
  })
  const sheetTitle = getFeedSheetTitle(sheet)

  return (
    <div className="gk-home-page min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Bottom Sheet globale — fuori da qualsiasi overflow/transform */}
      <BottomSheet open={sheet.open} title={sheetTitle} actions={sheetActions} onClose={closeSheet} />

      {/* Post Modal — Facebook style */}
      {modalPostId && (() => {
        const modalPost = [...localizedPosts, ...localizedPinnedPosts].find(p => p.id === modalPostId)
        if (!modalPost) return null
        return (
          <PostModal
            post={modalPost}
            currentUser={currentUser}
            currentProfile={currentProfile}
            onClose={() => setModalPostId(null)}
            onLike={pinnedPosts.some(p => p.id === modalPostId) ? toggleLikePinned : toggleLike}
            onAddComment={handleAddComment}
            onCommentOptions={handleCommentOptions}
            isLiking={likingIds.has(modalPostId)}
            locale={locale}
          />
        )
      })()}

      {/* Modal modifica post */}
      {editingPostId && (
        <EditPostModal
          editContent={editContent}
          setEditContent={setEditContent}
          onClose={() => setEditingPostId(null)}
          onSave={handleEditPost}
        />
      )}
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPullRefreshing} />

      <PullWrapper distance={pullDistance} refreshing={isPullRefreshing}>
      {/* Layout: colonna centrale centrata su desktop, full-bleed su mobile */}
      <div className="pb-24 xl:pb-6 relative min-h-screen">

        <div className="flex items-start min-h-screen">

          {/* ── Colonna principale ─────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex justify-center pt-14 md:pt-4">
          <div className="w-full max-w-[720px] px-4">

            {/* Composer — barra statica non invasiva, modal fullscreen al tap */}
            {currentUser && (
              <FeedComposer
                profile={currentProfile}
                placeholder={f.placeholder}
                composerOpen={composerOpen}
                openComposer={openComposer}
                closeComposer={closeComposer}
                modalPos={modalPos}
                newPostContent={newPostContent}
                setNewPostContent={setNewPostContent}
                newPostCategory={newPostCategory}
                setNewPostCategory={setNewPostCategory}
                selectedImage={selectedImage}
                setSelectedImage={setSelectedImage}
                imagePreview={imagePreview}
                setImagePreview={setImagePreview}
                isPublishing={isPublishing}
                handleCreatePost={handleCreatePost}
                handleImageSelect={handleImageSelect}
              />            )}

            {/* Banner nuovi post — Instagram "Nuovi post" pill */}
            <NewPostsBanner count={newPostsCount} onShow={handleShowNewPosts} />

            {/* Filter tabs — Per te / Seguiti */}
            {currentUser && (
              <FeedFilterTabs
                feedFilter={feedFilter}
                onFilterChange={handleFilterChange}
              />
            )}

            {/* Medium type chip row */}
            {currentUser && (
              <MediumTypeChipRow categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} />
            )}

            {/* Post in evidenza — il badge "In evidenza" è già dentro la card */}
            {feedFilter === 'all' && !categoryFilter && pinnedPosts.length > 0 && (
              <div className="mb-5">
                <div className="flex flex-col gap-3 pt-5">
                  {localizedPinnedPosts.map(post => (
                    <PostCard key={`pinned-${post.id}`} post={post} currentUser={currentUser}
                      isLiking={likingIds.has(post.id)} locale={locale}
                      onLike={toggleLikePinned} onOpenModal={setModalPostId}
                      onCategoryClick={handleCategoryClick}
                      onPostOptions={handlePostOptions} />
                  ))}
                </div>
                <div className="h-px bg-zinc-800 mt-5" />
              </div>
            )}

            {/* Feed posts — respiro tra le card */}
            <div className="flex flex-col gap-3 pt-3">
              {displayedPosts.length === 0 ? (
                <EmptyFeedState
                  categoryFilter={categoryFilter}
                  feedFilter={feedFilter}
                  labels={{
                    noFollowingTitle: f.noFollowingTitle,
                    emptyTitle: f.emptyTitle,
                    noFollowingHint: f.noFollowingHint,
                    emptyHint: f.emptyHint,
                  }}
                  clearCategoryFilter={() => setCategoryFilter('')}
                />
              ) : (
                displayedPosts.map((post, idx) => (
                  <VirtualPostCard key={post.id} index={idx} alwaysMounted={idx < 5}>
                    <PostCard post={post} currentUser={currentUser}
                      isLiking={likingIds.has(post.id)} locale={locale}
                      onLike={toggleLike} onOpenModal={setModalPostId}
                      onCategoryClick={handleCategoryClick}
                      onPostOptions={handlePostOptions} />
                  </VirtualPostCard>
                ))
              )}

              <div ref={sentinelRef} className="h-4" />

              {loadingMore && (
                <div className="flex justify-center py-8">
                  <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent)' }} />
                </div>
              )}

              {!hasMore && posts.length > 0 && <EndOfFeedNotice />}
            </div>
          </div>
          </div>

          {/* ── Sidebar destra — Twitter-like: nessuno scroll interno.
              La sidebar resta nel flusso normale, scorre insieme al feed e,
              quando il suo fondo raggiunge il fondo viewport, resta ancorata. */}
          <div className="hidden 2xl:block w-[430px] flex-shrink-0 self-start px-3 pt-4">
            <StickyFromBottom navHeight={16} bottomOffset={16} className="gk-home-right-sticky">
              <FeedSidebar currentUserId={currentUser?.id ?? null} />
            </StickyFromBottom>
          </div>

        </div>
      </div>
      </PullWrapper>

      {/* FAB mobile — position:sticky segue il panel durante lo swipe */}
      {currentUser && (
        <MobileCreatePostFab
          onClick={() => {
            scrollToTop('smooth')
            setTimeout(() => {
              const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder]')
              textarea?.focus()
            }, 400)
          }}
        />
      )}
    </div>
  )
}
