import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Community',
  description: 'Scopri gli utenti più attivi di Geekore, chi seguire e cosa sta muovendo la community.',
  openGraph: {
    title: 'Community — Geekore',
    description: 'Scopri gli utenti più attivi di Geekore, chi seguire e cosa sta muovendo la community.',
    type: 'website',
  },
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return <div className="pt-14 md:pt-12 pb-20 md:pb-8">{children}</div>
}
