"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Trophy, Loader2, Zap, Target, Clock, LogOut, Fingerprint } from 'lucide-react';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // @ts-ignore
    const sId = session?.user?.id;
    if (sId) {
      setLoading(true);
      fetch(`/api/steam?steamId=${sId}`)
        .then((res) => res.json())
        .then((data) => {
          setGames(data.games || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [session]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050507]">
        <Loader2 className="animate-spin text-[#7c6af7]" size={32} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] pt-12 pb-32 px-4 text-white uppercase italic">
      <div className="max-w-2xl mx-auto">
        
        {/* HEADER PROFILO */}
        <div className="relative p-[1px] bg-gradient-to-r from-transparent via-[#7c6af7]/50 to-transparent mb-10">
          <div className="bg-[#050507] py-8 px-2 flex flex-col md:flex-row items-center gap-6">
            {session?.user?.image && (
              <img 
                src={session.user.image} 
                alt="User Avatar"
                className="w-24 h-24 rounded-full border-2 border-[#7c6af7] object-cover shadow-[0_0_20px_rgba(124,106,247,0.2)]" 
              />
            )}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                <Zap size={12} className="text-[#7c6af7] fill-[#7c6af7]" />
                <span className="text-[9px] font-black tracking-[0.4em] text-[#7c6af7]">CORE_LINKED</span>
              </div>
              <h1 className="text-5xl font-black tracking-tighter leading-none mb-2">
                {session?.user?.name || "GUEST"}
              </h1>
              {session?.user && (
                <div className="flex items-center justify-center md:justify-start gap-2 opacity-40">
                  <Fingerprint size={12} />
                  <span className="text-[8px]">ID: {(session.user as any).id}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {!session ? (
          <div className="text-center py-20">
            <p className="text-[10px] mb-8 opacity-50 tracking-[0.2em]">Sincronizzazione necessaria per accedere ai dati core</p>
            <button 
              onClick={() => signIn("steam")} 
              className="px-12 py-6 bg-white text-black rounded-full font-black hover:bg-[#7c6af7] hover:text-white transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            >
              INITIALIZE_LINK
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xs font-black mb-6 flex items-center gap-2 tracking-[0.3em]">
              <Target size={14} className="text-[#7c6af7]" /> ACTIVE_UNITS
            </h2>
            
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-[#7c6af7]" size={32} />
              </div>
            ) : games.length === 0 ? (
              <div className="text-center py-20 border border-white/5 rounded-2xl bg-[#0d0d0f]">
                <p className="opacity-30 text-[10px] tracking-widest uppercase font-black">Nessun dato rilevato / Profilo Privato</p>
              </div>
            ) : (
              games.map((game) => (
                <div key={game.appid} className="bg-[#0d0d0f] border border-white/5 p-5 rounded-2xl hover:border-[#7c6af7]/40 transition-all group">
                  <div className="flex gap-5 items-center">
                    <img 
                      src={`https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`} 
                      className="w-16 h-16 rounded-lg grayscale group-hover:grayscale-0 transition-all object-cover"
                      alt={game.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`;
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-black text-[13px] truncate uppercase pr-4">{game.name}</h3>
                        <div className="flex items-center gap-1 text-[#7c6af7] shrink-0">
                          <Clock size={12} />
                          <span className="text-[11px]">{(game.playtime_forever / 60).toFixed(1)}H</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                        <div 
                          className="h-full bg-[#7c6af7] shadow-[0_0_10px_#7c6af7] transition-all duration-1000" 
                          style={{ width: `${game.percent}%` }}
                        ></div>
                      </div>
                      <div className="flex gap-4 mt-3 text-[8px] font-black text-gray-500 uppercase">
                        <div className="flex items-center gap-1">
                          <Trophy size={10} className="text-[#7c6af7]" /> 
                          {game.achieved} / {game.total} ACHIEVEMENTS
                        </div>
                        <div className="text-[#7c6af7]">{game.percent}% COMPLETE</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            
            <button 
              onClick={() => signOut()} 
              className="mt-16 w-full py-4 text-red-500/30 text-[9px] font-black hover:text-red-500 transition-all flex items-center justify-center gap-2 border border-red-500/10 rounded-full hover:border-red-500/40"
            >
              <LogOut size={14} /> TERMINATE_SESSION
            </button>
          </div>
        )}
      </div>
    </main>
  );
}