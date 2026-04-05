import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Bookmark, Calendar, BookOpen, Gamepad2, Film, Tv, Dices } from 'lucide-react'

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  anime:     { label: 'Anime',      color: 'bg-sky-500',    icon: BookOpen },
  manga:     { label: 'Manga',      color: 'bg-orange-500', icon: BookOpen },
  game:      { label: 'Game',       color: 'bg-green-500',  icon: Gamepad2 },
  movie:     { label: 'Film',       color: 'bg-red-500',    icon: Film },
  tv:        { label: 'Serie',      color: 'bg-purple-500', icon: Tv },
  boardgame: { label: 'Board',      color: 'bg-yellow-500', icon: Dices },
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
    // Tabella non ancora creata — mostra empty state
  }

  return (
    <main className="min-h-screen bg-zinc-950 pt-6 pb-24 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Wishlist</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {wishlist.length > 0
              ? `${wishlist.length} ${wishlist.length === 1 ? 'titolo' : 'titoli'} nella lista`
              : 'Uscite che stai aspettando'}
          </p>
        </div>

        {wishlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mb-4">
              <Bookmark size={28} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-medium">Wishlist vuota</p>
            <p className="text-zinc-700 text-sm mt-1 max-w-xs">
              Vai su Discover e usa il pulsante segnalibro per aggiungere titoli che vuoi seguire
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {wishlist.map((item) => {
              const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.anime
              const Icon = config.icon
              const countdown = daysUntil(item.release_date)
              const isClose = countdown === 'Disponibile' || countdown === 'Domani'

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-0 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors"
                >
                  {/* Cover */}
                  <div className="w-16 h-24 shrink-0 bg-zinc-800">
                    {item.cover_image ? (
                      <img src={item.cover_image} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon size={24} className="text-zinc-600" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-white leading-tight truncate">{item.title}</h3>
                    {countdown && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Calendar size={11} className="text-zinc-600" />
                        <span className={`text-xs font-medium ${isClose ? 'text-violet-400' : 'text-zinc-500'}`}>
                          {countdown}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Accent bar */}
                  <div className={`w-1 self-stretch opacity-40 ${config.color}`} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
