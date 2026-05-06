// src/app/api/og/[username]/route.tsx
// M9: Aggiunto Cache-Control per evitare query Supabase ad ogni richiesta dei bot social
import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'
// M9: cache Edge di Vercel per 1 ora
export const revalidate = 3600

function normalizeUsername(value: string): string {
  return decodeURIComponent(value).trim().toLowerCase().slice(0, 40)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const normalizedUsername = normalizeUsername(username)
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .eq('username', normalizedUsername)
    .single()

  const displayName = profile?.display_name || profile?.username || normalizedUsername || 'Geekore'
  const initial = displayName[0]?.toUpperCase() || '?'

  let animeCount = 0, gameCount = 0, mangaCount = 0, movieCount = 0, tvCount = 0, steamHours = 0

  if (profile?.id) {
    const { data: entries } = await supabase.from('user_media_entries').select('type, current_episode, is_steam, status').eq('user_id', profile.id)
    for (const e of entries || []) {
      if (e.type === 'anime') animeCount++
      if (e.type === 'game') { gameCount++; if (e.is_steam) steamHours += (e.current_episode || 0) }
      if (e.type === 'manga') mangaCount++
      if (e.type === 'movie') movieCount++
      if (e.type === 'tv') tvCount++
    }
  }

  const stats = [
    { label: 'Anime', value: animeCount, color: '#38bdf8' },
    { label: 'Giochi', value: gameCount, color: '#4ade80' },
    { label: 'Manga', value: mangaCount, color: '#fb923c' },
    { label: 'Film', value: movieCount, color: '#f87171' },
    { label: 'Serie TV', value: tvCount, color: '#a78bfa' },
    ...(steamHours > 0 ? [{ label: 'Ore Steam', value: steamHours + 'h', color: '#66C0F4' }] : []),
  ].filter(s => (typeof s.value === 'number' ? s.value > 0 : true))

  const imageResponse = new ImageResponse(
    <div style={{ display:'flex', width:'1200px', height:'630px', background:'linear-gradient(135deg,#09090b 0%,#0f0a1e 50%,#09090b 100%)', fontFamily:'system-ui,sans-serif', padding:'64px', gap:'48px', alignItems:'center' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:'0', position:'absolute', top:'-80px', left:'-80px', width:'300px', height:'300px', background:'radial-gradient(circle,rgba(124,106,247,0.4) 0%,transparent 70%)', borderRadius:'50%' }} />
      <div style={{ display:'flex', flexDirection:'column', flex:1, gap:'24px', zIndex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ width:'32px', height:'32px', background:'linear-gradient(135deg,#7c6af7,#d946ef)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ color:'white', fontSize:'16px', fontWeight:900 }}>G</span>
          </div>
          <span style={{ color:'#52525b', fontSize:'16px', fontWeight:700 }}>geekore</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          <span style={{ color:'white', fontSize:'52px', fontWeight:900, letterSpacing:'-0.04em', lineHeight:1 }}>{displayName}</span>
          <span style={{ color:'#7c6af7', fontSize:'24px', fontWeight:600 }}>{displayName}</span>
          {profile?.bio && <span style={{ color:'#71717a', fontSize:'18px', marginTop:'4px' }}>{profile.bio.slice(0,80)}</span>}
        </div>
        <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
          {stats.map(s => (
            <div key={s.label} style={{ display:'flex', flexDirection:'column', alignItems:'center', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', padding:'14px 20px', gap:'4px' }}>
              <span style={{ color:s.color, fontSize:'28px', fontWeight:900 }}>{s.value}</span>
              <span style={{ color:'#71717a', fontSize:'12px', fontWeight:600 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} style={{ width:'180px', height:'180px', borderRadius:'32px', objectFit:'cover', flexShrink:0 }} alt="" />
      ) : (
        <div style={{ width:'180px', height:'180px', borderRadius:'32px', background:'linear-gradient(135deg,#7c6af7,#d946ef)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'72px', fontWeight:900, color:'white', flexShrink:0 }}>{initial}</div>
      )}
    </div>,
    { width: 1200, height: 630 }
  )

  // M9: Cache-Control — pubblica per 1h nel browser, 24h nell'Edge CDN di Vercel
  const response = new Response(imageResponse.body, {
    headers: {
      ...Object.fromEntries(imageResponse.headers.entries()),
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
    },
  })

  return response
}
