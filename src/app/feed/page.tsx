'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { Heart, MessageCircle, Send, Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

type Post = {
  id: string;
  content: string;
  created_at: string;
  profiles: { username: string; display_name: string; avatar_url?: string };
  likes_count: number;
  comments_count: number;
  liked_by_user: boolean;
};

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState('');

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
    // Query semplificata per stabilità
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id, content, created_at,
        profiles!posts_user_id_fkey (username, display_name, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) console.error(error);
    else {
      const formatted = (data || []).map((post: any) => ({
        ...post,
        likes_count: 0,
        comments_count: 0,
        liked_by_user: false,
      }));
      setPosts(formatted);
    }
    setLoading(false);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() || !currentUser) return;

    await supabase.from('posts').insert({ user_id: currentUser.id, content: newPostContent.trim() });
    setNewPostContent('');
    fetchPosts(currentUser.id);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Sparkles className="w-12 h-12 text-violet-500 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="pt-20 pb-20 max-w-3xl mx-auto px-6">
        {currentUser && (
          <div className="mb-12 bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
            <form onSubmit={handleCreatePost}>
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="Cosa bolle nel tuo calderone geek oggi?"
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl p-6 text-lg min-h-[130px] resize-y focus:outline-none"
              />
              <button
                type="submit"
                className="mt-6 w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:brightness-110"
              >
                <Send size={22} /> Pubblica nel Feed
              </button>
            </form>
          </div>
        )}

        <div className="space-y-8">
          {posts.map((post) => (
            <div key={post.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-violet-500/30">
                  {post.profiles.avatar_url ? <img src={post.profiles.avatar_url} className="object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-3xl">👤</div>}
                </div>
                <div>
                  <p className="font-bold">{post.profiles.display_name || post.profiles.username}</p>
                  <p className="text-sm text-zinc-500">@{post.profiles.username} • {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: it })}</p>
                </div>
              </div>
              <p className="text-[17px] leading-relaxed mb-8">{post.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}