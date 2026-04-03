"use client"
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Header } from "@/components/feed/header"
import { Nav } from "@/components/feed/nav"
import { Loader2, Flame, MessageSquare, UserPlus, BellOff, ArrowLeft, Zap } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    fetchNotifications()
  }, [])

  async function fetchNotifications() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push('/login')

    // Recupera notifiche e dettagli del mittente
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        *,
        sender:profiles!sender_id(username, avatar_url, display_name)
      `)
      .eq('receiver_id', user.id)
      .order('created_at', { ascending: false })

    if (data) setNotifications(data)
    setLoading(false)

    // Segna come lette appena si apre la pagina
    if (data && data.some(n => !n.is_read)) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <Loader2 className="animate-spin text-[#7c6af7]" size={32} />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Header />
      
      <main className="max-w-xl mx-auto pt-24 pb-32 px-4">
        {/* Intestazione Pagina */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#7c6af7]">Centro Attività</h2>
              <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest mt-1">Sincronizzazione Arena</p>
            </div>
          </div>
          <Zap size={16} className="text-[#7c6af7] animate-pulse" />
        </div>

        {/* Lista Notifiche */}
        <div className="space-y-3">
          {notifications.map((n) => (
            <Link 
              href={`/profile/${n.sender?.username}`} 
              key={n.id} 
              className={`p-5 rounded-[2.2rem] border transition-all flex items-center gap-4 group ${
                n.is_read 
                ? 'bg-[#16161e]/50 border-white/5 opacity-60' 
                : 'bg-[#1d1d2a] border-[#7c6af7]/30 shadow-lg shadow-[#7c6af7]/5'
              }`}
            >
              {/* Avatar Mittente */}
              <div className="relative w-12 h-12 shrink-0">
                <div className="w-full h-full rounded-2xl overflow-hidden bg-[#0a0a0f] border border-white/10 p-1">
                  <img 
                    src={n.sender?.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${n.sender_id}`} 
                    className="w-full h-full object-cover rounded-xl" 
                    alt="avatar" 
                  />
                </div>
                {/* Icona Tipo Notifica */}
                <div className="absolute -bottom-1 -right-1 bg-[#0a0a0f] p-1.5 rounded-full border border-white/10 text-[#7c6af7]">
                  {n.type === 'like' && <Flame size={12} fill="currentColor" />}
                  {n.type === 'comment' && <MessageSquare size={12} />}
                  {n.type === 'follow' && <UserPlus size={12} />}
                </div>
              </div>
              
              {/* Testo Notifica */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-gray-300 leading-tight">
                  <span className="font-black text-white italic mr-1">@{n.sender?.username}</span>
                  {n.type === 'like' && "ha infiammato il tuo post"}
                  {n.type === 'comment' && "ha commentate la tua giocata"}
                  {n.type === 'follow' && "ha iniziato a seguirti"}
                </p>
                <p className="text-[9px] text-gray-600 font-bold uppercase mt-1.5 flex items-center gap-2">
                   {new Date(n.created_at).toLocaleDateString()} • Arena Hub
                </p>
              </div>
            </Link>
          ))}

          {/* Stato Vuoto */}
          {notifications.length === 0 && (
            <div className="text-center py-24 border border-dashed border-white/5 rounded-[3rem] bg-[#16161e]/20">
              <BellOff size={32} className="mx-auto mb-4 text-gray-800" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Segnale debole: nessuna attività rilevata</p>
            </div>
          )}
        </div>
      </main>

      <Nav />
    </div>
  )
}
