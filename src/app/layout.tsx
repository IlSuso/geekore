"use client";

import { Inter } from "next/font/google";
import "./globals.css";
import { NewsProvider } from "@/context/NewsContext";
import { SessionProvider } from "next-auth/react";
import BottomNav from "@/components/BottomNav";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="dark">
      <head>
        <title>GEEKORE | Omniverse Feed</title>
        <meta name="description" content="Gaming, Cinema, Manga & Tech Culture" />
      </head>
      <body className={`${inter.className} bg-[#050507] text-white antialiased selection:bg-[#7c6af7]/30`}>
        {/* 1. SessionProvider: Gestisce l'autenticazione Steam 
            2. NewsProvider: Gestisce la cache globale delle notizie
        */}
        <SessionProvider>
          <NewsProvider>
            
            {/* Contenuto della pagina */}
            <div className="relative min-h-screen">
              {children}
            </div>

            {/* Navigazione globale fissa in basso */}
            <BottomNav />

          </NewsProvider>
        </SessionProvider>
      </body>
    </html>
  );
}