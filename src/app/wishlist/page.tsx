import { Plus, Calendar } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { MediaBadge } from '@/components/ui/MediaBadge'
import { mediaColor } from '@/lib/utils'
import { MediaType } from '@/types'

const MOCK_WISHLIST = [
  {
    id: 'w1', type: 'game' as MediaType,
    title: 'Ghost of Yōtei',
    cover: 'https://media.rawg.io/media/games/4a0/4a0a1316102366260e6f38fd2a9cfdce.jpg',
    release_date: '2025-10-15',
  },
  {
    id: 'w2', type: 'anime' as MediaType,
    title: 'Dandadan S2',
    cover: 'https://cdn.anilist.co/img/dir/anime/reg/171018.jpg',
    release_date: '2025-04-04',
  },
  {
    id: 'w3', type: 'manga' as MediaType,
    title: 'One Piece Vol. 110',
    cover: 'https://cdn.anilist.co/img/dir/manga/reg/13.jpg',
    release_date: '2025-06-01',
  },
]

function daysUntil(dateStr: string): string {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return 'Disponibile!'
  if (diff === 1) return 'Domani'
  if (diff < 30) return `${diff} giorni`
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function WishlistPage() {
  return (
    <AppShell>
      <header className="flex items-center justify-between px-4 pt-safe py-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Wishlist</h2>
          <p className="text-xs text-white/30 mt-0.5">Uscite che aspetti</p>
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all">
          <Plus size={20} />
        </button>
      </header>

      <div className="px-4 flex flex-col gap-3 stagger">
        {MOCK_WISHLIST.map(({ id, type, title, cover, release_date }) => {
          const color = mediaColor(type)
          const countdown = daysUntil(release_date)
          const isClose = countdown === 'Domani' || countdown === 'Disponibile!'

          return (
            <div key={id} className="glass rounded-2xl overflow-hidden flex items-center gap-0">
              {/* Cover */}
              <div className="h-24 w-16 shrink-0 bg-bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt={title} className="h-full w-full object-cover" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 px-4 py-3">
                <MediaBadge type={type} className="mb-1.5" />
                <h3 className="text-sm font-semibold text-white leading-tight truncate">{title}</h3>
                <div className="flex items-center gap-1.5 mt-2">
                  <Calendar size={12} className="text-white/30" />
                  <span
                    className="text-xs font-medium"
                    style={{ color: isClose ? color : undefined }}
                  >
                    {countdown}
                  </span>
                </div>
              </div>

              {/* Color accent bar */}
              <div className="w-1 self-stretch" style={{ background: `${color}60` }} />
            </div>
          )
        })}

        {/* Empty state hint */}
        <div className="glass rounded-2xl p-6 text-center border border-dashed border-white/10 mt-2">
          <Plus size={28} className="text-white/20 mx-auto mb-2" />
          <p className="text-sm text-white/40">Aggiungi qualcosa che vuoi seguire</p>
          <p className="text-xs text-white/20 mt-1">Ti avviseremo quando esce</p>
        </div>
      </div>
    </AppShell>
  )
}
