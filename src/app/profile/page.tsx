"use client";

import { useSession } from "next-auth/react";
import { Loader2, User, LogOut, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  // Il trucco per il Build: inizializziamo session come oggetto vuoto se undefined
  const session = useSession();
  const { data: userData, status } = session || { data: null, status: "unauthenticated" };
  const router = useRouter();

  // 1. STATO CARICAMENTO
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#050507] flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-[#7c6af7]" size={40} />
        <span className="text-[10px] font-black tracking-[0.5em] text-white/20 uppercase">Auth_Verifying...</span>
      </div>
    );
  }

  // 2. UTENTE NON AUTENTICATO
  if (status === "unauthenticated" || !userData) {
    return (
      <div className="min-h-screen bg-[#050507] flex flex-col items-center justify-center p-6 text-center">
        <Shield size={48} className="text-red-500 mb-6 opacity-50" />
        <h1 className="text-4xl font-black italic uppercase tracking-tighter mb-4 text-white">Access_Denied</h1>
        <p className="text-sm text-white/40 mb-8 max-w-xs lowercase">devi effettuare l'accesso per visualizzare i dati del tuo profilo geekore.</p>
        <button 
          onClick={() => router.push("/")}
          className="bg-white text-black px-8 py-3 font-black italic uppercase text-xs hover:bg-[#7c6af7] hover:text-white transition-all"
        >
          Back_to_Home
        </button>
      </div>
    );
  }

  // 3. UTENTE AUTENTICATO (LAYOUT GEEKORE)
  return (
    <main className="min-h-screen bg-[#050507] text-white p-6 pt-12 md:p-20">
      <header className="max-w-4xl mx-auto border-b-2 border-white pb-10 mb-16">
        <div className="flex items-center gap-2 text-[#7c6af7] mb-2 text-[10px] font-black tracking-[0.4em] uppercase">
          <User size={14} />
          <span>User_Authorized_Session</span>
        </div>
        <h1 className="text-7xl md:text-9xl font-black italic uppercase leading-none tracking-tighter">
          PROFILE
        </h1>
      </header>

      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12">
        {/* INFO UTENTE */}
        <section className="space-y-8">
          <div>
            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">Username_ID</label>
            <p className="text-2xl font-black italic uppercase">{userData.user?.name || "Anonymous_Geek"}</p>
          </div>

          <div>
            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">Email_Address</label>
            <p className="text-xl font-bold opacity-60 lowercase">{userData.user?.email}</p>
          </div>

          <div className="pt-8">
            <button 
              className="flex items-center gap-3 bg-red-600/10 text-red-500 border border-red-500/20 px-6 py-3 text-[10px] font-black italic uppercase hover:bg-red-600 hover:text-white transition-all"
            >
              <LogOut size={14} /> Logout_Session
            </button>
          </div>
        </section>

        {/* STATISTICHE O PLACEHOLDER ESTETICO */}
        <section className="border-l border-white/5 pl-0 md:pl-12 hidden md:block">
          <div className="bg-white/5 p-8 rounded-2xl border border-white/5 space-y-6">
            <div className="flex justify-between items-end border-b border-white/10 pb-4">
              <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Rank</span>
              <span className="text-xl font-black italic text-[#7c6af7]">CORE_MEMBER</span>
            </div>
            <div className="flex justify-between items-end border-b border-white/10 pb-4">
              <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Status</span>
              <span className="text-xl font-black italic">ACTIVE</span>
            </div>
            <div className="p-4 bg-[#7c6af7]/10 text-[#7c6af7] text-[9px] font-black leading-tight uppercase tracking-widest">
              il tuo account è sincronizzato con il database centrale di geekore.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}