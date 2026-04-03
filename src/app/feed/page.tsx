'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { Heart, MessageCircle, Send, Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';

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
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles!posts_user_id_fkey (username, display_name, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Errore:', error);
    } else {
      const formattedPosts = (data || []).map((post: any) => ({
        ...post,
        likes_count: 0,
        comments_count: 0,
      }));
      setPosts(formattedPosts);
    }
    setLoading(false);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() || !currentUser) return;

    const { error } = await supabase
      .from('posts')
      .insert({
        user_id: currentUser.id,
        content: newPostContent.trim(),
      });

    if (!error) {
      setNewPostContent('');
      fetchPosts();
    } else {
      alert('Errore: ' + error.message);
    }
  };

  const toggleLike = () => {
    alert("Funzionalità Like in fase di sviluppo");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Sparkles className="w-12 h-12 text-violet-500 animate-pulse" />
          <p className="mt-6 text-zinc-400">Caricamento dal cyberspazio geek...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="pt-24 pb-20 max-w-3xl mx-auto px-6">
        {/* Form Nuovo Post */}
        {currentUser && (
          <div className="mb-12 bg-zinc-950/80 border border-violet-500/30 rounded-3xl p-8 backdrop-blur-xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 p-0.5">
                <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center text-2xl">
                  👾
                </div>
              </div>
              <div>
                <p className="font-semibold text-xl">Cosa bolle nel tuo calderone geek oggi?</p>
              </div>
            </div>

            <form onSubmit={handleCreatePost}>
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="Sto finendo Solo Leveling... Ho sbloccato il platino su Elden Ring... Qual è la tua ultima ossessione?"
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl p-6 text-lg placeholder-zinc-500 min-h-[140px] resize-y focus:outline-none"
              />
              <button
                type="submit"
                className="mt-6 w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 hover:brightness-110 font-semibold py-4 rounded-2xl text-lg flex items-center justify-center gap-3 transition-all"
              >
                <Send size={22} />
                Pubblica nel Feed
              </button>
            </form>
          </div>
        )}

        {/* Lista Post */}
        <div className="space-y-8">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-7xl mb-6">🌌</div>
              <p className="text-2xl font-medium">Il feed è ancora vuoto...</p>
              <p className="text-zinc-500 mt-3">Sii il primo a condividere la tua passione geek!</p>
            </div>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className="bg-zinc-950 border border-zinc-800 hover:border-violet-500/50 rounded-3xl p-8 transition-all duration-300"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-violet-500/30">
                    {post.profiles.avatar_url ? (
                      <img src={post.profiles.avatar_url} alt="avatar" className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-3xl">
                        👤
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-xl">{post.profiles.display_name || post.profiles.username}</p>
                    <p className="text-violet-400 text-sm">@{post.profiles.username}</p>
                  </div>
                </div>

                <p className="text-[17px] leading-relaxed text-zinc-100 mb-8 whitespace-pre-wrap">
                  {post.content}
                </p>

                <div className="flex items-center gap-10 pt-6 border-t border-zinc-800 text-zinc-400">
                  <button
                    onClick={toggleLike}
                    className="flex items-center gap-3 hover:text-red-500 transition-all hover:scale-110"
                  >
                    <Heart size={26} />
                    <span className="text-lg">{post.likes_count}</span>
                  </button>

                  <button
                    onClick={() => setCommentingPostId(commentingPostId === post.id ? null : post.id)}
                    className="flex items-center gap-3 hover:text-cyan-400 transition-all hover:scale-110"
                  >
                    <MessageCircle size={26} />
                    <span className="text-lg">{post.comments_count}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}