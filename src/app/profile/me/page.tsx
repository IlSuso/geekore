import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function MeProfileRedirect() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  if (profile?.username) {
    redirect(`/profile/${profile.username}`)
  } else {
    redirect('/profile/setup') // Se non ha ancora uno username, lo mandiamo a crearlo
  }
}
