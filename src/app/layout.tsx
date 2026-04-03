import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Geekore | Gamer Social Network",
  description: "Drop your legendary moments",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body className={`${inter.className} bg-[#0a0a0f] text-white min-h-screen`}>
        {/* La Navbar è definita qui UNA SOLA VOLTA per tutta l'app */}
        <Navbar />
        
        {/* Il contenuto delle varie pagine viene iniettato qui */}
        {children}
      </body>
    </html>
  );
}