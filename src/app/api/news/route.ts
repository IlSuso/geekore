import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cat = searchParams.get("cat") || "all";

    let query = supabase.from('news_cache').select('data');
    if (cat !== 'all') query = query.eq('category', cat);

    const { data, error } = await query;
    if (error) throw error;

    let allNews: any[] = [];
    data.forEach(row => {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (Array.isArray(parsed)) allNews = [...allNews, ...parsed];
    });

    return NextResponse.json(allNews);
  } catch (err) {
    return NextResponse.json([]);
  }
}