// src/app/profile/edit/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';

interface Profile {
  id: string;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  steam_id?: string | null;
  steam_username?: string | null;
}

export default function EditProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        window.location.href = '/login';
        return;
      }

      setUser(user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(profileData as Profile | null);
      setProfilePic(profileData?.avatar_url || null);
      setLoading(false);
    };

    checkSession();
  }, []);

  // Le tre funzioni handle (upload, remove, disconnect) rimangono uguali a prima
  // Per brevità le ho omesse qui. Se vuoi te le rimando complete.

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Caricamento...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 min-h-screen bg-zinc-950 text-white">
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Modifica Profilo</h1>
          <Link href="/profile">
            <button className="text-sm text-zinc-400 hover:text-white">← Torna al profilo</button>
          </Link>
        </div>

        {/* Foto profilo + Steam - stesso codice di prima */}
        {/* ... copia qui la parte UI con Avatar, pulsanti Cambia foto, Rimuovi, Disconnetti Steam ... */}

        {message && (
          <div className={`p-4 rounded-2xl text-center text-sm border mt-6 ${
            message.includes('successo') ? 'bg-green-950 border-green-800 text-green-400' : 'bg-red-950 border-red-800 text-red-400'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}