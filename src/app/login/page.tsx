// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      setMessage('Login effettuato con successo! Reindirizzamento...');
      setTimeout(() => {
        router.push('/profile');
      }, 1500);
    } catch (error: any) {
      setMessage('Errore: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
        <h1 className="text-3xl font-bold text-center mb-8">Accedi a Geekore</h1>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl focus:outline-none focus:border-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl focus:outline-none focus:border-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50"
          >
            {loading ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>

        {message && (
          <div className={`mt-6 p-4 rounded-xl text-center text-sm ${
            message.includes('successo') 
              ? 'bg-green-950 text-green-400' 
              : 'bg-red-950 text-red-400'
          }`}>
            {message}
          </div>
        )}

        <p className="text-center text-zinc-500 text-sm mt-6">
          Non hai un account? <a href="/register" className="text-white underline">Registrati</a>
        </p>
      </div>
    </div>
  );
}