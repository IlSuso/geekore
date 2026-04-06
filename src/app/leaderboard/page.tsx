"use client";

import { useEffect, useState } from "react";
import { createClient } from '@/lib/supabase/client';
import { Trophy, Medal, Loader2, Crown, Star } from "lucide-react";
import Link from "next/link";

const RANK_CONFIGS = [
  { gradient: 'from-yellow-400/20 to-amber-600/10', border: 'border-yellow-500/30', badge: 'bg-yellow-500', text: 'text-yellow-400', glow: 'shadow-yellow-500/20', icon: Crown, size: 52 },
  { gradient: 'from-zinc-400/10 to-zinc-600/5', border: 'border-zinc-500/20', badge: 'bg-zinc-400', text: 'text-zinc-300', glow: 'shadow-zinc-400/10', icon: Medal, size: 44 },
  { gradient: 'from-orange-400/10 to-amber-700/5', border: 'border-orange-600/20', badge: 'bg-orange-600', text: 'text-orange-400', glow: 'shadow-orange-500/10', icon: Star, size: 40 },
]

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaders = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('completion_rate', { ascending: false })
        .limit(50);

      if (!error && data) setLeaders(data);
      setLoading(false);
    };
    fetchLeaders();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#080810]">
      <Loader2 className="animate-spin text-violet-500" size={32} />
    </div>
  );

  const podium = leaders.slice(0, 3);
  const rest = leaders.slice(3);

  return (
    <main className="min-h-screen bg-[#080810] text-white">
      {/* Background glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none z-0">
        <div className="absolute top-10 left-1/3 w-64 h-64 bg-violet-600/10 rounded-full blur-[100px]" />
        <div className="absolute top-20 right-1/3 w-48 h-48 bg-yellow-500/8 rounded-full blur-[80px]" />
      </div>

      <div className="relative z-10 pt-8 sm:pt-20 pb-24 px-4 max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-10 sm:mb-14">
          <p className="text-[10px] tracking-[0.3em] text-violet-500 font-bold uppercase mb-2">Global Ranking</p>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter leading-none">
            <span className="grad-text">Classifica</span>
          </h1>
          <p className="text-zinc-600 mt-3 text-sm">I migliori completatori della community</p>
        </div>

        {leaders.length === 0 ? (
          <div className="text-center py-24 text-zinc-700">
            <Trophy className="mx-auto mb-4 opacity-20" size={48} />
            <p className="text-sm tracking-widest uppercase font-bold">Nessun dato in archivio</p>
          </div>
        ) : (
          <>
            {/* Podium — top 3 */}
            {podium.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-8 items-end">
                {/* 2nd place */}
                {podium[1] ? (
                  <div className="flex flex-col items-center gap-3 pt-6">
                    <div className="relative">
                      <img src={podium[1].avatar_url} className="w-14 h-14 rounded-2xl border-2 border-zinc-500/40 object-cover" alt="" />
                      <span className="absolute -bottom-2 -right-2 w-6 h-6 bg-zinc-400 rounded-lg flex items-center justify-center text-[10px] font-black text-black">2</span>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-zinc-300 truncate max-w-[80px]">{podium[1].username}</p>
                      <p className="text-lg font-black text-zinc-300">{podium[1].completion_rate}%</p>
                    </div>
                    <div className="w-full h-20 bg-gradient-to-t from-zinc-500/10 to-transparent border border-zinc-500/20 rounded-t-2xl" />
                  </div>
                ) : <div />}

                {/* 1st place */}
                {podium[0] && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <div className="absolute -inset-2 bg-yellow-500/20 rounded-3xl blur-lg" />
                      <img src={podium[0].avatar_url} className="relative w-20 h-20 rounded-2xl border-2 border-yellow-500/60 object-cover shadow-xl shadow-yellow-500/20" alt="" />
                      <Crown className="absolute -top-4 left-1/2 -translate-x-1/2 text-yellow-400" size={22} />
                      <span className="absolute -bottom-2 -right-2 w-7 h-7 bg-yellow-500 rounded-lg flex items-center justify-center text-[11px] font-black text-black">1</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-white truncate max-w-[96px]">{podium[0].username}</p>
                      <p className="text-2xl font-black text-yellow-400">{podium[0].completion_rate}%</p>
                    </div>
                    <div className="w-full h-32 bg-gradient-to-t from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-t-2xl" />
                  </div>
                )}

                {/* 3rd place */}
                {podium[2] ? (
                  <div className="flex flex-col items-center gap-3 pt-10">
                    <div className="relative">
                      <img src={podium[2].avatar_url} className="w-12 h-12 rounded-2xl border-2 border-orange-600/40 object-cover" alt="" />
                      <span className="absolute -bottom-2 -right-2 w-6 h-6 bg-orange-600 rounded-lg flex items-center justify-center text-[10px] font-black text-black">3</span>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-orange-300 truncate max-w-[80px]">{podium[2].username}</p>
                      <p className="text-lg font-black text-orange-400">{podium[2].completion_rate}%</p>
                    </div>
                    <div className="w-full h-14 bg-gradient-to-t from-orange-500/10 to-transparent border border-orange-600/20 rounded-t-2xl" />
                  </div>
                ) : <div />}
              </div>
            )}

            {/* Rest of leaderboard */}
            {rest.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] tracking-[0.25em] text-zinc-700 uppercase mb-4">Posizioni</p>
                {rest.map((user, i) => (
                  <div
                    key={user.steam_id || i}
                    className="group flex items-center gap-4 p-3.5 sm:p-4 bg-zinc-900/50 border border-white/5 hover:border-violet-500/20 rounded-2xl transition-all hover:bg-zinc-900/80"
                  >
                    <span className="text-sm font-black text-zinc-700 w-6 text-center shrink-0">
                      {i + 4}
                    </span>
                    <img src={user.avatar_url} className="w-10 h-10 rounded-xl border border-white/5 object-cover" alt="" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-white truncate">{user.username}</p>
                    </div>

                    {/* Progress bar */}
                    <div className="hidden sm:flex items-center gap-3 flex-1 max-w-[160px]">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all"
                          style={{ width: `${user.completion_rate}%` }}
                        />
                      </div>
                    </div>

                    <span className="text-base font-black text-violet-400 tabular-nums">{user.completion_rate}%</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
