import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Heart, UserPlus, ArrowLeft, Ghost } from 'lucide-react'
import Link from 'next/link'

export default async function NotificationsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name) { return cookieStore.get(name)?.value } } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Recupera notifiche con dati del mittente
  const { data: notifications } = await supabase
    .from('notifications')
    .select(`
      *,
      sender:profiles!sender_id (username, avatar_url)
    `)
    .eq('receiver_id', session.user.id)
    .order('created_at', { ascending: false })

  // Segna come lette
  await supabase.from('notifications').update({ is_read: true }).eq('receiver_id', session.user.id)

  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-24 pb-32 px-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-4 mb-10">
          <Link href="/profile" className="text-gray-500 hover:text-white"><ArrowLeft size={24} /></Link>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">Attività</h1>
        </div>

        <div className="space-y-4">
          {notifications?.map((n: any) => (
            <div key={n.id} className="flex items-center gap-4 p-4 rounded-[2rem] bg-[#16161e]/40 border border-white/5">
              <div className="w-10 h-10 rounded-xl bg-[#0a0a0f] overflow-hidden border border-white/10">
                {n.sender?.avatar_url && <img src={n.sender.avatar_url} className="w-full h-full object-cover" />}
              </div>
              <p className="text-sm text-gray-300 flex-1">
                <span className="font-black text-white">{n.sender?.username}</span> 
                {n.type === 'like' ? ' ha messo like al tuo drop' : ' ha iniziato a seguirti'}
              </p>
              {n.type === 'like' ? <Heart size={16} className="text-[#ff4d4d] fill-[#ff4d4d]" /> : <UserPlus size={16} className="text-[#7c6af7]" />}
            </div>
          ))}
          {(!notifications || notifications.length === 0) && (
            <div className="text-center py-20 opacity-20"><Ghost className="mx-auto mb-4" size={48} /><p>Nessun segnale...</p></div>
          )}
        </div>
      </div>
    </main>
  )
}