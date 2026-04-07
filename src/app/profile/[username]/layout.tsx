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
      ...(profile?.avatar_url ? { images: [{ url: profile.avatar_url }] } : {}),
    },
    twitter: {
      card: profile?.avatar_url ? 'summary_large_image' : 'summary',
      title: `${displayName} — Geekore`,
      description,
      ...(profile?.avatar_url ? { images: [profile.avatar_url] } : {}),
    },
  }
}

export default function ProfileUsernameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
