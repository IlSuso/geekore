"use client"
import { useSession, signIn, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { Trophy, Loader2, Zap, Target, Clock, LogOut, Fingerprint, Gamepad2 } from 'lucide-react'

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const [games, setGames] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Carica i dati solo se l'utente è loggato e abbiamo il suo SteamID
    // @ts-ignore
    if (session?.user?.id) {
      setLoading(true)
      // @ts-ignore
      fetch(`/api/steam?steamId=${session.user.id}`)
        .then(res => res.json())
        .then(data => { 
          setGames(data.games || [])
          setLoading(false) 
        })
        .catch(err => {
          console.error("Errore API Steam:", err)
          setLoading(false)
        })
    }
  }, [session])

  // Stato di caricamento iniziale della sessione
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050507]">
        <Loader2 className="animate-spin text-[#7c6af7]" size={40} />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#050507] pt-12 pb-32 px-4 text-white uppercase italic selection:bg-[#7c6af7]/30">
      <div className="max-w-2xl mx-auto">
        
        {/* HEADER: CYBERCORE DESIGN */}
        <div className="relative p-[1px] bg-gradient-to-r from-transparent via-[#7c6af7]/50 to-transparent mb-10">
          <div className="bg-[#050507] py-8 px-2 flex flex-col md:flex-row items-center gap-6">
            <div className="relative group">
              <div className="absolute -inset-1 bg-[#7c6af7] rounded-full blur opacity-20 group-hover:opacity-60 transition duration-500"></div>
              <img 
                src={session?.user?.image || "https://avatar.vercel.sh/geek"} 
                className="relative w-24 h-24 rounded-full border-2 border-[#7c6af7] object-cover shadow-[0_0_20px_rgba(124,106,247,0.2)]" 
                alt="avatar"
              />
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                <Zap size={12} className="text-[#7c6af7] fill-[#7c6af7]" />
                <span className="text-[9px] font-black tracking-[0.4em] text-[#7c6af7]">SYSTEM_ONLINE</span>
              </div>
              <h1 className="text-5xl font-black tracking-tighter leading-none mb-2">
                {session?.user?.name || "GUEST_OPERATIVE"}
              </h1>
              {session?.user && (
                <div className="flex items-center justify-center md:justify-start gap-2 opacity-40">
                  <Fingerprint size={12} />
                  <span className="text-[8px] tracking-[0.2em]">ID: {session.user.id}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {!session ? (
          /* SCHERMATA LOGIN */
          <div className="text-center py-20 border border-white/5 bg-[#0d0d0f]/50 rounded-[3rem]">
            <Gamepad2 size={48} className="mx-auto mb-6 text-gray-700" />
            <h2 className="text-xl font-black mb-2 tracking-tighter">DATA_LINK_REQUIRED</h2>
            <p className="text-[10px] text-gray-500 mb-10 tracking-widest px-10">
              COLLEGA IL TUO ACCOUNT STEAM PER ACCEDERE AI PARAMETRI <br /> DI GIOCO E AI PROGRESSI DELLA TUA LIBRERIA.
            </p>
            <button 
              onClick={() => signIn("steam")}
              className="px-12 py-5 bg-white text-black rounded-full font-black text-xs hover:bg-[#7c6af7] hover:text-white transition-all active:scale-95 shadow-xl shadow-white/5"
            >
              INITIALIZE_STEAM_LINK
            </button>
          </div>
        ) : (
          /* DASHBOARD DATI */
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
            
            {/* GRID STATISTICHE RAPIDE */}
            <div className="grid grid-cols-2 gap-4 mb-12">
              <div className="bg-[#0d0d0f] border-l-2 border-[#7c6af7] p-5 shadow-inner">
                <span className="text-[7px] text-gray-500 block mb-1 tracking-widest">LIBRARY_SIZE</span>
                <span className="text-3xl font-black italic">{games.length} UNITS</span>
              </div>
              <div className="bg-[#0d0d0f] border-l-2 border-green-500/50 p-5 shadow-inner">
                <span className="text-[7px] text-gray-500 block mb-1 tracking-widest">SYNC_STATUS</span>
                <span className="text-3xl font-black italic text-green-500">STABLE</span>
              </div>
            </div>

            <h2 className="text-xs font-black mb-6 flex items-center gap-2 tracking-[0.3em] opacity-80">
              <Target size={14} className="text-[#7c6af7]" /> ACTIVE_OPERATIONS
            </h2>

            {loading ? (
              <div className="py-20 flex flex-col items-center gap-4 border border-white/5 rounded-[2rem]">
                <Loader2 className="animate-spin text-[#7c6af7]" size={24} />
                <span className="text-[8px] tracking-widest text-gray-500 animate-pulse">DECRYPTING_STEAM_DATA...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {games.length > 0 ? (
                  games.map((game) => (
                    <div key={game.appid} className="group relative bg-[#0d0d0f] border border-white/5 p-5 transition-all hover:bg-[#121214] hover:border-[#7c6af7]/40 rounded-2xl">
                      <div className="flex gap-5 items-center">
                        <img 
                          src={`https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`} 
                          className="w-16 h-16 bg-black border border-white/10 rounded-lg group-hover:scale-105 transition-transform"
                          alt={game.name}
                          onError={(e) => (e.currentTarget.src = "https://www.steamdb.info/static/img/favicon.ico")}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-3">
                            <h3 className="font-black text-[13px] truncate pr-4 leading-none uppercase">{game.name}</h3>
                            <div className="flex items-center gap-1.5 text-[#7c6af7]">
                              <Clock size={12} />
                              <span className="text-[11px] font-black">{(game.playtime_forever / 60).toFixed(1)}H</span>
                            </div>
                          </div>
                          
                          {/* PROGRESS BAR CON GLOW */}
                          <div className="flex items-center gap-4">
                            <div className="flex-1 h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                              <div 
                                className="h-full bg-gradient-to-r from-[#4f3adb] to-[#7c6af7] shadow-[0_0_12px_rgba(124,106,247,0.5)] transition-all duration-1000 ease-out" 
                                style={{ width: `${game.percent || 0}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] font-black w-10 text-right text-gray-300">{game.percent || 0}%</span>
                          </div>

                          <div className="flex gap-4 mt-3">
                            <span className="flex items-center gap-1.5 text-[8px] font-black text-gray-500 tracking-tighter uppercase">
                              <Trophy size={10} className={game.percent === 100 ? "text-yellow-500" : "text-gray-600"} /> 
                              {game.achieved || 0} / {game.total || 0} ACHIEVEMENTS
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 border border-dashed border-white/5 rounded-2xl">
                    <p className="text-[10px] text-gray-500 tracking-widest">NO_DATA_AVAILABLE. PLEASE_CHECK_PRIVACY_SETTINGS.</p>
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={() => signOut()} 
              className="mt-16 w-full py-5 border border-red-500/10 text-red-500/50 text-[9px] font-black hover:bg-red-500 hover:text-white hover:border-transparent transition-all flex items-center justify-center gap-2 rounded-xl tracking-[0.3em]"
            >
              <LogOut size={14} /> TERMINATE_SESSION
            </button>
          </div>
        )}
      </div>
    </main>
  )
}