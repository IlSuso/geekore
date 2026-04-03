"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Trophy, Loader2, Zap, Target, Clock, LogOut, Fingerprint, Activity, ImageOff } from 'lucide-react';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [games, setGames] = useState<any[]>([]);
  const [corePower, setCorePower] = useState(0);
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
          setCorePower(data.corePower || 0);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [session]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050507]">
        <Loader2 className="animate-spin text-[#7c6af7]" size={40} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] pt-12 pb-32 px-4 text-white uppercase italic">
      <div className="max-w-2xl mx-auto">
        
        {/* HEADER & CORE POWER */}
        <div className="relative p-[1px] bg-gradient-to-r from-transparent via-[#7c6af7]/50 to-transparent mb-10">
          <div className="bg-[#050507] py-8 px-4 flex flex-col md:flex-row items-center gap-8">
            <div className="relative">
                {session?.user?.image ? (
                    <img 
                    src={session.user.image} 
                    className="w-28 h-28 rounded-full border-2 border-[#7c6af7] object-cover shadow-[0_0_30px_rgba(124,106,247,0.3)]" 
                    alt="Avatar"
                    />
                ) : (
                    <div className="w-28 h-28 rounded-full border-2 border-[#7c6af7] bg-[#0d0d0f] flex items-center justify-center text-[#7c6af7]">
                        <Zap size={40} />
                    </div>
                )}
                <div className="absolute -bottom-2 -right-2 bg-[#7c6af7] text-black px-2 py-1 rounded text-[10px] font-black tracking-tighter">
                    {corePower}% PWR
                </div>
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                <Activity size={12} className="text-[#7c6af7]" />
                <span className="text-[9px] font-black tracking-[0.4em] text-[#7c6af7]">CORE_STATUS: ONLINE</span>
              </div>
              <h1 className="text-6xl font-black tracking-tighter leading-none mb-2 break-all">
                {session?.user?.name || "GUEST_UNIT"}
              </h1>
              <div className="flex items-center justify-center md:justify-start gap-4 opacity-40">
                <div className="flex items-center gap-1">
                    <Fingerprint size={12} />
                    <span className="text-[8px]">ID: {(session?.user as any)?.id || "0000"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!session ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-2xl bg-[#0d0d0f]/50">
            <p className="text-[10px] mb-8 opacity-50 tracking-[0.2em] font-black">COLLEGAMENTO MANCANTE</p>
            <button 
              onClick={() => signIn("steam")} 
              className="px-12 py-6 bg-white text-black rounded-2xl font-black text-xl hover:bg-[#7c6af7] hover:text-white transition-all shadow-[0_0_50px_rgba(124,106,247,0.2)]"
            >
              INITIALIZE_LINK
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-end border-b border-white/5 pb-4">
                <h2 className="text-xs font-black flex items-center gap-2 tracking-[0.3em]">
                <Target size={14} className="text-[#7c6af7]" /> ACTIVE_UNITS_DATA
                </h2>
                <span className="text-[9px] opacity-40">SORTED BY: PLAYTIME</span>
            </div>
            
            {loading ? (
              <div className="space-y-4 pt-10">
                {[1,2,3].map(i => (
                    <div key={i} className="h-32 bg-white/5 rounded-2xl animate-pulse" />
                ))}
                <p className="text-center text-[8px] tracking-[1em] text-[#7c6af7]">SYNCHRONIZING...</p>
              </div>
            ) : games.length === 0 ? (
                <div className="text-center py-20 border border-white/5 rounded-2xl bg-[#0d0d0f]">
                  <p className="opacity-30 text-[10px] tracking-widest uppercase font-black">Nessun dato rilevato o profilo privato</p>
                </div>
            ) : (
              <div className="grid gap-6">
                {games.map((game) => (
                  <div key={game.appid} className="group relative bg-[#0d0d0f] border border-white/5 rounded-2xl hover:border-[#7c6af7]/50 transition-all overflow-hidden flex flex-col md:flex-row">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#7c6af7]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Immagine Header HD e a colori */}
                    <div className="relative w-full md:w-48 h-28 shrink-0 overflow-hidden">
                      <img 
                        src={`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        alt={game.name}
                        onError={(e) => {
                            // Fallback all'icona se l'header non carica, anche se raro
                            (e.target as HTMLImageElement).src = `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`;
                            // Se fallisce anche l'icona, mostra placeholder
                            (e.target as HTMLImageElement).onerror = () => {
                                (e.target as HTMLImageElement).classList.add('hidden');
                                (e.target as HTMLImageElement).parentElement?.classList.add('flex','items-center','justify-center','bg-[#1a1a1c]');
                                const placeholder = document.createElement('div');
                                placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-off text-white/20"><line x1="2" x2="22" y1="2" y2="22"/><path d="M10.41 10.41a2 2 0 1 1 2.83 2.83"/><path d="M13.5 13.5 10 17H7.5"/><path d="M15 11h.01"/><path d="M16.51 21.51 18 20V11a2 2 0 0 0-2-2"/><path d="M19 19a2 2 0 0 0 0-4"/><path d="M21 21a2 2 0 0 1-2 2"/><path d="M3 6.13 4.13 5"/><path d="M3.59 3.59A2 2 0 0 0 2 5v11a2 2 0 0 0 2 2h11a2 2 0 0 0 1.59-.59"/><path d="M5 21a2 2 0 0 0 2-2"/></svg>';
                                (e.target as HTMLImageElement).parentElement?.appendChild(placeholder.firstChild as Node);
                            }
                        }}
                      />
                       <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent md:hidden"></div>
                    </div>

                    <div className="relative flex-1 p-5 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2 gap-4">
                          <h3 className="font-black text-[16px] truncate uppercase">{game.name}</h3>
                          <div className="flex items-center gap-1.5 text-[#7c6af7] shrink-0 font-black">
                            <Clock size={14} />
                            <span className="text-[12px]">{(game.playtime_forever / 60).toFixed(0)}H</span>
                          </div>
                        </div>
                        
                        <div className="h-1.5 bg-black rounded-full overflow-hidden border border-white/5 mb-3">
                          <div 
                            className="h-full bg-[#7c6af7] shadow-[0_0_15px_#7c6af7] transition-all duration-1000" 
                            style={{ width: `${game.percent}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-black mt-2">
                           <div className="flex gap-5 opacity-50">
                                <span className="flex items-center gap-1">
                                    <Trophy size={11} /> {game.achieved}/{game.total}
                                </span>
                           </div>
                           <span className={game.percent === 100 ? "text-[#7c6af7]" : "opacity-50"}>
                                {game.percent}% COMPLETE
                           </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <button 
              onClick={() => signOut()} 
              className="mt-20 w-full py-4 text-red-500/20 text-[9px] font-black hover:text-red-500 transition-all flex items-center justify-center gap-2 border border-red-500/5 rounded-full hover:border-red-500/20"
            >
              <LogOut size={14} /> TERMINATE_CORE_SESSION
            </button>
          </div>
        )}
      </div>
    </main>
  );
}