# GEEKORE — ANALISI COMPLETA DEL CODEBASE
### Revisione approfondita: bug, sicurezza, architettura, UX, performance
*Aprile 2026 — Ogni problema è documentato con file, riga e soluzione*

---

## INDICE

1. [BUG CRITICI CHE ROMPONO L'APP](#1-bug-critici-che-rompono-lapp)
2. [FALLE DI SICUREZZA ATTIVE](#2-falle-di-sicurezza-attive)
3. [PROBLEMI DI ARCHITETTURA](#3-problemi-di-architettura)
4. [BUG DI LOGICA E COMPORTAMENTO ANOMALO](#4-bug-di-logica-e-comportamento-anomalo)
5. [PROBLEMI DI PERFORMANCE GRAVI](#5-problemi-di-performance-gravi)
6. [UX ROTTA O CONFUSA](#6-ux-rotta-o-confusa)
7. [CODICE MORTO E FILE INUTILI](#7-codice-morto-e-file-inutili)
8. [PROBLEMI TYPESCRIPT E QUALITÀ](#8-problemi-typescript-e-qualità)
9. [DATABASE: SCHEMA INCOMPLETO E INCOERENTE](#9-database-schema-incompleto-e-incoerente)
10. [FUNZIONALITÀ MEZZE IMPLEMENTATE](#10-funzionalità-mezze-implementate)
11. [ACCESSIBILITÀ E SEO](#11-accessibilità-e-seo)
12. [ORDINE DI PRIORITÀ ASSOLUTA](#12-ordine-di-priorità-assoluta)

---

## 1. BUG CRITICI CHE ROMPONO L'APP

### 1.1 — Il redirect di `/profile/me` punta a `/dashboard` se non c'è username
**File:** `src/app/profile/me/page.tsx`

```typescript
if (profile?.username) {
  redirect(`/profile/${profile.username}`)
} else {
  redirect('/dashboard') // ← QUESTA PAGINA NON ESISTE
}
```

`/dashboard` è listata in `ARCHITETTURA.md` come **"form inutile non collegato a niente"** e andrebbe eliminata. Quindi ogni nuovo utente che si registra ma non ha ancora uno username viene mandato su una pagina vuota/inesistente. Il redirect corretto sarebbe `/profile/setup` o `/onboarding`.

---

### 1.2 — `supabase-schema.sql` e il codice usano colonne diverse
**File:** `supabase-schema.sql` vs `src/app/profile/[username]/page.tsx`

Lo schema SQL definisce `user_media_entries` con colonne `media_id` (FK a `media`), `score`, `progress`. Il codice invece usa:
- `cover_image` (non nello schema)
- `external_id` (non nello schema, aggiunto in `TODO-GEEKORE.md` come ALTER)
- `current_episode` (non nello schema)
- `current_season` (non nello schema)
- `season_episodes` (non nello schema)
- `display_order` (non nello schema)
- `is_steam` (non nello schema)
- `appid` (non nello schema)
- `notes` (non nello schema)
- `rating` (non nello schema — lo schema ha `score`)

**Il database reale non corrisponde allo schema commitato.** `supabase-schema.sql` è completamente fuori sincronia con il codice attuale. Chiunque voglia fare un deploy fresco ottiene un database che non funziona con il codice.

---

### 1.3 — Race condition nell'import Steam: dati Steam scritti senza `external_id`
**File:** `src/app/profile/[username]/page.tsx` → `importSteamGames()`

```typescript
await supabase.from('user_media_entries').upsert(steamMedia, { onConflict: 'user_id,title' })
```

Il conflitto è su `(user_id, title)` ma la colonna `external_id` esiste nel codice e viene scritta come `appid`. Se un utente ha due giochi con lo stesso nome (succede: DLC e base game a volte hanno nomi simili), uno sovrascrive l'altro. Il conflitto corretto dovrebbe essere su `(user_id, appid)` o `(user_id, external_id)`.

---

### 1.4 — `Navbar.tsx` chiama `useEffect` dopo un `return null` condizionale
**File:** `src/components/Navbar.tsx`

```typescript
if (AUTH_PATHS.some(p => pathname.startsWith(p))) return null

useEffect(() => { ... }, []) // ← HOOKS DOPO UN RETURN CONDIZIONALE
useEffect(() => { ... }, [])
```

Questo viola la **Rules of Hooks** di React. Gli hook devono sempre essere chiamati nello stesso ordine — un `return` prima degli `useEffect` causa un crash in development e comportamento imprevedibile in production. L'app probabilmente non esplode solo perché il percorso con `return null` viene quasi mai visitato con navigazione client-side, ma è tecnicamente broken.

**Fix:** Spostare i due `useEffect` prima del `return null` condizionale.

---

### 1.5 — `src/app/profile/[username]/page.tsx`: `use(params)` in un Client Component
**File:** `src/app/profile/[username]/page.tsx`

```typescript
export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params)
```

`use()` per i parametri delle route è un pattern di React 19 / Next.js 15+. Con `next: "^16.2.2"` (che è in realtà Next.js 15/16) e `react: "^18"` questa combinazione è instabile. In alcuni ambienti di build `use(params)` nei Client Components può causare Suspense boundaries inattesi o errori di hydration. La soluzione sicura è usare `useParams()` di `next/navigation` nei client components.

---

### 1.6 — Il feed carica commenti senza profili se `uniqueUserIds` è vuoto
**File:** `src/app/feed/page.tsx` → `loadPosts()`

```typescript
if (uniqueUserIds.length > 0) {
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in('id', uniqueUserIds);
}
```

Se non ci sono commenti, `profileMap` rimane `{}` — corretto. Ma il problema è che i commenti nei post mostrano già `username: 'utente'` come fallback invece del nome reale per i commenti preesistenti che vengono caricati la prima volta. Questo perché la query dei profili dei commenti funziona solo per i post caricati in quella sessione, non per i commenti già presenti con dati parziali.

---

### 1.7 — `src/components/feed/StoriesBar.tsx` usa `createBrowserClient` direttamente
**File:** `src/components/feed/StoriesBar.tsx`

```typescript
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

Viola le linee guida di `ARCHITETTURA.md` che dicono esplicitamente: **"NON usare più `createClient` da `@supabase/supabase-js` direttamente"**. Dovrebbe usare `import { createClient } from '@/lib/supabase/client'`. Stesso problema in `src/components/dashboard/profile-form.tsx`, `src/components/feed/StoriesBar.tsx`, `src/lib/api.ts`, `src/lib/supabase.ts` (shim ma comunque inconsistente).

---

### 1.8 — `src/app/wishlist/page.tsx` — La tabella `wishlist` potrebbe non esistere
**File:** `src/app/wishlist/page.tsx`

```typescript
try {
  const { data } = await supabase.from('wishlist').select('*')...
  wishlist = data || []
} catch {
  // Tabella non ancora creata — mostra empty state
}
```

Il codice gestisce silenziosamente l'assenza della tabella mostrando uno stato vuoto. Ma `supabase-schema.sql` non include la tabella `wishlist`. Significa che in un deploy fresco la wishlist non funzionerà mai e l'utente vedrà sempre "Wishlist vuota" senza mai ricevere un errore che lo avvisi del problema reale.

---

## 2. FALLE DI SICUREZZA ATTIVE

### 2.1 — `SUPABASE_SERVICE_ROLE_KEY` usata in un route accessibile pubblicamente
**File:** `src/app/api/boardgames/route.ts`

```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // ← SERVICE ROLE KEY IN UN ROUTE FILE
)
```

La service role key bypassa completamente RLS. Questo file è una API route pubblica: chiunque può chiamare `/api/boardgames` con parametri crafted e, se ci fosse un bug nella logica, avrebbe accesso con privilegi massimi al database. La service role key va usata SOLO in ambienti trusted server-side con validazione fortissima dell'input. Stessa cosa in `src/app/api/steam/games/route.ts`.

---

### 2.2 — Nessuna validazione del tipo MIME nell'upload immagini post
**File:** `src/app/feed/page.tsx` → `handleCreatePost()`

```typescript
const { error: uploadError } = await supabase.storage
  .from('post-images')
  .upload(fileName, selectedImage);
```

Il frontend accetta `accept="image/*"` ma questo è bypassabile. Lato server, non c'è nessun controllo che il file caricato sia effettivamente un'immagine. Un utente malintenzionato può caricare un file SVG con script embeddati (XSS via SVG), un file HTML, o file arbitrari. Manca la validazione MIME type lato server prima dell'upload.

---

### 2.3 — Il filtro `feedFilter === 'following'` è solo client-side
**File:** `src/app/feed/page.tsx` → `loadPosts()`

```typescript
if (filter === 'following' && followingIds.length > 0) {
  query = query.in('user_id', followingIds);
}
```

I `followingIds` vengono recuperati client-side e poi usati per filtrare. Questo è sicuro per la visualizzazione, ma non per la privacy: se RLS non è configurata correttamente, l'utente potrebbe manipolare la query per vedere post di utenti non seguiti. La logica dovrebbe essere una SQL View o una RPC Supabase server-side.

---

### 2.4 — `src/components/NewsSync.tsx` usa `localStorage` per il cooldown
**File:** `src/components/NewsSync.tsx`

```typescript
const lastSync = localStorage.getItem("gk_last_sync");
```

Il cooldown è bypassabile da qualsiasi utente semplicemente aprendo DevTools e cancellando `localStorage`. Non è una protezione reale. Il rate limiting deve essere server-side (come già correttamente fatto per Steam in `steam_import_log`), non client-side.

---

### 2.5 — Mancanza di CSRF protection nelle API route
Le API route POST (`/api/igdb`, `/api/boardgames`, `/api/news/sync`) non hanno nessuna protezione CSRF. In Next.js App Router questo è meno critico grazie ai CORS predefiniti, ma un'API route che modifica dati su Supabase con service role key senza verificare l'origine della richiesta è un rischio.

---

### 2.6 — Il logout non invalida la sessione server-side
**File:** `src/app/profile/[username]/page.tsx`

```typescript
onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
```

`supabase.auth.signOut()` invalida il token nel browser ma non revoca necessariamente la sessione lato Supabase in tutti gli scenari (dipende dalla configurazione). In ambienti condivisi (computer pubblici), questo potrebbe lasciare sessioni attive.

---

## 3. PROBLEMI DI ARCHITETTURA

### 3.1 — Due sistemi di tabelle `user_media_entries` in conflitto
Il codice usa `user_media_entries` come tabella flat con tutti i dati media inline (`title`, `cover_image`, `external_id`, ecc.). Lo schema SQL usa invece `media` (tabella separata) + `user_media_entries` (tabella di join). Questi due approcci sono incompatibili. Il codice reale ha scelto la tabella flat (più semplice), ma lo schema suggerisce normalizzazione. **Il risultato è che lo schema è inutile** e chiunque lo esegua ottiene strutture DB incompatibili con il codice.

---

### 3.2 — `src/lib/supabase.ts` è uno shim che non dovrebbe esistere
**File:** `src/lib/supabase.ts`

```typescript
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
```

Questo esporta un singleton client-side. I componenti che lo importano fuori da un contesto browser (es. durante SSR) potrebbero ottenere comportamenti imprevisti. `ARCHITETTURA.md` stessa dice di non usarlo direttamente, ma viene ancora referenziato in vari file (es. `src/lib/api.ts`).

---

### 3.3 — `src/components/layout/BottomNav.tsx` e `src/components/Navbar.tsx` sono duplicati
Esistono due navbar:
- `src/components/Navbar.tsx` — quella usata realmente nel layout
- `src/components/layout/BottomNav.tsx` — quella alternativa non usata

`ARCHITETTURA.md` elenca già diversi file da eliminare ma non questi. Avere due navbar aumenta il rischio di divergenza e confusione.

---

### 3.4 — `src/components/layout/AppShell.tsx` importa `BottomNav` che non funziona
**File:** `src/components/layout/AppShell.tsx`

```typescript
import { BottomNav } from '@/components/layout/BottomNav'
```

`BottomNav` usa `cn()` da `@/lib/utils` che a sua volta importa `MediaType` da `@/types`. `MediaType` è definita con valori `'anime' | 'manga' | 'game' | 'board'` ma il codice usa anche `'tv' | 'movie' | 'boardgame'`. C'è incoerenza tra i tipi nel sistema.

---

### 3.5 — `src/app/explore/page.tsx` importa `FeedCard` ma `FeedCard` richiede dati che non vengono passati
**File:** `src/app/explore/page.tsx`

```typescript
const { data: allPosts } = await supabase
  .from('posts')
  .select(`*, profiles:user_id (*)`)
  .order('created_at', { ascending: false })
  .limit(20)
```

`FeedCard` si aspetta `post.likes` e `post.comments` (array), ma la query di `explore` seleziona solo `*, profiles`. Nessun like, nessun commento. `FeedCard` prova ad accedere a `post.likes?.length` che è `undefined` → mostra 0 likes sempre, e il toggle like non funzionerà correttamente.

---

## 4. BUG DI LOGICA E COMPORTAMENTO ANOMALO

### 4.1 — La paginazione del feed resetta quando si cambia filtro ma non ripristina `page`
**File:** `src/app/feed/page.tsx` → `handleFilterChange()`

```typescript
const handleFilterChange = async (filter: 'all' | 'following') => {
  setFeedFilter(filter);
  setPage(0);
  setHasMore(true);
  await loadPosts(currentUser.id, 0, false, filter);
};
```

Corretto — `page` viene resettato. Ma `loadMore()` usa `page` dallo state che viene aggiornato con `setPage(nextPage)`:

```typescript
const loadMore = async () => {
  const nextPage = page + 1;
  setPage(nextPage);
  await loadPosts(currentUser.id, nextPage, true, feedFilter); // feedFilter corretto
};
```

Il problema è che `loadMore` usa `feedFilter` dallo state ma se l'utente cambia filtro mentre il caricamento è in corso, `loadMore` potrebbe usare il filtro sbagliato (closure stale). È un caso raro ma reale.

---

### 4.2 — `markAsCompleted` per media senza `season_episodes` e senza `episodes`
**File:** `src/app/profile/[username]/page.tsx` → `markAsCompleted()`

```typescript
} else {
  update = { current_episode: 999 }
}
```

Se un media non ha né stagioni né episodi (es. un film aggiunto tramite discover), il "completato" viene impostato a episodio 999. Poi nella `MediaCard` la logica di `isCompleted` controlla `media.current_episode >= maxEpisodesThisSeason` dove `maxEpisodesThisSeason = media.episodes || 0`. Se `episodes` è `null`, `maxEpisodesThisSeason = 0`, quindi `999 >= 0` è vero — il film appare completato. Ma visivamente la progress bar mostrerebbe `Ep. 999 / 0` se renderizzata. Fortunatamente per i film la card non mostra progress, ma la logica rimane fragile.

---

### 4.3 — Rating a mezze stelle ma salvato come numero intero nel DB
**File:** `src/components/ui/StarRating.tsx` e `src/app/profile/[username]/page.tsx`

`StarRating` supporta mezze stelle (`.5`):
```typescript
onClick={() => onChange?.(value === star - 0.5 ? 0 : star - 0.5)}
```

Ma la colonna `rating` in `user_media_entries` potrebbe essere definita come `INTEGER` nel DB (in `supabase-schema.sql` è `score INTEGER`). Salvare `2.5` in un campo INTEGER causerebbe troncamento silenzioso a `2`. Necessaria una verifica che la colonna sia `NUMERIC` o `DECIMAL`.

---

### 4.4 — `discover/page.tsx`: `handleAdd` apre sempre il modal anche per film/giochi/boardgame
**File:** `src/app/discover/page.tsx` → `handleAdd()`

```typescript
const handleAdd = async (media: MediaItem) => {
  if (alreadyAdded.includes(media.id)) return;
  setSelectedMedia(media);
  setModalRating(0);
  setSelectedSeason(1);
  setCurrentEpisode('');
};
```

Per film, giochi e boardgame il modal viene aperto per permettere di votare. Il testo dice "Aggiungi ai progressi" ma per i film mostra "Il film verrà aggiunto come completato" — quindi l'utente sta aprendo un modal solo per eventualmente dare un voto. Questo è accettabile ma c'è un problema: se l'utente preme "Aggiungi" nel modal senza dare un voto, non c'è feedback visivo del fatto che stia per aggiungere il media. Il pulsante "Aggiungi" non è disabilitato correttamente per tutti i tipi.

---

### 4.5 — `confirmAdd`: la condizione `disabled` è castata in modo pericoloso
**File:** `src/app/discover/page.tsx`

```typescript
disabled={adding || (
  selectedMedia.type !== 'movie' &&
  selectedMedia.type !== 'game' &&
  selectedMedia.episodes && selectedMedia.episodes > 1 && (
    !currentEpisode ||
    Number(currentEpisode) < 1 ||
    Number(currentEpisode) > (...)
  )
) as boolean}
```

Il cast `as boolean` su un'espressione che potrebbe essere `undefined | number | boolean` nasconde potenziali errori TypeScript. `selectedMedia.episodes && selectedMedia.episodes > 1` ritorna il numero `selectedMedia.episodes` (truthy) se vero, non un boolean. Il cast maschera questo.

---

### 4.6 — Le notifiche vengono segnate come lette quando si entra nella pagina, anche quelle non viste
**File:** `src/app/notifications/page.tsx`

```typescript
await supabase.from('notifications').update({ is_read: true }).eq('receiver_id', user.id)
```

Tutte le notifiche vengono segnate come lette non appena l'utente visita la pagina, anche quelle sotto la fold che l'utente non ha ancora visto. Un approccio migliore sarebbe usare Intersection Observer per segnare come lette solo quelle effettivamente visibili.

---

### 4.7 — `src/app/explore/page.tsx` è un Server Component ma `FeedCard` è Client
Il server component recupera i post e li passa a `FeedCard` (client component). Il problema: `FeedCard` gestisce internamente like, commenti, stato dell'utente con `supabase.auth.getUser()`. Questo causa un doppio fetch: il server già sa chi è l'utente, ma `FeedCard` lo recupera di nuovo client-side. Inefficiente e potenzialmente inconsistente.

---

## 5. PROBLEMI DI PERFORMANCE GRAVI

### 5.1 — Il profilo fa N query per ogni categoria di media
**File:** `src/app/profile/[username]/page.tsx` → `useEffect fetchData()`

```typescript
const { data: mediaData } = await supabase
  .from('user_media_entries')
  .select('*')
  .eq('user_id', profileData.id)
```

Una sola query, poi il raggruppamento avviene in JavaScript. Questo va bene. **MA** la pagina fa anche:
1. Query profilo
2. Query steam account
3. Query media
4. Query count followers
5. Query count following
6. Query follow status

Sono **6 query sequenziali** al caricamento della pagina. Alcune potrebbero essere parallele con `Promise.all`, ma solo le ultime tre lo sono. Le prime tre sono sequenziali perché dipendenti l'una dall'altra (serve `profileData.id` per le successive). Tuttavia steam account, media, contatori e follow status potrebbero tutti partire in parallelo dopo aver ottenuto `profileData.id`.

**Fix:**
```typescript
const [{ data: steam }, { data: mediaData }, { count: fwers }, ...] = await Promise.all([
  supabase.from('steam_accounts').select('*').eq('user_id', profileData.id).maybeSingle(),
  supabase.from('user_media_entries').select('*').eq('user_id', profileData.id),
  supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileData.id),
  // ...
])
```

---

### 5.2 — `DndContext` wrappa ogni categoria separatamente
**File:** `src/app/profile/[username]/page.tsx`

```typescript
orderedCategories.map((category) => (
  <DndContext ...>
    <SortableContext ...>
```

Ogni categoria ha il suo `DndContext`. Questo significa che il drag-and-drop funziona solo all'interno della stessa categoria — non puoi trascinare un Anime nella sezione Manga. Ma soprattutto, crea N istanze di DndContext che si registrano tutte separatamente come event listener globali, pesando sul DOM.

---

### 5.3 — `src/app/discover/page.tsx`: fetch TMDb fa N richieste di dettaglio per ogni risultato
**File:** `src/app/discover/page.tsx`

```typescript
const detailedResults = await Promise.all(
  searchJson.results.map(async (m: any) => {
    if (mediaType === 'tv') {
      const detailRes = await fetch(`https://api.themoviedb.org/3/tv/${m.id}?...`)
```

Per ogni risultato TV (fino a 20 risultati), viene fatta una richiesta separata per i dettagli. Questo significa fino a **20 richieste HTTP parallele a TMDb per ogni ricerca**. Con rate limiting di TMDb (40 request/10 secondi per chiave API), rischi di essere throttled con ricerche frequenti.

---

### 5.4 — `src/components/ui/StarRating.tsx` crea filtri SVG con ID duplicati
**File:** `src/components/ui/StarRating.tsx`

```typescript
const clipId = `star-half-${star}-${size}`
// filter id:
<filter id={`glow-${star}-${size}`}>
```

Se ci sono più `StarRating` nella stessa pagina (es. griglia di 50 card nel profilo), vengono creati ID SVG duplicati nel DOM. I browser usano il primo elemento trovato con quell'ID — le stelle di rating nelle card successive potrebbero mostrare l'effetto glow/clip sbagliato. Serve un `useId()` di React per garantire unicità.

---

### 5.5 — Il profilo non ha nessun caching dei dati
Ogni visita al profilo (anche il tuo) fa 6+ query a Supabase. Non c'è `useSWR`, non c'è `React Query`, non c'è cache HTTP. Per un profilo pubblico molto visitato, questo è costoso. Almeno il profilo pubblico di altri utenti dovrebbe essere cacheable (i dati cambiano raramente).

---

## 6. UX ROTTA O CONFUSA

### 6.1 — Il pulsante "Logout" è nell'header del profilo ma non in Navbar
Il logout appare solo nella pagina profilo:
```typescript
{currentUserId && (
  <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}>
    Logout
  </button>
)}
```

Non è accessibile da nessun'altra pagina. Su mobile, se sei nel feed, non puoi fare logout senza navigare prima al profilo. Standard UX vuole il logout in un menu accessibile globalmente.

---

### 6.2 — `src/app/feed/page.tsx`: il form di creazione post non ha nessun contatore di caratteri
L'area di testo per i post non mostra quanti caratteri hai scritto né ha un limite visibile. Nemmeno la colonna `content` del DB ha un `CHECK` di lunghezza massima dichiarato nello schema.

---

### 6.3 — La ricerca in Discover si attiva dopo 2 caratteri MA il placeholder dice "Cerca titolo..."
Quando cerchi con 1 carattere, non succede nulla e non c'è feedback visivo che la ricerca non sia ancora partita. L'utente non sa perché non vede risultati.

---

### 6.4 — Le card nel profilo hanno altezza fissa `h-[520px]` con contenuto variabile
**File:** `src/app/profile/[username]/page.tsx`

Alcune card (film senza progress, boardgame con poche partite) avranno spazio vuoto eccessivo in basso. Altre con titoli lunghi potrebbero avere il testo troncato o il layout compromesso. L'altezza fissa non si adatta bene a tutti i tipi di media.

---

### 6.5 — Il pulsante "Riordina per ore" non dà feedback finché non è completato
**File:** `src/app/profile/[username]/page.tsx`

```typescript
const [reorderingGames, setReorderingGames] = useState(false)
```

L'animazione `animate-spin` sul testo è presente, ma il pulsante ha `disabled:opacity-50` — quindi durante il riordino il pulsante diventa semi-trasparente senza spiegare cosa sta succedendo.

---

### 6.6 — Messaggio di conferma Steam sovrascrive senza animazione
```typescript
setSteamMessage({ text: data.error, type: 'error' })
```

Il messaggio appare istantaneamente senza transizione, poi rimane lì per sempre senza auto-dismissione. L'utente deve rifare un'azione per far sparire il messaggio.

---

### 6.7 — `discover/page.tsx`: boardgame aggiunge con `current_episode: 0`
**File:** `src/app/discover/page.tsx` → `addDirectly()`

```typescript
current_episode: isBoardgame ? 0 : 1,
```

Il boardgame viene aggiunto con 0 partite giocate. Nella `MediaCard` del profilo:
```typescript
<p className="text-emerald-400 text-sm">
  {media.current_episode} {media.current_episode === 1 ? 'partita' : 'partite'}
```

`0 partite` è corretto ma strano come prima visualizzazione. Meglio iniziare da 0 e mostrare "Non ancora giocato" se è 0.

---

### 6.8 — Nessun feedback dopo follow/unfollow sui contatori
**File:** `src/components/profile/follow-button.tsx`

Quando clicchi "Segui", il pulsante cambia stato ma i contatori `followersCount` nella pagina profilo rimangono fermi fino al ricaricamento. Non c'è aggiornamento ottimistico dei contatori.

---

## 7. CODICE MORTO E FILE INUTILI

### File da eliminare (identificati in ARCHITETTURA.md ma ancora presenti)

| File | Motivo |
|------|--------|
| `src/components/feed/StoriesBar.tsx` | Non usato in nessuna pagina |
| `src/components/layout/AppShell.tsx` | Non usato nel layout principale |
| `src/components/layout/BottomNav.tsx` | Sostituito da `Navbar.tsx` |
| `src/components/profile/edit-profile-modal.tsx` | Sostituito da `/profile/edit` page |
| `src/components/providers/supabase-provider.tsx` | Non usato nel layout attuale |
| `src/components/dashboard/profile-form.tsx` | Dashboard eliminata |
| `src/lib/api.ts` | Usa client deprecato, non importato da nessuna pagina attuale |
| `src/lib/api/anilist.ts` | Non importato da nessuna parte (la logica AniList è inline in discover) |
| `src/components/SteamConnectButton.tsx` | Duplicato della logica già in `profile/[username]/page.tsx` |

---

### Componenti definiti ma mai usati

- `src/components/ui/MediaBadge.tsx` — Importa `MediaType` e `cn`, non è usato da nessuna pagina
- `src/components/ui/avatar.tsx` — Componente Avatar custom, non usato (il profilo usa `<img>` direttamente)
- `src/components/NewsSync.tsx` — Non è incluso in nessun layout o pagina
- `src/components/feed/FeedCard.tsx` — Usato solo in `explore/page.tsx` che carica post senza likes/commenti (bug 4.7 sopra)

---

### Variabili e import inutilizzati

**`src/app/api/steam/route.ts`:**
```typescript
let totalAchieved = 0;  // ← MAI USATA
let totalPossible = 0;  // ← MAI USATA
const gamesWithStats = await Promise.all(...)  // ← Calcola ma restituisce placeholder
const corePower = 75; // Placeholder del tuo calcolo finale ← HARDCODED
```

Questo file sembra un vecchio draft lasciato lì. La route Steam "principale" non fa nulla di utile — calcola `corePower = 75` sempre.

---

## 8. PROBLEMI TYPESCRIPT E QUALITÀ

### 8.1 — `any` ovunque nel codice critico

**`src/app/profile/[username]/page.tsx`:**
```typescript
const importSteamGames = async () => {
  const steamMedia = data.games.map((game: any) => ({  // any
```

**`src/app/api/boardgames/route.ts`:**
```typescript
const items = (searchResult?.boardgames?.boardgame || []).slice(0, 8)
// ...
.map((item: any) => { // any in ogni map
```

**`src/app/api/igdb/route.ts`:**
```typescript
const formattedGames = games.map((g: any) => ({  // any
```

**`src/app/explore/page.tsx`:**
```typescript
{allPosts?.map((post: any) => (  // any
```

Quasi ogni risposta API viene tipizzata come `any`. Questo significa che refactoring futuro non verrà aiutato dal compilatore.

---

### 8.2 — `src/types/index.ts` è completamente disallineato dal codice reale

`types/index.ts` definisce:
```typescript
export type MediaType = 'anime' | 'manga' | 'game' | 'board'
```

Ma il codice usa:
```typescript
type: 'anime' | 'tv' | 'movie' | 'game' | 'manga' | 'boardgame'
```

`'board'` vs `'boardgame'`, mancano `'tv'` e `'movie'`. Il file dei tipi è letteralmente inutile perché nessuno lo importa nel codice effettivo delle pagine. Ogni pagina ridefinisce i propri tipi localmente.

---

### 8.3 — `src/app/leaderboard/page.tsx` usa dati che non esistono nello schema

```typescript
.order('completion_rate', { ascending: false })
```

La tabella `leaderboard` nello schema non ha `completion_rate`. Ha `core_power`. Il file usa `user.completion_rate` che sarà sempre `undefined`. La classifica mostra sempre 0% o undefined per tutti.

---

### 8.4 — `src/components/ui/StarRating.tsx`: il filtro SVG glow non funziona in tutti i browser

```typescript
filter={
  !viewOnly && hovered !== null && (hovered >= star - 0.5)
    ? `url(#glow-${star}-${size})`
    : undefined
}
```

I filtri SVG inline con riferimenti `url()` non funzionano in tutti i contesti in Safari e alcuni browser mobile quando il componente è in un elemento con `overflow: hidden` (come le card del profilo). Il glow effect potrebbe semplicemente non apparire.

---

## 9. DATABASE: SCHEMA INCOMPLETO E INCOERENTE

### 9.1 — Tabelle usate nel codice ma assenti nello schema SQL

| Tabella | Usata in |
|---------|---------|
| `wishlist` | `src/app/wishlist/page.tsx`, `src/app/discover/page.tsx` |
| `steam_import_log` | `src/app/api/steam/games/route.ts` |
| `steam_accounts` | `src/app/profile/[username]/page.tsx`, `src/app/api/steam/callback/route.ts` |
| `leaderboard` | `src/app/leaderboard/page.tsx`, `src/app/api/steam/route.ts` |

Nessuna di queste esiste in `supabase-schema.sql`. Chi clona il repo e crea il DB dallo schema ottiene un database che non può supportare il 40% delle funzionalità.

---

### 9.2 — Nessun indice dichiarato sulle colonne più usate

Query frequenti senza indici:
- `user_media_entries WHERE user_id = X` — nessun indice su `user_id`
- `follows WHERE follower_id = X` — l'indice in `supabase-schema.sql` c'è ma solo per `follower_id`, manca per `following_id`
- `notifications WHERE receiver_id = X AND is_read = false` — nessun indice compound
- `posts WHERE user_id = X` — lo schema ha `idx_posts_user_id` ma non `created_at DESC`

---

### 9.3 — RLS non include la tabella `wishlist` e `steam_import_log`

`supabase-rls.sql` configura RLS per molte tabelle ma manca per:
- `wishlist` — chiunque potrebbe leggere le wishlist altrui
- `steam_import_log` — chiunque potrebbe manipolare i log di importazione
- `steam_accounts` — presente nello script RLS ma non nello schema
- `leaderboard` — nessuna RLS

---

### 9.4 — La tabella `user_media_entries` nel codice non ha vincolo UNIQUE coerente

Il codice fa upsert con `{ onConflict: 'user_id,title' }` per i giochi Steam, ma per i media da Discover usa `insert` senza gestione del conflitto. Un utente che aggiunge lo stesso anime due volte (es. cercando di ri-aggiungerlo) riceve un errore Postgres non gestito invece di un messaggio utile.

---

## 10. FUNZIONALITÀ MEZZE IMPLEMENTATE

### 10.1 — `src/app/api/steam/route.ts` è un placeholder non funzionante

```typescript
const corePower = 75; // Placeholder del tuo calcolo finale
```

Questo endpoint calcola sempre `corePower = 75` per tutti. La leaderboard è quindi sempre falsa. L'endpoint non viene usato dalla pagina profilo (che usa `/api/steam/games`), ma viene chiamato da `StoriesBar` (che non è usata). È codice morto che scrive dati falsi nel DB.

---

### 10.2 — `src/app/news/page.tsx` non ha paginazione

Carica tutte le news dalla cache senza limite. Se la cache crescesse, il payload JSON potrebbe diventare enorme.

---

### 10.3 — `src/app/leaderboard/page.tsx` mostra dati sempre vuoti/falsi

Come detto, usa `completion_rate` che non esiste, e `core_power` è sempre `75` per chi ha sync Steam. La leaderboard è essenzialmente decorativa.

---

### 10.4 — `src/components/feed/StoriesBar.tsx` carica profili random

```typescript
const { data } = await supabase.from('profiles').select('username, avatar_url').limit(10)
```

Le "storie" mostrano 10 profili casuali dal DB, non quelli degli utenti seguiti né quelli attivi di recente. Non c'è nessuna logica di rilevanza.

---

### 10.5 — Nessuna gestione degli errori di rete nel discover

Se AniList, TMDb o IGDB sono down, `searchMedia()` cattura l'errore ma non mostra nessun messaggio all'utente:
```typescript
} catch (err) {
  console.error('Errore ricerca:', err);
}
```

L'utente vede semplicemente "Nessun risultato" senza sapere se è perché non esiste o perché c'è un errore.

---

## 11. ACCESSIBILITÀ E SEO

### 11.1 — Tutte le immagini di copertina mancano di `alt` descrittivi

In `discover/page.tsx`:
```html
<img src={item.coverImage} alt={item.title} ...>
```
Questo va bene. Ma in `MediaCard`:
```html
<img src={imageUrl} alt={media.title} ...>
```
E nel feed:
```html
<img src={post.image_url} alt="post" ...>
```
`alt="post"` è inutile per gli screen reader.

---

### 11.2 — Nessun `aria-label` sui pulsanti icon-only

In `MediaCard`:
```html
<button onClick={() => onDeleteRequest?.(media.id)}>
  <X className="w-5 h-5" />
</button>
```
Nessun `aria-label="Elimina"`. Gli screen reader leggono solo un pulsante vuoto.

---

### 11.3 — Open Graph manca da quasi tutte le pagine

Solo il layout root ha metadata OG. Le pagine chiave mancano:
- `/feed` — nessun OG
- `/discover` — nessun OG
- `/profile/[username]` — nessun OG (il TODO-GEEKORE lo segnala ma non è stato implementato)

---

### 11.4 — `lang="it"` nel layout ma contenuti misti italiano/inglese

```html
<html lang="it">
```

Alcune parti dell'UI sono in inglese ("Following", "Board Game", "Core Power", "Steam"). I contenuti delle API (titoli anime, nomi giochi) sono in varie lingue. `lang="it"` è tecnicamente scorretto per un'app multilingua/mista.

---

## 12. ORDINE DI PRIORITÀ ASSOLUTA

Le seguenti issue andrebbero fixate nell'ordine dato, prima di qualsiasi nuova feature:

### BLOCKERS IMMEDIATI (l'app è broken per nuovi utenti o rischiosa)

| # | Problema | File | Impatto |
|---|---------|------|---------|
| 1 | Redirect a `/dashboard` inesistente | `profile/me/page.tsx` | Ogni nuovo utente senza username è bloccato |
| 2 | Hooks dopo return condizionale | `Navbar.tsx` | Viola Rules of Hooks, crash possibile |
| 3 | Schema SQL completamente fuori sincronia | `supabase-schema.sql` | Deploy fresco non funzionante |
| 4 | `service_role_key` in API pubbliche | `api/boardgames`, `api/steam/games` | Rischio sicurezza elevato |
| 5 | `leaderboard` usa colonna inesistente | `leaderboard/page.tsx` | Feature completamente rotta |

### PRIORITÀ ALTA (bug visibili agli utenti)

| # | Problema | Impatto |
|---|---------|---------|
| 6 | Rating mezze stelle salvate come intero | Dati persi silenziosamente |
| 7 | `explore` FeedCard senza likes/commenti | Likes sempre 0 in /explore |
| 8 | ID SVG duplicati in StarRating | Rendering anomalo con molte card |
| 9 | Tabelle mancanti in RLS | Wishlist e steam log non protetti |
| 10 | Follow counter non aggiornato ottimisticamente | UX confusa dopo follow |

### DEBITO TECNICO (sistemare gradualmente)

- Eliminare tutti i file morti (9 file identificati in sezione 7)
- Allineare `src/types/index.ts` ai tipi reali usati
- Portare tutte le chiamate Supabase a `createClient` da `@/lib/supabase/client`
- Aggiungere `aria-label` ai pulsanti icon-only
- Sostituire `any` con tipi corretti nelle API route

---

*Documento generato da analisi statica del codice sorgente — Geekore Aprile 2026*
