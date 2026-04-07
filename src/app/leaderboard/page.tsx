"use client";

import { useEffect, useState } from "react";
import { createClient } from '@/lib/supabase/client';
import { Trophy, Medal, Loader2, Award } from "lucide-react";

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaders = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('core_power', { ascending: false })
        .limit(50);
      
      if (!error && data) setLeaders(data);
      setLoading(false);
    };
    fetchLeaders();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#050507]">
      <Loader2 className="animate-spin text-[#7c6af7]" size={40} />
    </div>
  );

  return (
    <main className="min-h-screen bg-[#050507] pt-24 pb-32 px-4 text-white uppercase italic">
      <div className="max-w-2xl mx-auto">
        <div className="mb-12 border-b border-white/5 pb-8">
          <span className="text-[10px] tracking-[0.3em] text-[#7c6af7] font-black">GLOBAL RANKING</span>
          <h1 className="text-5xl font-black tracking-tighter leading-none mt-2">CLASSIFICA</h1>
        </div>

        <div className="space-y-4">
          {leaders.length === 0 ? (
            <div className="text-center py-20 opacity-20 text-xs tracking-widest font-black">
              NESSUN DATO IN ARCHIVIO
            </div>
          ) : (
            leaders.map((user, index) => (
              <div key={user.steam_id} className="bg-[#0d0d0f] border border-white/5 p-5 rounded-xl flex items-center gap-6 transition-all hover:border-white/20">
                <div className="text-xl font-black opacity-20 w-8 flex justify-center">
                  {index === 0 ? <Trophy size={20} className="text-yellow-500 opacity-100" /> : `#${index + 1}`}
                </div>
                <img src={user.avatar_url} className="w-12 h-12 rounded-full border border-white/10" alt={`Avatar di ${user.username}`} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-lg truncate">{user.username}</h3>
                  <div className="flex items-center gap-2 opacity-30 text-[8px] tracking-widest">
                    <Award size={10} /> DATI SINCRONIZZATI
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-black ${index === 0 ? 'text-yellow-500' : 'text-[#7c6af7]'}`}>
                    {user.core_power ?? 0}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}