import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Bookmark, Calendar, BookOpen, Gamepad2, Film, Tv, Dices } from 'lucide-react'
import Link from 'next/link'

const TYPE_CONFIG: Record<string, { label: string; color: string; gradient: string; icon: React.ElementType }> = {
  anime:     { label: 'Anime',   color: 'bg-sky-500',    gradient: 'from-sky-500/20 to-sky-500/5',    icon: BookOpen },
  manga:     { label: 'Manga',   color: 'bg-orange-500', gradient: 'from-orange-500/20 to-orange-500/5', icon: BookOpen },
  game:      { label: 'Game',    color: 'bg-green-500',  gradient: 'from-green-500/20 to-green-500/5', icon: Gamepad2 },
  movie:     { label: 'Film',    color: 'bg-red-500',    gradient: 'from-red-500/20 to-red-500/5',    icon: Film },
  tv:        { label: 'Serie',   color: 'bg-purple-500', gradient: 'from-purple-500/20 to-purple-500/5', icon: Tv },
  boardgame: { label: 'Board',   color: 'bg-yellow-500', gradient: 'from-yellow-500/20 to-yellow-500/5', icon: Dices },
}

function daysUntil(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return 'Disponibile'
  if (diff === 1) return 'Domani'
  if (diff < 30) return `tra ${diff} giorni`
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function WishlistPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let wishlist: any[] = []
  try {
    const { data } = await supabase
      .from('wishlist')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    wishlist = data || []
  } catch {
    // Table not yet created — show empty state
  }

  return (
    <main className="min-h-screen bg-[#080810] text-white pt-6 pb-24 md:pb-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] tracking-[0.3em] text-violet-500 font-bold uppercase mb-1">La tua lista</p>
          <h1 className="text-4xl font-black tracking-tighter">Wishlist</h1>
          <p className="text-zinc-600 text-sm mt-1">
            {wishlist.length > 0
              ? `${wishlist.length} ${wishlist.length === 1 ? 'titolo' : 'titoli'} salvati`
              : 'Titoli che vuoi tenere d\'occhio'}
          </p>
        </div>

        {wishlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-zinc-900/60 border border-white/8 rounded-3xl flex items-center justify-center mb-4">
              <Bookmark size={24} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-semibold">Wishlist vuota</p>
            <p className="text-zinc-700 text-sm mt-2 max-w-xs leading-relaxed">
              Su Discover usa il segnalibro per salvare titoli che vuoi seguire
            </p>
            <Link
              href="/discover"
              className="mt-6 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors"
            >
              Vai a Discover
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {wishlist.map((item) => {
              const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.anime
              const Icon = config.icon
              const countdown = daysUntil(item.release_date)
              const isClose = countdown === 'Disponibile' || countdown === 'Domani'

              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-0 bg-zinc-900/50 border border-white/6 hover:border-violet-500/20 rounded-2xl overflow-hidden transition-all"
                >
                  {/* Left accent */}
                  <div className={`w-1 self-stretch shrink-0 ${config.color} opacity-60`} />

                  {/* Cover */}
                  <div className="w-14 h-20 shrink-0 bg-zinc-800 overflow-hidden">
                    {item.cover_image ? (
                      <img
                        src={item.cover_image}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                        <Icon size={20} className="text-zinc-600" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white ${config.color}`}>
                        {config.label}
                      </span>
                      {isClose && countdown && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-violet-300 bg-violet-500/15 border border-violet-500/20">
                          {countdown === 'Disponibile' ? '🟢 Disponibile' : '🔜 Domani'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-white leading-tight truncate">{item.title}</h3>
                    {countdown && !isClose && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Calendar size={10} className="text-zinc-600" />
                        <span className="text-xs text-zinc-600">{countdown}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
