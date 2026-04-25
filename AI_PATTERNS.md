# Segnali di assistenza AI nel codebase Geekore

Lista di pattern nel codice e nell'estetica del sito che rivelano l'uso di Claude (o altro LLM) durante lo sviluppo.

---

## 1. Identificatori di feature nei commenti (`P#`, `C#`, `M#`, `S#`, `A#`, `N#`)

Sparsi in tutto il codebase ci sono commenti con codici tipo `P3`, `C1`, `M6`, `S2`, `A6`, `N5`. Sono tracce delle iterazioni fatte con Claude, dove ogni "round" veniva taggato con un codice per tener traccia delle modifiche.

**Esempi:**
- `src/components/feed/FeedCard.tsx:2–5` → `// C5:`, `// M6:`, `// A6:`
- `src/components/ui/Avatar.tsx:2–4` → `// P3:`
- `src/lib/logger.ts:1` → `// S5:`
- `src/app/feed/page.tsx:1–13` → `// P2`, `// P5`, `// CAT`, `// IGF`, `// FLT`, `// AFF`
- `src/components/ui/SkeletonCard.tsx:2–4` → `// P5:`, `// N5:`

---

## 2. Separatori ASCII decorativi in eccesso (`// ──────`)

Il pattern `// ──` appare **351 volte** nel codebase. È un modo tipico di Claude per "organizzare visivamente" le sezioni di codice nelle sue risposte. Nessun developer umano usa separatori così sistematicamente.

**Esempi:**
- `src/app/page.tsx:11` → `// ─── Fetch dati reali ────────────────────`
- `src/app/page.tsx:40` → `// ─── Contatori animati via CSS ───────────`
- `src/app/feed/page.tsx` → sezioni separate con `// ── Nome sezione ─────────────`

---

## 3. Commenti codice "TASTE ENGINE V5 — Full Signal Stack"

Intestazioni pompose con numeri di versione espliciti nei commenti, stile documentazione da prompt.

**File:** `src/app/api/recommendations/route.ts:1–50`
- Titolo `// TASTE ENGINE V5 — "Full Signal Stack"` con bullet points `•` e lista di feature

---

## 4. Documentazione "problem → solution" prima del codice

Pattern tipico delle risposte AI: spiegare il problema, poi la soluzione, poi il codice.

**File:** `src/lib/importMerge.ts:1–18`
```
// Problema: lo stesso titolo importato da fonti diverse crea righe duplicate.
// Soluzione: prima di inserire, cerca righe esistenti con titolo simile...
```

---

## 5. Commenti ridondanti che spiegano l'ovvio

Commenti che ripetono due volte la stessa cosa, o che spiegano logica già leggibile dal codice.

**File:** `src/lib/activity.ts:22–35`
```ts
// Non bloccare mai l'azione principale per un errore di log
await supabase.from('activity_log').insert({ ... })
} catch {
  // Non bloccare mai l'azione principale per un errore di log  ← ripetuto
}
```

---

## 6. Metriche precise non verificabili nei commenti

**File:** `src/components/ui/Avatar.tsx:3`
```ts
// Risparmio bandwidth stimato: 80% per gli avatar
```
Il "80%" è inventato da Claude per sembrare convincente.

---

## 7. Over-typing: 250+ `interface` / `type` nel codebase

Un componente singolo come `FeedCard.tsx` esporta 5 interface separate (`PostProfile`, `PostComment`, `PostLike`, `FeedPost`, `FeedCardProps`). È il pattern tipico di Claude che genera il boilerplate TypeScript "completo" anche quando non serve.

---

## 8. Proliferazione di `useState` uno per uno

**File:** `src/components/feed/FeedCard.tsx:77–87` — 11 `useState` separati per un componente singolo.  
**File:** `src/components/import/SteamImport.tsx:18–23` — 6 `useState` tutti con naming pattern identico `[loading, setLoading]`, `[importing, setImporting]`, ecc.

Un developer esperto userebbe `useReducer` o un oggetto di stato unificato.

---

## 9. Nomi di variabili ultra-descrittivi e prevedibili

- `likeAnimating`, `commentCharCount`, `commentsFetched`, `hasLiked`, `isSubmitting`, `timeAgo`
- `handleLike`, `handleToggleComments`, `handleCommentChange`, `handleSendComment`, `handleDeleteComment`, `handleExportData`, `handleImport`

Il pattern `handleX` / `processX` / `formatX` è il default di ogni risposta Claude quando genera handlers.

---

## 10. Emoji nei dati come decorazione

**File:** `src/components/for-you/PreferencesModal.tsx:18–24`
```ts
{ label: '🌑 Dark anime' }
{ label: '⚔️ Gamer RPG' }
{ label: '🎬 Cinefilo europeo' }
```

**File:** `src/app/api/cron/email-digest/route.ts`
```ts
const typeEmoji = { anime: '📺', manga: '📚', game: '🎮', movie: '🎬', tv: '📡' }
subject: `🎮 Il tuo digest Geekore — ...`
```

Claude aggiunge emoji per "rendere più friendly" i dati — non è un pattern naturale in codice di produzione.

---

## 11. Palette colori "cool tech gradient" da manuale

Tutto il sito usa `violet-500 → fuchsia-600 → cyan-400` su sfondo `zinc-900/zinc-800`. È esattamente la palette che un LLM suggerisce per un "sito tech moderno".

**File:** `src/app/page.tsx:224`
```tsx
className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400"
```

---

## 12. Copy del sito troppo generico / marketing

**File:** `src/app/page.tsx:214–232`
```
"Traccia tutto ciò che ami"
"Anime, manga, videogiochi, serie TV e film in un unico profilo.
Condividi i tuoi progressi con la community."
```

**Footer:** `"Geekore — fatto con passione per i geek"`

Testo che tenta di sembrare umano ma suona come output di un prompt "scrivi una landing page per un sito di tracking geek".

---

## 13. Nomi file eccessivamente descrittivi e metodici

- `ServiceWorkerRegistrar.tsx`
- `ClientProviders.tsx`
- `PWAInstallBanner.tsx`

Nomi che seguono alla lettera le convenzioni "best practice" senza nessuna deviazione personale — tipico di codice generato.

---

## 14. Import ordinati alfabeticamente in modo meccanico

**File:** `src/app/home/page.tsx:4–9` — tutti gli import sono in ordine preciso, senza il disordine naturale che accumula un developer nel tempo.

---

## Riepilogo

| Categoria | Segnale principale |
|---|---|
| Commenti | Codici `P#`/`C#`/`S#`, separatori `// ──` (×351), metriche inventate |
| Struttura | Over-typing, 11 useState per componente, import ordinati |
| Nomi | `handleX`, variabili ultra-descrittive, file con nomi "da manuale" |
| UI/Design | Gradient violet→fuchsia→cyan, emoji decorativi nei dati |
| Testo | Copy generico, footer finto-umano |
