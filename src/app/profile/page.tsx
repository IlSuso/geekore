"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Trophy, Loader2, Target, Clock, LogOut, User } from 'lucide-react';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [games, setGames] = useState<any[]>([]);
  const [completionAverage, setCompletionAverage] = useState(0);
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
          setCompletionAverage(data.corePower || 0);
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
    <main className="min-h-screen bg-[#050507] pt-12 pb-32 px-4 text-white uppercase italic font-medium">
      <div className="max-w-2xl mx-auto">
        
        {/* PROFILO UTENTE */}
        <div className="mb-12 border-b border-white/5 pb-10">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="relative shrink-0">
                <img 
                  src={session?.user?.image || ""} 
                  className="w-28 h-28 rounded-full border border-white/10 object-cover shadow-2xl" 
                  alt="Avatar"
                />
                <div className="absolute -bottom-1 -right-1 bg-white text-black px-2 py-1 rounded font-black text-[10px]">
                    {completionAverage}%
                </div>
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <span className="text-[10px] tracking-[0.3em] text-[#7c6af7] font-black">STEAM PROFILE</span>
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-none mt-2">
                {session?.user?.name || "GUEST"}
              </h1>
            </div>
          </div>
        </div>

        {!session ? (
          <div className="text-center py-12">
            <button 
              onClick={() => signIn("steam")} 
              className="w-full py-8 bg-white text-black rounded-xl font-black text-xl hover:bg-[#7c6af7] hover:text-white transition-all shadow-xl"
            >
              COLLEGA ACCOUNT STEAM
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-xs font-black tracking-[0.2em] flex items-center gap-2">
                  <Target size={14} /> GIOCHI RECENTI
                </h2>
                <div className="h-px flex-1 bg-white/5 mx-4 hidden sm:block"></div>
                <span className="text-[9px] opacity-40">ORDINA PER ORE</span>
            </div>
            
            {loading ? (
              <div className="space-y-4 pt-10">
                {[1,2,3].map(i => <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <div className="grid gap-5">
                {games.map((game) => (
                  <div key={game.appid} className="group relative bg-[#0d0d0f] border border-white/5 rounded-xl hover:border-white/20 transition-all overflow-hidden flex flex-col sm:flex-row shadow-sm">
                    {/* Immagine Header HD */}
                    <div className="relative w-full sm:w-48 h-32 sm:h-auto overflow-hidden shrink-0">
                      <img 
                        src={`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt={game.name}
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg` }}
                      />
                    </div>

                    <div className="flex-1 p-5 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex justify-between items-start gap-4 mb-4">
                          <h3 className="font-black text-lg leading-tight truncate">{game.name}</h3>
                          <div className="flex items-center gap-1.5 text-white/50 font-black shrink-0">
                            <Clock size={14} />
                            <span className="text-xs">{(game.playtime_forever / 60).toFixed(0)}H</span>
                          </div>
                        </div>
                        
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-2">
                          <div 
                            className={`h-full transition-all duration-1000 ${
                                game.percent === 100 ? 'bg-white' : 'bg-[#7c6af7]'
                            }`}
                            style={{ width: `${game.percent}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center mt-2 text-[10px] font-black tracking-widest">
                        <div className="flex gap-4 opacity-40">
                          <span className="flex items-center gap-1"><Trophy size={11}/> {game.achieved}/{game.total}</span>
                        </div>
                        <span className={game.percent === 100 ? "text-white" : "text-[#7c6af7]"}>
                            {game.percent}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <button 
              onClick={() => signOut()} 
              className="mt-20 w-full py-4 text-white/20 text-[10px] font-black hover:text-white transition-all border border-white/5 rounded-lg hover:bg-white/5"
            >
              DISCONNETTI ACCOUNT
            </button>
          </div>
        )}
      </div>
    </main>
  );
}