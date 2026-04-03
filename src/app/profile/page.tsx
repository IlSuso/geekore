"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import useSWR from "swr";
import { Trophy, Clock, Target, Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { data: session } = useSession();
  // @ts-ignore
  const sId = session?.user?.id;

  // Recupera i dati dalla cache istantaneamente
  const { data, isValidating } = useSWR(
    sId ? `/api/steam?steamId=${sId}&username=${session?.user?.name}&avatar=${session?.user?.image}` : null
  );

  const games = data?.games || [];
  const avg = data?.corePower || 0;

  if (!session) return (
    <div className="pt-32 text-center px-4">
      <button onClick={() => signIn("steam")} className="w-full py-8 bg-white text-black font-black rounded-xl">
        COLLEGA STEAM
      </button>
    </div>
  );

  return (
    <main className="min-h-screen pt-24 pb-32 px-4 max-w-2xl mx-auto">
      {/* Header con indicatore di caricamento silenzioso */}
      <div className="flex items-center gap-6 mb-12 border-b border-white/5 pb-10">
        <div className="relative">
          <img src={session.user?.image || ""} className="w-24 h-24 rounded-full border border-white/10" />
          {isValidating && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
              <Loader2 className="animate-spin text-[#7c6af7]" size={20} />
            </div>
          )}
          <div className="absolute -bottom-2 -right-2 bg-white text-black px-2 py-1 rounded font-black text-[10px]">
            {avg}%
          </div>
        </div>
        <h1 className="text-4xl font-black tracking-tighter">{session.user?.name}</h1>
      </div>

      {/* Lista Giochi - Carica istantaneamente se i dati sono in cache */}
      <div className="grid gap-4">
        {games.map((game: any) => (
          <div key={game.appid} className="bg-[#0d0d0f] border border-white/5 rounded-xl overflow-hidden flex h-24">
            <img 
              src={`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`} 
              className="w-40 h-full object-cover" 
            />
            <div className="p-4 flex-1 flex flex-col justify-center min-w-0">
              <h3 className="font-black text-sm truncate">{game.name}</h3>
              <div className="h-1 bg-white/5 rounded-full my-2">
                <div className="h-full bg-[#7c6af7]" style={{ width: `${game.percent}%` }} />
              </div>
              <div className="flex justify-between text-[9px] font-black opacity-40">
                <span>{game.achieved}/{game.total} TROFEI</span>
                <span>{game.percent}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}