'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function FeedPage() {
  const [newPostContent, setNewPostContent] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;

    setLoading(true);
    const { error } = await supabase
      .from('posts')
      .insert({ content: newPostContent.trim() });

    if (!error) {
      setNewPostContent('');
      alert('Post pubblicato!');
    } else {
      alert('Errore: ' + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-8 pb-20 max-w-2xl mx-auto px-4">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Geekore Feed
          </h1>
        </div>

        {/* Form Nuovo Post */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-12">
          <form onSubmit={handleCreatePost}>
            <textarea
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="Cosa stai guardando, giocando o leggendo?"
              className="w-full bg-black border border-zinc-700 rounded-2xl p-5 text-lg placeholder-zinc-500 focus:outline-none focus:border-violet-500 min-h-[120px]"
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 py-4 rounded-2xl font-semibold text-lg disabled:opacity-50"
            >
              {loading ? 'Pubblicazione...' : 'Pubblica Post'}
            </button>
          </form>
        </div>

        <div className="text-center text-zinc-500 py-20">
          <Sparkles className="mx-auto mb-4" size={48} />
          <p>Il feed si sta caricando...</p>
          <p className="text-sm mt-2">Prova a pubblicare il tuo primo post sopra</p>
        </div>
      </div>
    </div>
  );
}