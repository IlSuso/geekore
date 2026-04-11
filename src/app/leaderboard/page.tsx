'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Zap, Gamepad2, Tv } from 'lucide-react'
import Link from 'next/link'

interface Leader {
  user_id: string; username: string; avatar_url: string | null; display_name: string | null
  core_power: number; steam_hours: number; anime_eps: number
}

function calcScore(entries: any[]): { geek: number; steam: number; anime: number } {
  let geek = 0, steam = 0, anime = 0
  for (const e of entries) {
    const ep = e.current_episode || 0
    if (e.is_steam) { geek += ep * 1; steam += ep }
    else if (e.type === 'anime') { geek += ep * 0.4; anime += ep }
    else if (e.type === 'manga') geek += ep * 0.08
    else if (e.type === 'movie' && e.status === 'completed') geek += 18
    else if (e.type === 'tv') geek += ep * 0.75
    else if (e.type === 'boardgame') geek += ep * 1.25
  }
  return { geek: Math.round(geek), steam, anime }
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'geek' | 'steam' | 'anime'>('geek')
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const [{ data: entries }, { data: profiles }] = await Promise.all([
        supabase.from('user_media_entries').select('user_id, type, current_episode, is_steam, status'),
        supabase.from('profiles').select('id, username, display_name, avatar_url'),
      ])
      if (!entries || !profiles) { setLoading(false); return }

      const pm: Record<string, any> = {}
      for (const p of profiles) pm[p.id] = p

      const grouped: Record<string, any[]> = {}
      for (const e of entries) {
        if (!grouped[e.user_id]) grouped[e.user_id] = []
        grouped[e.user_id].push(e)
      }

      const result: Leader[] = Object.entries(grouped)
        .filter(([uid]) => pm[uid]?.username)
        .map(([uid, es]) => {
          const s = calcScore(es)
          return { user_id: uid, username: pm[uid].username, display_name: pm[uid].display_name, avatar_url: pm[uid].avatar_url, core_power: s.geek, steam_hours: s.steam, anime_eps: s.anime }
        })
        .sort((a, b) => b.core_power - a.core_power)
        .slice(0, 50)

      setLeaders(result)
      setLoading(false)
    }
    load()
  }, [])

  const sorted = [...leaders].sort((a, b) => tab === 'steam' ? b.steam_hours - a.steam_hours : tab === 'anime' ? b.anime_eps - a.anime_eps : b.core_power - a.core_power)

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-black"><Loader2 className="animate-spin text-violet-400" size={40} /></div>

  return (
    <main className="min-h-screen bg-black pt-8 pb-32 px-4 text-white">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-5xl font-black tracking-tighter">Classifica</h1>
          <p className="text-zinc-500 text-sm mt-1">Geek Score su tutti i media, non solo Steam</p>
        </div>
        <div className="flex gap-2 mb-6 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5">
          {[['geek','⚡ Geek Score'],['steam','🎮 Steam'],['anime','🎌 Anime']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab === id ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <div className="space-y-2">
          {sorted.map((user, i) => {
            const value = tab === 'steam' ? `${user.steam_hours}h` : tab === 'anime' ? `${user.anime_eps} ep` : user.core_power
            const medals: Record<number, string> = {0:'🥇',1:'🥈',2:'🥉'}
            return (
              <Link key={user.user_id} href={`/profile/${user.username}`} className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-violet-500/30 transition-all">
                <div className="w-7 text-center text-sm font-bold text-zinc-600 flex-shrink-0">{medals[i] ?? `#${i+1}`}</div>
                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                  {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">{(user.display_name?.[0]||user.username[0]).toUpperCase()}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{user.display_name || user.username}</p>
                  <p className="text-xs text-zinc-500">@{user.username}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-lg font-black ${i < 3 ? 'text-violet-400' : 'text-zinc-300'}`}>{value}</p>
                  <p className="text-[10px] text-zinc-600">{tab === 'geek' ? 'punti' : tab === 'steam' ? 'ore' : 'ep'}</p>
                </div>
              </Link>
            )
          })}
        </div>
        {tab === 'geek' && (
          <div className="mt-6 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-zinc-600">
            <p className="font-semibold text-zinc-500 mb-1">Come si calcola?</p>
            <p>Steam ×1pt/h · Anime ×0.4/ep · Manga ×0.08/cap · Film ×18 · TV ×0.75/ep · Board ×1.25/partita</p>
          </div>
        )}
      </div>
    </main>
  )
}