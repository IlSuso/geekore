// DESTINAZIONE: src/lib/importMerge.ts
//
// Helper condiviso per tutti i route di importazione (MAL, AniList, Letterboxd).
//
// Problema: lo stesso titolo importato da fonti diverse crea righe duplicate.
// Soluzione: prima di inserire, cerca righe esistenti con titolo simile ma
// external_id diverso. Se trovate, fa un merge intelligente:
//
//   cover_image   → prende la prima disponibile (priorità: nuova se la vecchia è null)
//   title         → preferisce titolo italiano (euristicamente: non romaji/giapponese)
//   rating        → tiene il voto più alto
//   current_episode → tiene il progresso più avanzato
//   status        → tiene lo stato più avanzato (completed > watching > paused > dropped)
//   genres/tags   → unione dei due set
//   notes         → concatena se entrambe presenti, altrimenti quella non-null
//
// Dopo il merge, la riga "vincitore" viene aggiornata e quella "perdente"
// viene eliminata — si tiene sempre quella con external_id più recente (la nuova).

import { logger } from '@/lib/logger'

// ── Ordinamento stati: più alto = più avanzato ────────────────────────────────

const STATUS_RANK: Record<string, number> = {
  completed:     5,
  watching:      4,
  paused:        3,
  plan_to_watch: 2,
  dropped:       1,
}

// ── Euristica titolo italiano ─────────────────────────────────────────────────
// Un titolo è probabilmente romaji/giapponese se contiene pattern tipici.
// Non è perfetto ma funziona per la maggioranza dei casi.

function looksLikeRomaji(title: string): boolean {
  // Contiene caratteri giapponesi → sicuramente non italiano
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(title)) return true
  // Parole tipiche romaji
  const romajiPatterns = /\b(no|wo|ga|wa|ni|de|to|ka|mo|na|yo|ne|ze|zo|sa|shi|tsu|chi|ha|he)\b/i
  return romajiPatterns.test(title)
}

function pickBetterTitle(titleA: string, titleB: string): string {
  const aIsRomaji = looksLikeRomaji(titleA)
  const bIsRomaji = looksLikeRomaji(titleB)
  if (aIsRomaji && !bIsRomaji) return titleB  // B è più leggibile
  if (!aIsRomaji && bIsRomaji) return titleA  // A è più leggibile
  return titleA  // Entrambi uguali tipo → tieni il primo
}

// ── Merge di due entry ────────────────────────────────────────────────────────

export function mergeEntries(existing: any, incoming: any): any {
  // Cover: prende la prima disponibile, preferisce quella non-null
  const cover_image = existing.cover_image || incoming.cover_image

  // Titolo: preferisce quello non-romaji
  const title = pickBetterTitle(existing.title, incoming.title)

  // Rating: tiene il più alto
  const existingRating = existing.rating ?? 0
  const incomingRating = incoming.rating ?? 0
  const rating = existingRating >= incomingRating
    ? (existing.rating ?? null)
    : (incoming.rating ?? null)

  // Progresso: tiene il più avanzato
  const existingEp = existing.current_episode ?? 0
  const incomingEp = incoming.current_episode ?? 0
  const current_episode = Math.max(existingEp, incomingEp)

  // Status: tiene il più avanzato
  const existingRank = STATUS_RANK[existing.status] ?? 0
  const incomingRank = STATUS_RANK[incoming.status] ?? 0
  const status = existingRank >= incomingRank ? existing.status : incoming.status

  // Episodes: prende il valore non-null (di solito MAL/AniList ce l'hanno)
  const episodes = existing.episodes ?? incoming.episodes

  // Genres e tags: unione deduplicata
  const genres = Array.from(new Set([...(existing.genres || []), ...(incoming.genres || [])]))
  const tags   = Array.from(new Set([...(existing.tags   || []), ...(incoming.tags   || [])]))

  // Notes: concatena se entrambe presenti
  let notes = existing.notes || incoming.notes || null
  if (existing.notes && incoming.notes && existing.notes !== incoming.notes) {
    notes = `${existing.notes}\n---\n${incoming.notes}`
  }

  return {
    ...existing,
    cover_image,
    title,
    rating,
    current_episode,
    status,
    episodes,
    genres,
    tags,
    notes,
    // Aggiorna external_id e import_source con la nuova fonte
    external_id: incoming.external_id,
    import_source: incoming.import_source,
    updated_at: new Date().toISOString(),
  }
}

// ── Normalizza titolo per confronto ──────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[:\-–—]/g, ' ')       // punteggiatura → spazio
    .replace(/[^a-z0-9\s]/g, '')    // rimuove tutto tranne lettere/numeri/spazi
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Upsert con merge cross-source ─────────────────────────────────────────────
//
// Per ogni entry in `toInsert`:
//   1. Se esiste già una riga con lo stesso external_id → UPDATE normale
//   2. Se esiste una riga con titolo simile ma external_id diverso → MERGE + UPDATE
//   3. Altrimenti → INSERT
//
// Restituisce { imported, merged, skipped }

