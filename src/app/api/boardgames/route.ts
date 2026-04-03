import { NextResponse } from 'next/server';
import { parseStringPromise } from 'xml2js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CACHE_DURATION_MS = 86400000; 

export async function GET() {
  try {
    const { data: cache } = await supabase.from('boardgames_cache').select('*').single();
    const now = new Date().getTime();
    if (cache && (now - new Date(cache.updated_at).getTime() < CACHE_DURATION_MS)) return NextResponse.json({ articles: cache.data });
    const response = await fetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xmlData = await response.text();
    if (!xmlData.trim().startsWith('<')) return cache ? NextResponse.json({ articles: cache.data }) : NextResponse.json({ articles: [] });
    const result = await parseStringPromise(xmlData);
    const cleanedArticles = result.items.item.slice(0, 20).map((item: any) => {
      const thumb = item.thumbnail?.[0]?.$?.value || "";
      return {
        title: item.name?.[0]?.$?.value || "Unknown",
        description: `RANK #${item.$.rank} - ${item.yearpublished?.[0]?.$?.value || 'N/A'}`,
        url: `https://boardgamegeek.com/boardgame/${item.$.id}`,
        urlToImage: thumb ? thumb.replace(/_(thumb|t|sq|md|lg)\./i, '_master.') : "",
        source: { name: 'BGG' }
      };
    });
    await supabase.from('boardgames_cache').upsert({ id: 1, data: cleanedArticles, updated_at: new Date().toISOString() });
    return NextResponse.json({ articles: cleanedArticles });
  } catch (e) { return NextResponse.json({ articles: [] }); }
}