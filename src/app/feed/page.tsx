'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { Heart, MessageCircle, Send, Sparkles, Image as ImageIcon, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

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

    // Se filtro following, prima recupera gli ID degli utenti seguiti
    let followingIds: string[] = [];
    if (filter === 'following') {
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);
      followingIds = (followsData || []).map((f: any) => f.following_id);
      // Se non segue nessuno, mostra lista vuota subito
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

    // Per i commenti recuperiamo i profili in una query sola
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
      // Fix del tipo: profiles è un oggetto singolo, non un array
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

      // Aggiungi in cima con animazione
      setPosts(prev => [optimisticPost, ...prev]);

      // Reset form
      setNewPostContent('');
      setSelectedImage(null);
      setImagePreview(null);
    } else {
      alert('Errore nella pubblicazione: ' + (error?.message || 'Errore sconosciuto'));
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
          ? {
              ...post,
              comments_count: post.comments_count + 1,
              comments: [newCommentTemp, ...post.comments],
            }
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
      alert('Errore nell’invio del commento: ' + error.message);
    }

    setCommentContent('');
    setCommentingPostId(null);
  };

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-8 pb-20 max-w-3xl mx-auto px-6">
        {currentUser && (
          <div className="mb-12 bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
            <form onSubmit={handleCreatePost}>
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="Cosa bolle nel tuo calderone geek oggi?"
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl p-6 text-lg min-h-[140px] resize-y focus:outline-none"
              />
              {imagePreview && (
                <div className="mt-4 relative rounded-2xl overflow-hidden border border-zinc-700 bg-black">
                  <img src={imagePreview} alt="preview" className="max-h-96 w-full object-contain" />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-3 right-3 bg-black/80 p-2 rounded-full hover:bg-red-600 transition"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
              <div className="flex gap-4 mt-6">
                <label className="cursor-pointer flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 py-4 rounded-2xl flex items-center justify-center gap-3 transition">
                  <ImageIcon size={22} />
                  <span>Aggiungi immagine</span>
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                </label>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="flex-1 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:brightness-110 disabled:opacity-70 transition"
                >
                  {isPublishing ? 'Pubblicazione in corso...' : 'Pubblica'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-8">
          {/* Toggle Tutti / Following */}
          {currentUser && (
            <div className="flex gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5 w-fit">
              <button
                onClick={() => handleFilterChange('all')}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  feedFilter === 'all'
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Tutti
              </button>
              <button
                onClick={() => handleFilterChange('following')}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  feedFilter === 'following'
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Following
              </button>
            </div>
          )}
          {posts.length === 0 ? (
            <div className="text-center py-24">
              <Sparkles className="mx-auto mb-6 text-violet-500" size={60} />
              {feedFilter === 'following' ? (
                <>
                  <p className="text-2xl font-medium">Nessun post dai tuoi following</p>
                  <p className="text-zinc-500 mt-3">Inizia a seguire qualcuno per vedere i loro post qui.</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-medium">Il feed è vuoto</p>
                  <p className="text-zinc-500 mt-3">Sii il primo a condividere qualcosa!</p>
                </>
              )}
            </div>
          ) : (
            posts.map((post) => (
              <div 
                key={post.id} 
                className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 transition-all duration-500 ease-out animate-in fade-in slide-in-from-top-4"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-violet-500/30">
                    {post.profiles.avatar_url ? (
                      <img src={post.profiles.avatar_url} alt="" className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-xl">
                        {post.profiles.display_name?.[0]?.toUpperCase() || post.profiles.username?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-xl">{post.profiles.display_name || post.profiles.username}</p>
                    <p className="text-sm text-zinc-500">
                      @{post.profiles.username} • {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: it })}
                    </p>
                  </div>
                </div>

                <p className="text-[17px] leading-relaxed mb-8 whitespace-pre-wrap">{post.content}</p>

                {post.image_url && (
                  <div className="mb-8 rounded-2xl overflow-hidden border border-zinc-700">
                    <img src={post.image_url} alt="post" className="w-full max-h-[500px] object-contain bg-black" />
                  </div>
                )}

                <div className="flex gap-10 border-t border-zinc-800 pt-6 text-zinc-400">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`flex items-center gap-3 hover:text-red-500 transition ${post.liked_by_user ? 'text-red-500' : ''}`}
                  >
                    <Heart size={26} fill={post.liked_by_user ? 'currentColor' : 'none'} />
                    <span>{post.likes_count}</span>
                  </button>
                  <button
                    onClick={() => setCommentingPostId(commentingPostId === post.id ? null : post.id)}
                    className="flex items-center gap-3 hover:text-cyan-400 transition"
                  >
                    <MessageCircle size={26} />
                    <span>{post.comments_count}</span>
                  </button>
                </div>

                {commentingPostId === post.id && (
                  <div className="mt-6 flex gap-3">
                    <input
                      type="text"
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      placeholder="Scrivi un commento..."
                      className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-cyan-400 rounded-2xl px-5 py-3 focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment(post.id);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleAddComment(post.id)}
                      className="bg-violet-600 hover:bg-violet-700 px-6 rounded-2xl font-medium flex items-center gap-2"
                    >
                      <Send size={18} /> Invia
                    </button>
                  </div>
                )}

                {post.comments && post.comments.length > 0 && (
                  <div className="mt-6 pl-4 border-l-2 border-zinc-700 space-y-4 text-sm">
                    {post.comments.map((comment, cIndex) => (
                      <div 
                        key={comment.id} 
                        className="flex flex-col animate-in fade-in slide-in-from-left-2"
                        style={{ animationDelay: `${cIndex * 30}ms` }}
                      >
                        <div>
                          <span className="font-medium text-violet-400">
                            @{comment.username || 'utente'}
                          </span>
                          <span className="ml-2 text-zinc-200">{comment.content}</span>
                        </div>
                        <span className="text-xs text-zinc-500 mt-1">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: it })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pulsante carica altri */}
        {hasMore && posts.length > 0 && (
          <div className="flex justify-center mt-10">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-10 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-2xl font-medium transition disabled:opacity-50 flex items-center gap-3"
            >
              {loadingMore ? (
                <>
                  <Sparkles size={18} className="animate-pulse text-violet-400" />
                  Caricamento...
                </>
              ) : (
                'Carica altri post'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}