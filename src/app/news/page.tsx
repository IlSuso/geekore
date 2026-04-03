import { ExternalLink } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { MediaBadge } from '@/components/ui/MediaBadge'
import { timeAgo } from '@/lib/utils'
import { MediaType } from '@/types'

const MOCK_NEWS = [
  {
    id: 'n1', type: 'anime' as MediaType,
    title: 'Frieren: confermata la seconda stagione',
    summary: 'Studio Madhouse ha annunciato ufficialmente la produzione della stagione 2 per il 2025.',
    source: 'AniList News',
    published_at: new Date(Date.now() - 3600000).toISOString(),
    why: 'Perché stai guardando Frieren S1 · Ep. 22',
    image: 'https://cdn.anilist.co/img/dir/anime/reg/170942.jpg',
  },
  {
    id: 'n2', type: 'game' as MediaType,
    title: 'Elden Ring: DLC Shadow of the Erdtree — nuovo trailer',
    summary: 'FromSoftware ha rilasciato un nuovo trailer del DLC, con 10 nuovi boss e un\'area inedita.',
    source: 'IGN',
    published_at: new Date(Date.now() - 14400000).toISOString(),
    why: 'Perché hai 87h su Elden Ring',
    image: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/library_600x900.jpg',
  },
  {
    id: 'n3', type: 'manga' as MediaType,
    title: 'Berserk: nuovo capitolo in uscita',
    summary: 'Young Animal ha confermato la data di uscita del capitolo 378 di Berserk, continuando l\'arco narrativo.',
    source: 'MangaDex',
    published_at: new Date(Date.now() - 86400000).toISOString(),
    why: 'Perché stai leggendo Berserk · Cap. 201',
    image: 'https://cdn.anilist.co/img/dir/manga/reg/30002.jpg',
  },
]

export default function NewsPage() {
  return (
    <AppShell>
      <header className="px-4 pt-safe py-4">
        <h2 className="font-display text-xl font-bold text-white">News</h2>
        <p className="text-xs text-white/30 mt-0.5">Solo quello che ti riguarda</p>
      </header>

      <div className="px-4 flex flex-col gap-3 stagger">
        {MOCK_NEWS.map(({ id, type, title, summary, source, published_at, why, image }) => (
          <article key={id} className="glass rounded-2xl overflow-hidden">
            {/* Image */}
            <div className="relative h-36 bg-bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={title} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-3 left-3">
                <MediaBadge type={type} />
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <h3 className="text-sm font-semibold text-white leading-snug mb-1.5">
                {title}
              </h3>
              <p className="text-xs text-white/40 leading-relaxed line-clamp-2 mb-3">
                {summary}
              </p>

              {/* Why relevant */}
              <div className="flex items-center gap-2 rounded-lg bg-accent/5 border border-accent/10 px-3 py-2 mb-3">
                <span className="text-accent text-xs">✦</span>
                <span className="text-xs text-accent/80">{why}</span>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/25">
                  {source} · {timeAgo(published_at)}
                </span>
                <button className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors">
                  Leggi <ExternalLink size={11} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  )
}