export async function upsertWithMerge(
  supabase: any,
  toInsert: any[],
  userId: string,
  logPrefix: string = '[Import]'
): Promise<{ imported: number; merged: number; skipped: number }> {
  if (toInsert.length === 0) return { imported: 0, merged: 0, skipped: 0 }

  // ── 1. Carica tutte le entry esistenti dell'utente (solo campi necessari) ──
  const { data: allExisting, error: fetchErr } = await supabase
    .from('user_media_entries')
    .select('id, external_id, title, cover_image, rating, current_episode, status, episodes, genres, tags, notes, import_source, type')
    .eq('user_id', userId)

  if (fetchErr) {
    logger.error(`${logPrefix} fetch existing error:`, fetchErr)
    // Fallback: insert diretto senza merge
    return fallbackInsert(supabase, toInsert, logPrefix)
  }

  const existing: any[] = allExisting || []

  // Mappa per external_id (lookup O(1))
  const byExternalId = new Map<string, any>(existing.map(e => [e.external_id, e]))

  // Mappa per titolo normalizzato (per trovare duplicati cross-source)
  const byNormalizedTitle = new Map<string, any>()
  for (const e of existing) {
    const norm = normalizeTitle(e.title)
    if (!byNormalizedTitle.has(norm)) {
      byNormalizedTitle.set(norm, e)
    }
  }

  let imported = 0
  let merged = 0
  let skipped = 0

  for (const incoming of toInsert) {
    try {
      // ── Caso 1: stesso external_id → UPDATE normale ─────────────────────
      const sameId = byExternalId.get(incoming.external_id)
      if (sameId) {
        const merged_entry = mergeEntries(sameId, incoming)
        const { error } = await supabase
          .from('user_media_entries')
          .update(merged_entry)
          .eq('id', sameId.id)

        if (!error) {
          imported++
          // Aggiorna la mappa locale per evitare conflitti successivi
          byExternalId.set(incoming.external_id, merged_entry)
          byNormalizedTitle.set(normalizeTitle(merged_entry.title), merged_entry)
        } else {
          logger.error(`${logPrefix} update error:`, JSON.stringify(error))
          skipped++
        }
        continue
      }

      // ── Caso 2: titolo simile, external_id diverso → MERGE cross-source ──
      const normIncoming = normalizeTitle(incoming.title)
      const duplicate = byNormalizedTitle.get(normIncoming)

      if (duplicate && duplicate.external_id !== incoming.external_id && duplicate.type === incoming.type) {
        const merged_entry = mergeEntries(duplicate, incoming)

        const { error } = await supabase
          .from('user_media_entries')
          .update(merged_entry)
          .eq('id', duplicate.id)

        if (!error) {
          merged++
          // Aggiorna le mappe locali
          byExternalId.delete(duplicate.external_id)
          byExternalId.set(incoming.external_id, { ...merged_entry, id: duplicate.id })
          byNormalizedTitle.set(normIncoming, { ...merged_entry, id: duplicate.id })
        } else {
          logger.error(`${logPrefix} merge update error:`, JSON.stringify(error))
          // Fallback: inserisci come nuova riga
          const { error: e2 } = await supabase.from('user_media_entries').insert({ ...incoming, user_id: userId, display_order: Date.now() })
          if (!e2) imported++
          else skipped++
        }
        continue
      }

      // ── Caso 3: titolo nuovo → INSERT ────────────────────────────────────
      const { error } = await supabase
        .from('user_media_entries')
        .insert({ ...incoming, user_id: userId, display_order: Date.now() })

      if (!error) {
        imported++
        byExternalId.set(incoming.external_id, incoming)
        byNormalizedTitle.set(normIncoming, incoming)
      } else {
        logger.error(`${logPrefix} insert error:`, JSON.stringify(error))
        skipped++
      }

    } catch (e: any) {
      logger.error(`${logPrefix} unexpected error:`, e)
      skipped++
    }
  }

  return { imported, merged, skipped }
}

// ── Fallback senza merge (usato se il fetch iniziale fallisce) ────────────────

async function fallbackInsert(
  supabase: any,
  toInsert: any[],
  logPrefix: string
): Promise<{ imported: number; merged: number; skipped: number }> {
  let imported = 0
  let skipped = 0

  for (let i = 0; i < toInsert.length; i += 50) {
    const ts = Date.now()
    const batch = toInsert.slice(i, i + 50).map((item, j) => ({
      ...item,
      display_order: item.display_order ?? (ts - j * 1000),
    }))
    const { error } = await supabase.from('user_media_entries').insert(batch)
    if (!error) imported += batch.length
    else skipped += batch.length
  }

  return { imported, merged: 0, skipped }
}