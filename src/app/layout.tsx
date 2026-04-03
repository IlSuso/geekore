"use client";

import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import Link from "next/link";
import { User, Trophy, Newspaper, Home } from "lucide-react";
import { usePathname } from "next/navigation";

const inter = Inter({ subsets: ["latin"] });

function BackgroundSync() {
  const { data: session } = useSession();
  // @ts-ignore
  const sId = session?.user?.id;
  useSWR(sId ? `/api/steam?steamId=${sId}&username=${session?.user?.name}&avatar=${session?.user?.image}` : null);
  return null;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Funzione per lo stile dei link: Viola se attivo, Grigio se spento
  const getLinkStyle = (href: string) => 
    `flex flex-col items-center justify-center transition-all duration-300 ${
      pathname === href ? "text-[#7c6af7] scale-110 opacity-100" : "text-white/40 hover:text-white"
    }`;

  return (
    <html lang="it">
      <body className={`${inter.className} bg-[#050507] text-white uppercase italic antialiased`}>
        <Providers>
          <BackgroundSync />
          
          {/* --- NAVBAR DESKTOP (Sopra i 768px) --- */}
          <nav className="hidden md:block fixed top-0 left-0 right-0 z-[100] bg-[#0d0d0f]/90 backdrop-blur-xl border-b border-white/5 h-16">
            <div className="max-w-4xl mx-auto h-full px-8 flex items-center justify-between">
              <div className="text-xl font-black tracking-tighter italic text-[#7c6af7]">GEEKORE</div>
              <div className="flex gap-10">
                <Link href="/" className={getLinkStyle("/")}>
                  <div className="flex items-center gap-2 text-[10px] font-black">
                    <Newspaper size={18} /> NEWS
                  </div>
                </Link>
                <Link href="/profile" className={getLinkStyle("/profile")}>
                  <div className="flex items-center gap-2 text-[10px] font-black">
                    <User size={18} /> PROFILO
                  </div>
                </Link>
                <Link href="/leaderboard" className={getLinkStyle("/leaderboard")}>
                  <div className="flex items-center gap-2 text-[10px] font-black">
                    <Trophy size={18} /> RANK
                  </div>
                </Link>
              </div>
            </div>
          </nav>

          {/* --- NAVBAR MOBILE (Sotto i 768px) --- */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-[#0d0d0f] border-t border-white/10 h-20 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
            <div className="grid grid-cols-3 h-full">
              <Link href="/" className={getLinkStyle("/")}>
                <Newspaper size={24} />
                <span className="text-[9px] font-black mt-1 tracking-widest">NEWS</span>
              </Link>
              <Link href="/profile" className={getLinkStyle("/profile")}>
                <User size={24} />
                <span className="text-[9px] font-black mt-1 tracking-widest">PROFILO</span>
              </Link>
              <Link href="/leaderboard" className={getLinkStyle("/leaderboard")}>
                <Trophy size={24} />
                <span className="text-[9px] font-black mt-1 tracking-widest">RANK</span>
              </Link>
            </div>
          </nav>

          {/* --- AREA CONTENUTO --- */}
          {/* Aggiungiamo padding-top per il desktop e padding-bottom per il mobile */}
          <div className="pt-6 md:pt-24 pb-28 md:pb-10 min-h-screen">
            {children}
          </div>

        </Providers>
      </body>
    </html>
  );
}