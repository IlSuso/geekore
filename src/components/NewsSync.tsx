"use client";

import { useEffect } from "react";

export default function NewsSync() {
  useEffect(() => {
    const syncNews = async () => {
      const COOLDOWN = 10 * 60 * 1000; // 10 Minuti
      const now = Date.now();
      const lastSync = localStorage.getItem("gk_last_sync");

      // Se siamo nel cooldown, non facciamo chiamate
      if (lastSync && now - parseInt(lastSync) < COOLDOWN) {
        console.log("⚡ [NewsSync] Cooldown attivo: caricamento da cache locale.");
        return;
      }

      try {
        // Chiamata all'API di sincronizzazione
        const res = await fetch("/api/news/sync", { 
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });

        // Protezione contro risposte HTML (Errori 404/500)
        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType?.includes("application/json")) {
          console.error("❌ [NewsSync] L'API non ha restituito JSON valido.");
          return;
        }

        const data = await res.json();
        
        if (data.status === "updated" || data.status === "skipped") {
          localStorage.setItem("gk_last_sync", now.toString());
          console.log("✅ [NewsSync] Sincronizzazione completata.");
        }
      } catch (error) {
        console.error("💥 [NewsSync] Errore critico durante il sync:", error);
      }
    };

    syncNews();
  }, []);

  return null;
}