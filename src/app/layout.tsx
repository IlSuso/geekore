import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Geekore',
  description: 'Il tuo universo geek in un unico posto',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="dark">
      <body className="bg-black text-white min-h-screen">
        <Navbar />
        <main className="pt-16 md:pt-16 pb-20 md:pb-8">
          {children}
        </main>
      </body>
    </html>
  );
}