import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();

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