import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NewsProvider } from "@/context/NewsContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GEEKORE | The Ultimate Geek Feed",
  description: "Il cuore pulsante della cultura nerd: Gaming, Cinema, Manga e Boardgames.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="dark">
      <body className={`${inter.className} bg-[#050507] text-white antialiased`}>
        {/* Avvolgendo l'intera app nel NewsProvider, il caricamento 
            delle news parte immediatamente all'accesso al sito, 
            popolando la cache globale per ogni pagina.
        */}
        <NewsProvider>
          {children}
        </NewsProvider>
      </body>
    </html>
  );
}