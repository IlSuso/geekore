'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { Heart, MessageCircle, Send, Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';

type Comment = {
  id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
  };
};

type Post = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
  likes_count: number;
  comments_count: number;
  liked_by_user: boolean;
  comments?: Comment[];
};

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState('');
  const [expandedComments, setExpandedComments] = useState<string[]>([]);

  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (user) await fetchPosts(user.id);
    };
    init();
  }, []);

  const fetchPosts = async (userId: string) => {
    setLoading(true);

    const { data, error } = await supabase
      .from('posts')
      .select(`
        id, content, created_at, user_id,
        profiles!posts_user_id_fkey (username, display_name, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const formattedPosts = await Promise.all(
      (data || []).map(async (post: any) => {
        const { count: likesCount } = await supabase
          .from('likes').select('*', { count: 'exact', head: true }).eq('post_id', post.id);

        const { count: commentsCount } = await supabase
          .from('comments').select('*', { count: 'exact', head: true }).eq('post_id', post.id);

        const { data: commentsData } = await supabase
          .from('comments')
          .select(`id, content, created_at, profiles!comments_user_id_fkey (username, display_name)`)
          .eq('post_id', post.id)
          .order('created_at', { ascending: true })
          .limit(5);

        const { data: userLike } = await supabase
          .from('likes')
          .select('id')
          .eq('post_id', post.id)
          .eq('user_id', userId)
          .maybeSingle();

        return {
          ...post,
          likes_count: likesCount || 0,
          comments_count: commentsCount || 0,
          liked_by_user: !!userLike,
          comments: commentsData || [],
        };
      })
    );

    setPosts(formattedPosts);
    setLoading(false);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() || !currentUser) return;

    await supabase.from('posts').insert({ user_id: currentUser.id, content: newPostContent.trim() });
    setNewPostContent('');
    fetchPosts(currentUser.id);
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

    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: currentUser.id,
      content: commentContent.trim(),
    });

    if (!error) {
      setCommentContent('');
      setCommentingPostId(null);
      fetchPosts(currentUser.id!);   // ricarica per vedere il nuovo commento
    }
  };

  const toggleCommentSection = (postId: string) => {
    setCommentingPostId(commentingPostId === postId ? null : postId);
    if (!expandedComments.includes(postId)) {
      setExpandedComments([...expandedComments, postId]);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><Sparkles className="w-12 h-12 text-violet-500 animate-pulse" /></div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="pt-24 pb-20 max-w-3xl mx-auto px-6">
        {/* Form nuovo post */}
        {currentUser && (
          <div className="mb-12 bg-zinc-950/80 border border-violet-500/30 rounded-3xl p-8">
            <form onSubmit={handleCreatePost}>
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="Cosa bolle nel tuo calderone geek oggi?"
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl p-6 text-lg min-h-[140px] resize-y focus:outline-none"
              />
              <button type="submit" className="mt-6 w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 py-4 rounded-2xl font-semibold flex items-center justify-center gap-3">
                <Send size={22} /> Pubblica
              </button>
            </form>
          </div>
        )}

        {/* Feed */}
        <div className="space-y-8">
          {posts.map((post) => (
            <div key={post.id} className="bg-zinc-950 border border-zinc-800 hover:border-violet-500/50 rounded-3xl p-8">
              {/* Post header e contenuto */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-violet-500/30">
                  {post.profiles.avatar_url ? <img src={post.profiles.avatar_url} className="object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-3xl">👤</div>}
                </div>
                <div>
                  <p className="font-bold text-xl">{post.profiles.display_name || post.profiles.username}</p>
                  <p className="text-violet-400 text-sm">@{post.profiles.username}</p>
                </div>
              </div>

              <p className="text-[17px] leading-relaxed mb-8">{post.content}</p>

              {/* Azioni */}
              <div className="flex gap-10 border-t border-zinc-800 pt-6 text-zinc-400">
                <button onClick={() => toggleLike(post.id)} className={`flex items-center gap-3 ${post.liked_by_user ? 'text-red-500' : 'hover:text-red-500'}`}>
                  <Heart size={26} fill={post.liked_by_user ? "currentColor" : "none"} />
                  <span>{post.likes_count}</span>
                </button>

                <button onClick={() => toggleCommentSection(post.id)} className="flex items-center gap-3 hover:text-cyan-400">
                  <MessageCircle size={26} />
                  <span>{post.comments_count}</span>
                </button>
              </div>

              {/* Sezione Commenti */}
              {commentingPostId === post.id && (
                <div className="mt-6">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      placeholder="Scrivi un commento..."
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 focus:outline-none focus:border-cyan-400"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                    />
                    <button onClick={() => handleAddComment(post.id)} className="bg-violet-600 px-6 rounded-2xl">Invia</button>
                  </div>

                  {/* Lista commenti esistenti */}
                  {post.comments && post.comments.length > 0 && (
                    <div className="mt-6 space-y-3 pl-4 border-l-2 border-zinc-700">
                      {post.comments.map((c) => (
                        <div key={c.id} className="text-sm">
                          <span className="font-medium text-violet-400">@{c.profiles.username}</span>
                          <span className="ml-2 text-zinc-300">{c.content}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}