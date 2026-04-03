"use client"
import { useState, useEffect } from 'react'
import { X, ExternalLink, Loader2, Ghost, Film, Gamepad2, Book, Puzzle, LayoutGrid } from 'lucide-react'

const CATEGORIES = [
  { 
    id: 'all', 
    label: 'Tutto', 
    icon: LayoutGrid, 
    query: '(news OR trailer) nerd -soap -gossip -uomini -donne -pomeriggio -GFVIP -trash' 
  },
  { 
    id: 'gaming', 
    label: 'Gaming', 
    icon: Gamepad2, 
    query: 'videogiochi OR playstation OR xbox OR nintendo OR PC -mobile -smartphone -offerte' 
  },
  { 
    id: 'cinema', 
    label: 'Cinema', 
    icon: Film, 
    query: 'film OR "serie tv" OR netflix OR marvel OR disney -soap -gossip -pomeriggio -anticipazioni' 
  },
  { 
    id: 'anime', 
    label: 'Anime', 
    icon: Book, 
    query: 'anime OR manga OR "crunchyroll news" -soap -gossip' 
  },
  { 
    id: 'boardgames', 
    label: 'Tavolo', 
    icon: Puzzle, 
    query: 'boardgames OR "giochi da tavolo" OR "D&D" OR "Warhammer"' 
  }, 
]

export default function NewsPage() {
  const [news, setNews] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selectedArticle, setSelectedArticle] = useState<any>(null)
  
  const API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY

  useEffect(() => {
    async function fetchNews() {
      setLoading(true)
      try {
        let data;
        if (activeTab === 'boardgames') {
          const res = await fetch('/api/boardgames')
          data = await res.json()
        } else {
          const current = CATEGORIES.find(c => c.id === activeTab)
          // Solo domini nerd professionali
          const domains = 'everyeye.it,multiplayer.it,ign.com,leganerd.com,Staynerd.com,tomshw.it'
          const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(current?.query || "")}&domains=${domains}&language=it&sortBy=publishedAt&pageSize=40&apiKey=${API_KEY}`
          const res = await fetch(url)
          data = await res.json()
        }
        
        // Filtriamo articoli senza immagine o segnati come rimossi
        const cleanNews = (data.articles || []).filter((a: any) => 
          a.urlToImage && 
          !a.title.includes("[Removed]") && 
          !a.title.includes("offerte")
        )
        setNews(cleanNews)
      } catch (err) { 
        console.error(err) 
      } finally { 
        setLoading(false) 
      }
    }
    fetchNews()
    // Array costante per evitare l'errore di React
  }, [activeTab, API_KEY])

  return (
    <main className="min-h-screen bg-[#050507] pt-20 pb-32 px-4 text-white font-sans selection:bg-[#7c6af7]/30">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-10 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#7c6af7] rounded-xl flex items-center justify-center shadow-lg shadow-[#7c6af7]/20">
              <Ghost size={20} />
            </div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter italic">Geekore</h1>
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-16">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`flex flex-col items-center justify-center gap-3 py-6 rounded-[1.5rem] border transition-all duration-300 ${
                activeTab === cat.id 
                ? 'bg-[#7c6af7] border-[#7c6af7] shadow-xl shadow-[#7c6af7]/20 scale-[1.03]' 
                : 'bg-white/[0.03] text-gray-500 border-white/5 hover:border-white/10'
              }`}
            >
              <cat.icon size={18} />
              <span className="text-[9px] font-black uppercase tracking-widest">{cat.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-32 flex justify-center"><Loader2 className="animate-spin text-[#7c6af7]" size={32} /></div>
        ) : (
          <div className="space-y-16">
            {news.map((article, index) => (
              <div key={index} onClick={() => setSelectedArticle(article)} className="group cursor-pointer">
                <div className="relative aspect-video rounded-[2.5rem] overflow-hidden bg-[#0d0d0f] mb-6 border border-white/5">
                  <img 
                    src={article.urlToImage} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80" 
                    alt="" 
                    onError={(e: any) => e.target.src = "https://images.unsplash.com/photo-1610845948151-6022feb188bc?q=80&w=1600"}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-80" />
                  <div className="absolute bottom-6 left-8 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-[8px] font-black text-[#7c6af7] uppercase tracking-widest italic">
                      {article.source.name}
                  </div>
                </div>
                <div className="px-2 space-y-2">
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter group-hover:text-[#7c6af7] transition-colors line-clamp-2 italic">{article.title}</h2>
                  <p className="text-gray-400 text-xs leading-relaxed line-clamp-2 italic opacity-60">{article.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedArticle && (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-3xl flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-[#050507] h-full md:h-auto md:max-h-[85vh] md:rounded-[3rem] border-t md:border border-white/10 overflow-hidden flex flex-col">
            <div className="p-6 flex justify-between items-center border-b border-white/5">
              <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest italic">{selectedArticle.source.name}</span>
              <button onClick={() => setSelectedArticle(null)} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-8">
              <img src={selectedArticle.urlToImage} className="w-full aspect-video object-cover rounded-3xl" alt="" />
              <h2 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter leading-none italic">{selectedArticle.title}</h2>
              <p className="text-gray-300 italic text-lg leading-relaxed italic">{selectedArticle.description}</p>
              <a href={selectedArticle.url} target="_blank" className="w-full py-6 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.5em] flex items-center justify-center gap-3 hover:bg-[#7c6af7] hover:text-white transition-all italic font-black">Leggi Articolo <ExternalLink size={14} /></a>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}