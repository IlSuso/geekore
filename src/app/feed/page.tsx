'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { Flame, MessageCircle, Send, Sparkles, Image as ImageIcon, X, Users, Globe } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import Link from 'next/link';

type Comment = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  username?: string;
  display_name?: string;
};

type Post = {
  id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  profiles: {
    username: string;
    display_name?: string;
    avatar_url?: string
  };
  likes_count: number;
  comments_count: number;
  liked_by_user: boolean;
  comments: Comment[];
};

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [commentContent, setCommentContent] = useState('');
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedFilter, setFeedFilter] = useState<'all' | 'following'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PAGE_SIZE = 20;
  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', user.id)
          .single();
        setCurrentProfile(profile);
        await loadPosts(user.id, 0, false);
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  const loadPosts = async (userId: string, pageIndex = 0, append = false, filter: 'all' | 'following' = 'all') => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let followingIds: string[] = [];
    if (filter === 'following') {
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);
      followingIds = (followsData || []).map((f: any) => f.following_id);
      if (followingIds.length === 0) {
        setPosts(append ? (prev => prev) : []);
        setHasMore(false);
        if (append) setLoadingMore(false);
        else setLoading(false);
        return;
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
      .range(from, to);

    if (filter === 'following' && followingIds.length > 0) {
      query = query.in('user_id', followingIds);
    }

    const { data: postsData, error: postsError } = await query;

    if (postsError) {
      console.error('Errore caricamento post:', postsError);
      if (append) setLoadingMore(false);
      else setLoading(false);
      return;
    }

    const allComments = (postsData || []).flatMap((p: any) => p.comments || []);
    const uniqueUserIds = [...new Set(allComments.map((c: any) => c.user_id))];

    let profileMap: Record<string, { username: string; display_name?: string }> = {};
    if (uniqueUserIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', uniqueUserIds);
      if (profilesData) {
        profilesData.forEach((p: any) => { profileMap[p.id] = p; });
      }
    }

    const formatted = (postsData || []).map((post: any) => {
      const likes = post.likes || [];
      const comments = (post.comments || []).map((c: any) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        user_id: c.user_id,
        username: profileMap[c.user_id]?.username || 'utente',
        display_name: profileMap[c.user_id]?.display_name,
      }));

      return {
        ...post,
        likes_count: likes.length,
        liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: comments.length,
        comments,
      };
    });

    setHasMore((postsData || []).length === PAGE_SIZE);

    if (append) {
      setPosts(prev => [...prev, ...formatted]);
      setLoadingMore(false);
    } else {
      setPosts(formatted);
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!currentUser || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await loadPosts(currentUser.id, nextPage, true, feedFilter);
  };

  const handleFilterChange = async (filter: 'all' | 'following') => {
    if (!currentUser) return;
    setFeedFilter(filter);
    setPage(0);
    setHasMore(true);
    await loadPosts(currentUser.id, 0, false, filter);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newPostContent.trim() && !selectedImage) || !currentUser || isPublishing) return;

    setIsPublishing(true);

    let imageUrl = null;
    if (selectedImage) {
      const fileName = `${Date.now()}-${selectedImage.name}`;
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(fileName, selectedImage);

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;
      }
    }

    const { data: newPostData, error } = await supabase
      .from('posts')
      .insert({
        user_id: currentUser.id,
        content: newPostContent.trim(),
        image_url: imageUrl,
      })
      .select(`
        id, content, image_url, created_at,
        profiles!posts_user_id_fkey (username, display_name, avatar_url)
      `)
      .single();

    if (!error && newPostData) {
      const profile = Array.isArray(newPostData.profiles)
        ? newPostData.profiles[0]
        : newPostData.profiles;

      const optimisticPost: Post = {
        id: newPostData.id,
        content: newPostData.content,
        image_url: newPostData.image_url,
        created_at: newPostData.created_at,
        profiles: {
          username: profile?.username || '',
          display_name: profile?.display_name,
          avatar_url: profile?.avatar_url,
        },
        likes_count: 0,
        comments_count: 0,
        liked_by_user: false,
        comments: [],
      };

      setPosts(prev => [optimisticPost, ...prev]);
      setNewPostContent('');
      setSelectedImage(null);
      setImagePreview(null);
    }

    setIsPublishing(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleLike = async (postId: string) => {
    if (!currentUser) return;

    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) return;

    const current = posts[postIndex];
    const willLike = !current.liked_by_user;

    const newPosts = [...posts];
    newPosts[postIndex] = {
      ...current,
      likes_count: willLike ? current.likes_count + 1 : current.likes_count - 1,
      liked_by_user: willLike,
    };
    setPosts(newPosts);

    if (willLike) {
      await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id });
    } else {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!commentContent.trim() || !currentUser) return;

    const newCommentTemp: Comment = {
      id: 'temp-' + Date.now(),
      content: commentContent.trim(),
      created_at: new Date().toISOString(),
      user_id: currentUser.id,
      username: currentProfile?.username || 'utente',
      display_name: currentProfile?.display_name,
    };

    setPosts(prev =>
      prev.map(post =>
        post.id === postId
          ? { ...post, comments_count: post.comments_count + 1, comments: [newCommentTemp, ...post.comments] }
          : post
      )
    );

    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: currentUser.id,
      content: commentContent.trim(),
    });

    if (error) {
      setPosts(prev =>
        prev.map(post =>
          post.id === postId
            ? {
                ...post,
                comments_count: Math.max(0, post.comments_count - 1),
                comments: post.comments.filter(c => c.id !== newCommentTemp.id),
              }
            : post
        )
      );
    }

    setCommentContent('');
    setCommentingPostId(null);
  };

  const avatarInitial = (currentProfile?.display_name?.[0] || currentProfile?.username?.[0] || '?').toUpperCase();

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      <div className="pt-6 pb-24 md:pb-10 max-w-2xl mx-auto px-4">

        {/* Post composer */}
        {currentUser && (
          <div className="mb-6 glass border border-white/8 rounded-3xl p-4 sm:p-5">
            <div className="flex gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 ring-2 ring-violet-500/20">
                {currentProfile?.avatar_url ? (
                  <img src={currentProfile.avatar_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
                    {avatarInitial}
                  </div>
                )}
              </div>

              <form onSubmit={handleCreatePost} className="flex-1 flex flex-col gap-3">
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Cosa bolle nel tuo calderone geek oggi?"
                  rows={3}
                  className="w-full bg-transparent text-sm sm:text-base placeholder-zinc-600 text-white resize-none focus:outline-none leading-relaxed"
                />

                {imagePreview && (
                  <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black">
                    <img src={imagePreview} alt="preview" className="max-h-80 w-full object-contain" />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-red-600 p-1.5 rounded-full transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <label className="cursor-pointer p-2 text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 rounded-xl transition-all">
                    <ImageIcon size={18} />
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                  </label>

                  <button
                    type="submit"
                    disabled={isPublishing || (!newPostContent.trim() && !selectedImage)}
                    className="px-5 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition-all flex items-center gap-2"
                  >
                    {isPublishing ? (
                      <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Invio...</>
                    ) : (
                      'Pubblica'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Feed filter */}
        {currentUser && (
          <div className="flex gap-1 mb-6 bg-zinc-900/60 border border-white/6 rounded-2xl p-1 w-fit">
            <button
              onClick={() => handleFilterChange('all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                feedFilter === 'all'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Globe size={14} />
              Tutti
            </button>
            <button
              onClick={() => handleFilterChange('following')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                feedFilter === 'following'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Users size={14} />
              Following
            </button>
          </div>
        )}

        {/* Posts */}
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-5 bg-violet-500/10 border border-violet-500/20 rounded-3xl flex items-center justify-center">
                <Sparkles size={28} className="text-violet-400" />
              </div>
              {feedFilter === 'following' ? (
                <>
                  <p className="text-lg font-semibold">Nessun post dai tuoi following</p>
                  <p className="text-zinc-600 mt-2 text-sm">Inizia a seguire qualcuno per vedere i loro post qui.</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">Il feed è vuoto</p>
                  <p className="text-zinc-600 mt-2 text-sm">Sii il primo a condividere qualcosa!</p>
                </>
              )}
            </div>
          ) : (
            posts.map((post) => {
              const timeAgo = post.created_at
                ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: it })
                : '';
              const initials = (post.profiles.display_name?.[0] || post.profiles.username?.[0] || '?').toUpperCase();

              return (
                <article
                  key={post.id}
                  className="bg-zinc-900/60 border border-white/6 rounded-3xl overflow-hidden hover:border-violet-500/20 transition-all duration-300 backdrop-blur-sm"
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 p-4 sm:p-5 pb-3">
                    <Link href={`/profile/${post.profiles.username}`} className="shrink-0">
                      <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-white/5 hover:ring-violet-500/40 transition-all">
                        {post.profiles.avatar_url ? (
                          <img src={post.profiles.avatar_url} alt="" className="object-cover w-full h-full" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
                            {initials}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/profile/${post.profiles.username}`} className="hover:text-violet-400 transition-colors">
                        <p className="font-semibold text-sm text-white truncate">
                          {post.profiles.display_name || post.profiles.username}
                        </p>
                      </Link>
                      <p className="text-xs text-zinc-600 mt-0.5">@{post.profiles.username} · {timeAgo}</p>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="px-4 sm:px-5 pb-3">
                    <p className="text-sm sm:text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap">{post.content}</p>
                  </div>

                  {/* Image */}
                  {post.image_url && (
                    <div className="mx-3 mb-3 rounded-2xl overflow-hidden border border-white/5">
                      <img
                        src={post.image_url}
                        alt=""
                        className="w-full max-h-[400px] object-cover hover:scale-[1.01] transition-transform duration-500"
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 px-3 sm:px-4 py-3 border-t border-white/5">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all group ${
                        post.liked_by_user
                          ? 'text-orange-400 bg-orange-500/10'
                          : 'text-zinc-500 hover:text-orange-400 hover:bg-orange-500/10'
                      }`}
                    >
                      <Flame size={16} className={post.liked_by_user ? 'fill-orange-400' : 'group-hover:scale-110 transition-transform'} />
                      {post.likes_count}
                    </button>

                    <button
                      onClick={() => setCommentingPostId(commentingPostId === post.id ? null : post.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all group ${
                        commentingPostId === post.id
                          ? 'text-violet-400 bg-violet-500/10'
                          : 'text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10'
                      }`}
                    >
                      <MessageCircle size={16} className="group-hover:scale-110 transition-transform" />
                      {post.comments_count}
                    </button>
                  </div>

                  {/* Comments section */}
                  {commentingPostId === post.id && (
                    <div className="px-4 sm:px-5 pb-4 border-t border-white/5 pt-3 bg-black/20">
                      {post.comments.length > 0 && (
                        <div className="space-y-2.5 mb-3 max-h-48 overflow-y-auto">
                          {post.comments.map((comment) => (
                            <div key={comment.id} className="flex gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-white/5 flex items-center justify-center text-[10px] font-bold text-violet-300 shrink-0">
                                {(comment.display_name?.[0] || comment.username?.[0] || '?').toUpperCase()}
                              </div>
                              <div className="bg-zinc-900 border border-white/5 rounded-2xl px-3 py-2 flex-1">
                                <Link href={`/profile/${comment.username}`} className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors">
                                  @{comment.username || 'user'}
                                </Link>
                                <p className="text-zinc-300 text-xs mt-0.5">{comment.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="relative flex gap-2">
                        <input
                          type="text"
                          value={commentContent}
                          onChange={(e) => setCommentContent(e.target.value)}
                          placeholder="Scrivi un commento..."
                          className="flex-1 bg-zinc-900 border border-white/8 focus:border-violet-500/50 rounded-2xl py-2.5 px-4 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddComment(post.id);
                            }
                          }}
                        />
                        <button
                          onClick={() => handleAddComment(post.id)}
                          disabled={!commentContent.trim()}
                          className="px-3 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-2xl transition-colors shrink-0"
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {/* Load more */}
        {hasMore && posts.length > 0 && (
          <div className="flex justify-center mt-8">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="group flex items-center gap-2 px-6 py-3 bg-zinc-900/60 hover:bg-zinc-800/60 border border-white/8 hover:border-violet-500/30 rounded-2xl text-sm font-medium transition-all disabled:opacity-50"
            >
              {loadingMore ? (
                <><span className="w-3.5 h-3.5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" /> Caricamento...</>
              ) : (
                <>Carica altri post</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
