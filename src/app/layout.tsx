import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, bio, avatar_url')
    .ilike('username', username)
    .single()

  const displayName = profile?.display_name || profile?.username || username
  const description = profile?.bio
    ? `${profile.bio} — Profilo di ${displayName} su Geekore`
    : `La collezione di ${displayName} su Geekore: anime, manga, videogiochi, film e board game.`

  return {
    title: displayName,
    description,
    openGraph: {
      title: `${displayName} — Geekore`,
      description,
      type: 'profile',
      images: [{
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://geekore.it'}/api/og/${username}`,
        width: 1200,
        height: 630,
        alt: `Profilo di ${displayName} su Geekore`,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${displayName} — Geekore`,
      description,
      images: [`${process.env.NEXT_PUBLIC_SITE_URL || 'https://geekore.it'}/api/og/${username}`],
    },
  }
}

export default function ProfileUsernameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}