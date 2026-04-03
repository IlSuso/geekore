import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  try {
    // Verifichiamo se le chiavi esistono, altrimenti evitiamo il crash
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ 
        status: "skipped", 
        message: "Missing Supabase Keys" 
      }, { status: 200 }); // Usiamo 200 per non far scattare l'errore nel frontend
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update base per testare se funziona
    await supabase
      .from('news_cache')
      .update({ updated_at: new Date().toISOString() })
      .eq('category', 'all');

    return NextResponse.json({ status: "updated" });
  } catch (err) {
    console.error("Sync API Error:", err);
    // Rispondiamo SEMPRE con JSON, anche in caso di errore
    return NextResponse.json({ status: "error", message: "Check server logs" }, { status: 200 });
  }
}

// Aggiungiamo GET per poter testare l'URL direttamente dal browser
export async function GET() {
  return NextResponse.json({ message: "Sync endpoint is alive. Use POST to sync." });
}