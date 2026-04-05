# GEEKORE — ROADMAP COMPLETA DEI MIGLIORAMENTI
# Aggiornato: Aprile 2026
# Leggi tutto. Ogni sezione ha priorità e istruzioni esatte.

================================================================================
## PRIORITÀ 1 — SICUREZZA E STABILITÀ (fai prima di tutto il resto)
================================================================================

### 1.1 — Verifica email alla registrazione
PROBLEMA: Chiunque può registrarsi con email falsa.
COSA FARE:
  - Su Supabase → Authentication → Email → abilita "Confirm email"
  - La pagina /register già mostra "controlla la tua email" ma il flusso
    funziona solo se la conferma è abilitata su Supabase
  - Aggiungi una pagina /auth/confirm che riceve il token dall'email e
    reindirizza al profilo

### 1.2 — Rate limiting sulle API Steam
PROBLEMA: /api/steam/games fa decine di richieste HTTP a Steam senza limite.
  Un utente malintenzionato può chiamarla in loop e bruciare la tua quota.
COSA FARE in src/app/api/steam/games/route.ts:
  - Aggiungi un controllo: se l'utente ha già importato giochi nelle ultime
    24 ore, restituisci i dati cachati da Supabase invece di ri-chiamare Steam
  - Crea una tabella steam_import_log(user_id, imported_at) e controlla prima

### 1.3 — Validazione input server-side
PROBLEMA: I form del frontend validano i dati ma le API route no.
  Qualcuno può chiamare /api/igdb, /api/steam direttamente con dati spazzatura.
COSA FARE:
  - In ogni API route che accetta input, aggiungi controlli espliciti:
    if (!search || typeof search !== 'string' || search.length > 200) {
      return NextResponse.json({ error: 'Input non valido' }, { status: 400 })
    }
  - Aggiungi lunghezza massima ai campi del profilo (username max 30 chars,
    bio max 500 chars) sia nel frontend che nella tabella SQL con CHECK

### 1.4 — Protezione upload avatar
PROBLEMA: Il bucket "avatars" su Supabase potrebbe essere aperto in scrittura
  a tutti. Chiunque potrebbe caricare file arbitrari.
COSA FARE su Supabase → Storage → avatars → Policies:
  - INSERT: auth.uid()::text = (storage.foldername(name))[1]
    (solo nella propria cartella public/USER_ID-...)
  - UPDATE/DELETE: stessa policy
  - SELECT: true (pubblico in lettura)
  Fai lo stesso per il bucket "post-images"

### 1.5 — Rimuovi le chiavi API dal frontend
PROBLEMA: In .env.local hai NEXT_PUBLIC_IGDB_CLIENT_SECRET.
  Tutto quello che inizia con NEXT_PUBLIC_ è visibile nel browser.
  Chiunque può aprire DevTools e rubare il tuo client secret IGDB.
COSA FARE:
  - Rinomina NEXT_PUBLIC_IGDB_CLIENT_SECRET → IGDB_CLIENT_SECRET
    (senza NEXT_PUBLIC_)
  - In src/app/api/igdb/route.ts cambia:
    process.env.NEXT_PUBLIC_IGDB_CLIENT_SECRET
    → process.env.IGDB_CLIENT_SECRET
  - Fai lo stesso per NEXT_PUBLIC_IGDB_CLIENT_ID se viene usato solo lato server
  - Rigenera le chiavi IGDB/Twitch su dev.twitch.tv perché quelle attuali
    sono compromesse (visibili nel codice su GitHub)

### 1.6 — Il profilo /profile/me non funziona se non sei loggato
PROBLEMA: /profile/me reindirizza a /auth/login ma il path corretto è /login
COSA FARE in src/app/profile/me/page.tsx:
  Cambia: redirect('/auth/login')
  In:     redirect('/login')

### 1.7 — Supabase service role key esposta
PROBLEMA: SUPABASE_SERVICE_ROLE_KEY è nel repo (vedi .gitignore — manca .env.local!)
COSA FARE:
  - Aggiungi .env.local al .gitignore SUBITO (già presente ma verifica)
  - Verifica su GitHub che .env.local non sia mai stato committato:
    git log --all --full-history -- .env.local
  - Se è stato committato: vai su Supabase → Settings → API → rigenera
    la service role key

================================================================================
## PRIORITÀ 2 — FUNZIONALITÀ MANCANTI CRITICHE
================================================================================

### 2.1 — Pagina /discover: modal aggiungi senza popup
PROBLEMA: Il modal "Aggiungi ai progressi" per anime/manga (quelli con episodi)
  usa un modal che va bene, ma per i film non chiede niente e aggiunge
  direttamente con current_episode: 1 e progress: 1 che non ha senso per un film.
COSA FARE in src/app/discover/page.tsx, funzione addDirectly():
  - Per type === 'movie': inserisci status: 'completed' invece di 'watching'
    e current_episode: 1 (un film non ha episodi)
  - Aggiungi un campo "Voto" al modal di aggiunta (1-5 stelle)
    così l'utente può votare subito mentre aggiunge

### 2.2 — Pagina /discover: ricerca manga non funziona bene
PROBLEMA: Quando cerchi manga, AniList restituisce risultati misti
  e alcuni non hanno copertina.
COSA FARE:
  - Quando activeType === 'manga', passa type: MANGA esplicitamente
    (già fatto parzialmente ma controlla che aniListType sia sempre MANGA
    quando il filtro è 'manga')
  - Aggiungi anche la ricerca su AniList per type: NOVEL per i light novel

### 2.3 — Nessuna pagina di errore personalizzata
COSA FARE — crea questi file:
  src/app/not-found.tsx  → pagina 404 stilizzata con il tema Geekore
  src/app/error.tsx      → pagina errore globale con pulsante "Riprova"
  Esempio not-found.tsx:
    export default function NotFound() {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
          <h1 className="text-9xl font-black text-violet-500">404</h1>
          <p className="text-2xl mt-4">Questa pagina non esiste</p>
          <a href="/" className="mt-8 px-8 py-3 bg-violet-600 rounded-full">Torna alla home</a>
        </div>
      )
    }

### 2.4 — Nessuna home page reale
PROBLEMA: src/app/page.tsx non esiste (o non è nel repo).
  Andando su / non c'è niente di utile.
COSA FARE — crea src/app/page.tsx:
  - Se utente loggato → redirect a /feed
  - Se non loggato → landing page con:
    * Logo Geekore grande
    * Descrizione "Traccia anime, manga, giochi, serie TV in un unico posto"
    * Pulsante "Entra" → /login
    * Pulsante "Registrati gratis" → /register
    * Screenshot/mockup dell'app

### 2.5 — Il feed non ha paginazione
PROBLEMA: feed/page.tsx carica TUTTI i post senza limite.
  Con 1000 post l'app diventa lentissima.
COSA FARE:
  - Aggiungi .range(0, 19) alla query (carica 20 post)
  - Aggiungi un pulsante "Carica altri" o infinite scroll:
    const [page, setPage] = useState(0)
    // al click: carica .range(page*20, page*20+19) e appendi ai post esistenti

### 2.6 — Nessun sistema di follow funzionante
PROBLEMA: La tabella follows esiste ma non c'è nessuna UI per seguire altri utenti.
  FollowButton.tsx esiste ma non è usato da nessuna parte.
COSA FARE:
  - Nella vista pubblica di /profile/[username]/page.tsx, mostra FollowButton
    sotto il nome utente (già importato nel file, basta usarlo)
  - Nel feed, mostra solo i post degli utenti che segui (con un toggle
    "Tutti" / "Following")
  - Aggiungi contatori followers/following nel profilo

### 2.7 — Notifiche non funzionano in real-time
PROBLEMA: Le notifiche vengono controllate ogni 60 secondi con polling.
  Con Supabase hai i Realtime gratuiti.
COSA FARE in src/components/feed/nav.tsx:
  Sostituisci il setInterval con una subscription Supabase:
    useEffect(() => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        const channel = supabase
          .channel('notifications')
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `receiver_id=eq.${user.id}`
          }, () => setHasNewNotifications(true))
          .subscribe()
        return () => supabase.removeChannel(channel)
      })
    }, [])

### 2.8 — Nessuna pagina per boardgames
PROBLEMA: Hai l'API /api/boardgames che funziona ma non c'è nessuna pagina
  dove l'utente può cercare e aggiungere boardgame alla propria collezione.
COSA FARE:
  - Aggiungi 'boardgame' come tipo in /discover/page.tsx
  - Aggiungi un filtro "Board Game" nei typeFilters
  - La ricerca BGG va fatta via API BGG XML (già hai la route boardgames)
  - Nel profilo, mostra i boardgame con "N partite giocate" invece di episodi

### 2.9 — /explore/page.tsx è server component ma usa componenti client in modo misto
PROBLEMA: explore/page.tsx è server component e usa Header e Nav che sono
  client components duplicati di Navbar.tsx
COSA FARE:
  - Semplifica explore/page.tsx rimuovendo Header e Nav (la Navbar globale
    in layout.tsx già ci pensa)
  - Trasforma explore/page.tsx in client component o rimuovila del tutto
    visto che la funzionalità di ricerca è già in /discover

================================================================================
## PRIORITÀ 3 — UX E INTERFACCIA
================================================================================

### 3.1 — Loading states mancanti ovunque
PROBLEMA: Molte pagine mostrano solo "Caricamento..." in testo semplice.
COSA FARE — crea src/components/ui/Spinner.tsx:
  export function Spinner() {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  Poi usa <Spinner /> in tutte le pagine al posto del testo

### 3.2 — Nessun feedback visivo dopo le azioni
PROBLEMA: Quando aggiungi un media, elimini qualcosa, salvi le note —
  non c'è nessun toast di conferma.
COSA FARE — crea src/components/ui/Toast.tsx:
  Un componente semplice che appare in basso a destra per 3 secondi.
  Usalo in profile/[username]/page.tsx dopo ogni azione (delete, save, etc):
    showToast('Eliminato con successo')
    showToast('Progresso salvato')
    showToast('Note aggiornate')

### 3.3 — Il profilo non mostra statistiche
PROBLEMA: Il profilo mostra solo le card dei media ma nessun riassunto.
COSA FARE — aggiungi sopra le card in profile/[username]/page.tsx:
  Una sezione con:
  - Totale anime seguiti
  - Totale giochi nella libreria
  - Ore totali su Steam
  - Media voto dato (stelle)
  - N. elementi completati vs in corso
  Esempio calcolo:
    const totalGames = mediaList.filter(m => m.type === 'game').length
    const totalHours = mediaList.filter(m => m.type === 'game')
      .reduce((sum, m) => sum + (m.current_episode || 0), 0)
    const completed = mediaList.filter(m => /* logica completato */).length

### 3.4 — Le card del profilo non mostrano il tipo di media
PROBLEMA: Guardando la collezione di qualcuno non si capisce subito
  se una card è un anime, una serie TV o un manga.
COSA FARE in MediaCard (profile/[username]/page.tsx):
  Aggiungi un badge colorato in alto a destra della copertina:
    const typeColors = {
      anime: 'bg-sky-500', manga: 'bg-orange-500',
      game: 'bg-green-500', tv: 'bg-purple-500', movie: 'bg-red-500'
    }
    const typeLabels = {
      anime: 'Anime', manga: 'Manga', game: 'Game', tv: 'Serie', movie: 'Film'
    }
  <div className={`absolute top-3 right-3 z-20 px-2 py-1 rounded-full text-xs font-bold ${typeColors[media.type]}`}>
    {typeLabels[media.type]}
  </div>

### 3.5 — Immagini non ottimizzate
PROBLEMA: Usi <img> ovunque invece di <Image> di Next.js.
  Questo significa: nessuna ottimizzazione, nessun lazy loading automatico,
  nessun formato WebP, immagini pesanti.
COSA FARE:
  - Aggiungi tutti i domini in next.config.js (già fatto parzialmente)
  - Sostituisci <img> con <Image> da 'next/image' nelle card principali
    (almeno nelle card del profilo e discover)
  - Per le immagini esterne dinamiche (cover Steam, AniList) usa:
    <Image src={url} alt="" fill className="object-cover" unoptimized />
    (unoptimized solo se l'URL cambia spesso)

### 3.6 — Il form di aggiunta in /discover non resetta bene
PROBLEMA: Se apri il modal per una serie TV, lo chiudi senza aggiungere,
  e poi apri il modal per un'altra serie — i valori precedenti rimangono.
COSA FARE in discover/page.tsx, funzione handleAdd():
  Aggiungi sempre il reset completo quando si apre il modal:
    setSelectedSeason(1)
    setCurrentEpisode('')
    setSelectedMedia(media)  // DEVE essere l'ultimo

### 3.7 — Nessuna conferma prima di eliminare elementi dal profilo
PROBLEMA: Il pulsante X elimina il media immediatamente con un window.confirm()
  che è un alert del browser — brutto e bloccante.
COSA FARE:
  - Sostituisci window.confirm() con un inline confirm dentro la card:
    Quando si clicca X, mostra due pulsanti "Annulla" e "Elimina" direttamente
    nella card, senza modal né alert del browser

### 3.8 — Avatar mancante nel feed
PROBLEMA: Nel feed quando un utente non ha avatar viene mostrato un emoji 👤
  dentro un div — non è coerente col design.
COSA FARE in feed/page.tsx:
  Sostituisci il fallback con le iniziali del nome utente:
    <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-xl">
      {post.profiles.display_name?.[0]?.toUpperCase() || post.profiles.username?.[0]?.toUpperCase() || '?'}
    </div>

================================================================================
## PRIORITÀ 4 — PERFORMANCE
================================================================================

### 4.1 — Troppe query Supabase nella pagina feed
PROBLEMA: feed/page.tsx fa N*4 query (una per ogni post: likes, comments,
  commenti con profili, like dell'utente). Con 20 post = 80+ query.
  È lentissimo e spreca quota Supabase.
COSA FARE — una query sola con join:
  const { data } = await supabase
    .from('posts')
    .select(`
      id, content, image_url, created_at,
      profiles!posts_user_id_fkey (username, display_name, avatar_url),
      likes (id, user_id),
      comments (id, content, created_at, user_id,
        profiles!comments_user_id_fkey (username, display_name))
    `)
    .order('created_at', { ascending: false })
    .limit(20)
  Poi calcola likes_count, liked_by_user, ecc. in JavaScript lato client
  invece di fare query separate.
  Questo riduce le query da 80+ a 1 sola.

### 4.2 — Nessun caching delle cover Steam
PROBLEMA: /api/steam/games fa imageExists() per ogni gioco con una richiesta
  HEAD separata. Con 200 giochi = 200 richieste HTTP aggiuntive.
COSA FARE:
  - Rimuovi la funzione imageExists() e usa direttamente il fallback header.jpg
    che esiste sempre per tutti i giochi Steam
  - Oppure: salva le cover_image in Supabase quando importi e non le
    ricalcolare ogni volta

### 4.3 — next.config.js manca domini importanti
COSA FARE — aggiungi questi a remotePatterns:
  { protocol: 'https', hostname: 'image.tmdb.org' },
  { protocol: 'https', hostname: 'via.placeholder.com' },
  { protocol: 'https', hostname: 'cdn.cloudflare.steamstatic.com' },
  { protocol: 'https', hostname: 'api.dicebear.com' },

### 4.4 — Nessun loading.tsx nelle route
NEXT.JS ha un sistema di streaming con loading.tsx che mostra uno skeleton
mentre la pagina carica — completamente inutilizzato.
COSA FARE — crea questi file:
  src/app/profile/loading.tsx   → skeleton del profilo
  src/app/feed/loading.tsx      → skeleton del feed
  src/app/discover/loading.tsx  → skeleton delle card
  Esempio:
    export default function Loading() {
      return (
        <div className="min-h-screen bg-zinc-950 pt-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-5 gap-6">
              {Array.from({length: 10}).map((_, i) => (
                <div key={i} className="h-[520px] bg-zinc-900 rounded-3xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      )
    }

================================================================================
## PRIORITÀ 5 — DATABASE E SCHEMA
================================================================================

### 5.1 — La tabella user_media_entries manca di campi utili
COSA FARE — esegui su Supabase SQL Editor:
  ALTER TABLE user_media_entries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'watching';
  ALTER TABLE user_media_entries ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
  ALTER TABLE user_media_entries ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  ALTER TABLE user_media_entries ADD COLUMN IF NOT EXISTS external_id TEXT;
  -- external_id = ID da AniList/IGDB/TMDB, per evitare duplicati
  -- Attualmente usi title come chiave di deduplicazione (pericoloso)

### 5.2 — Nessun indice su user_media_entries.user_id
Senza indice ogni query "dammi tutti i media di questo utente" fa un full scan.
COSA FARE:
  CREATE INDEX IF NOT EXISTS idx_user_media_user_id
    ON user_media_entries(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_media_type
    ON user_media_entries(user_id, type);

### 5.3 — La tabella steam_accounts non ha indice
  CREATE INDEX IF NOT EXISTS idx_steam_accounts_user_id
    ON steam_accounts(user_id);

### 5.4 — Nessun trigger per created_at automatico su user_media_entries
  I nuovi record potrebbero non avere created_at settato.
  COSA FARE:
  ALTER TABLE user_media_entries
    ALTER COLUMN created_at SET DEFAULT now();

### 5.5 — Profili senza username bloccano tutto
PROBLEMA: Se un utente si registra ma non completa il profilo (nessun username),
  molte parti dell'app crashano perché assumono username non null.
COSA FARE:
  - In /profile/me/page.tsx: se username è null, redirect a /profile/setup
  - Crea src/app/profile/setup/page.tsx: un form che chiede solo username
    come primo step onboarding
  - Aggiungi in Supabase: CHECK (username ~ '^[a-z0-9_]{3,30}$') sulla colonna

### 5.6 — Nessun cleanup delle notifiche vecchie
  Le notifiche si accumulano nel database per sempre.
  COSA FARE su Supabase SQL Editor:
  -- Elimina automaticamente notifiche più vecchie di 30 giorni
  -- (da eseguire periodicamente via cron o Supabase Edge Function)
  DELETE FROM notifications WHERE created_at < now() - interval '30 days';
  -- Oppure aggiungi un trigger o usa pg_cron se disponibile nel tuo piano

================================================================================
## PRIORITÀ 6 — FUNZIONALITÀ NUOVE DA IMPLEMENTARE
================================================================================

### 6.1 — Onboarding per nuovi utenti
Quando un utente si registra non sa cosa fare.
COSA FARE — crea src/app/onboarding/page.tsx:
  Step 1: Scegli username
  Step 2: Carica avatar (opzionale)
  Step 3: Scegli interessi (anime / manga / giochi / film / serie)
  Step 4: "Cerca il tuo primo contenuto" → redirect a /discover
  Dopo registrazione: redirect a /onboarding invece che al profilo

### 6.2 — Ricerca utenti funzionante
  src/app/search/page.tsx è uno stub vuoto.
COSA FARE:
  - Trasformalo in client component
  - Aggiungi input di ricerca con debounce
  - Cerca in profiles per username o display_name con ILIKE
  - Mostra risultati come card con avatar, username, numero di media
  - La logica è già in src/components/explore/search-section.tsx —
    espandila e riusala qui

### 6.3 — Pagina dettaglio media
  Cliccando su una card non succede nulla.
COSA FARE — crea src/app/media/[id]/page.tsx:
  - Mostra copertina grande, titolo, anno, tipo
  - Mostra chi tra i tuoi following lo ha nella collezione e con che voto
  - Pulsante "Aggiungi ai tuoi progressi"
  - Numero totale di utenti Geekore che lo hanno in collezione

### 6.4 — Export dati utente
  Per rispettare GDPR (e buone pratiche).
COSA FARE — aggiungi in /profile/edit/page.tsx un pulsante:
  "Esporta i tuoi dati" → chiama un'API che restituisce un JSON con
  tutti i media dell'utente, i post, i commenti

### 6.5 — Modalità oscura / chiara
  L'app è solo dark mode. Aggiungi il toggle.
COSA FARE:
  - Usa next-themes: npm install next-themes
  - Wrappa layout.tsx con ThemeProvider
  - Aggiungi toggle nella navbar

### 6.6 — Meta tags Open Graph per condivisione
  Quando condividi il link del profilo su Discord/Twitter appare senza preview.
COSA FARE — in src/app/profile/[username]/page.tsx aggiungi:
  export async function generateMetadata({ params }) {
    const profile = // fetch profilo
    return {
      title: `${profile.display_name} — Geekore`,
      description: profile.bio || `La collezione di ${profile.username} su Geekore`,
      openGraph: {
        images: [profile.avatar_url || '/og-default.png']
      }
    }
  }
  Ma attenzione: generateMetadata funziona solo in Server Components,
  quindi devi splittare la pagina profilo in una parte server (metadata)
  e una parte client (interattività).

### 6.7 — PWA completa
  Hai il manifest.json ma mancano le icone reali.
COSA FARE:
  - Crea le icone: public/icons/icon-192.png e icon-512.png
    (attualmente sono referenziate nel manifest ma probabilmente non esistono)
  - Aggiungi nel layout.tsx:
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#7c6af7" />
  - Considera next-pwa per il service worker

### 6.8 — Wishlist funzionante
  src/app/wishlist/page.tsx usa dati mock hardcoded.
COSA FARE:
  - Crea tabella wishlist su Supabase:
    CREATE TABLE wishlist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      cover_image TEXT,
      external_id TEXT,
      release_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, external_id)
    );
  - Collega /discover: aggiungi pulsante "Aggiungi a Wishlist" oltre a
    "Aggiungi ai progressi"
  - In /wishlist/page.tsx: carica dalla tabella invece dei mock

================================================================================
## PRIORITÀ 7 — QUALITÀ DEL CODICE
================================================================================

### 7.1 — TypeScript strict mode viola ovunque
  Hai "strict": true in tsconfig ma ci sono decine di `any` nel codice.
COSA FARE (gradualmente):
  - In profile/[username]/page.tsx: tipizza correttamente UserMedia
  - In feed/page.tsx: già tipizzato bene, mantienilo così
  - In FeedCard.tsx: sostituisci `post: any` con un tipo Post definito
  - In discover/page.tsx: rimuovi i cast `as any` sulle risposte API

### 7.2 — Nessun .eslintrc configurato correttamente
COSA FARE — crea .eslintrc.json nella root:
  {
    "extends": ["next/core-web-vitals"],
    "rules": {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "warn"
    }
  }
  Poi esegui: npm run lint
  Vedrai decine di warning — correggili uno per uno

### 7.3 — Nessuna gestione degli errori nelle query Supabase
PROBLEMA: Ovunque fai `const { data } = await supabase.from(...)` senza
  controllare `error`. Se la query fallisce, data è null e l'app crasha silenziosamente.
COSA FARE — pattern corretto:
  const { data, error } = await supabase.from('profiles').select('*')
  if (error) {
    console.error('Errore query profilo:', error)
    return // o mostra un messaggio all'utente
  }
  if (!data) return

### 7.4 — Componenti troppo grandi
  profile/[username]/page.tsx è 600+ righe. È ingestibile.
COSA FARE — spezza in componenti separati:
  src/components/profile/ProfileHeader.tsx   → avatar, nome, bio, logout
  src/components/profile/SteamSection.tsx    → blocco Steam
  src/components/profile/MediaGrid.tsx       → griglia con DnD
  src/components/profile/NotesModal.tsx      → modal note
  src/components/profile/MediaCard.tsx       → card singola (già isolata)

### 7.5 — Console.log in produzione
  Hai decine di console.log e console.error sparsi nel codice.
  In produzione questi appesantiscono l'app e rivelano dettagli interni.
COSA FARE:
  - Crea src/lib/logger.ts:
    const isDev = process.env.NODE_ENV === 'development'
    export const logger = {
      log: (...args: any[]) => isDev && console.log(...args),
      error: (...args: any[]) => isDev && console.error(...args),
    }
  - Sostituisci console.log/error con logger.log/error

================================================================================
## ORDINE CONSIGLIATO DI ESECUZIONE
================================================================================

Settimana 1 (sicurezza):
  1.5 → rimuovi chiavi dal frontend e rigenerale
  1.4 → sistema i bucket Storage
  1.7 → verifica .gitignore e chiavi nel repo
  1.3 → validazione input API

Settimana 2 (funzionalità base mancanti):
  2.4 → home page reale
  2.3 → pagine 404 e error
  5.5 → onboarding username obbligatorio
  6.1 → onboarding completo
  1.6 → fix /profile/me redirect

Settimana 3 (UX):
  3.1 → Spinner component
  3.2 → Toast notifications
  3.3 → statistiche profilo
  3.4 → badge tipo media nelle card
  4.4 → loading.tsx nelle route

Settimana 4 (performance):
  4.1 → ottimizza query feed (la più impattante)
  4.2 → caching cover Steam
  4.3 → next.config.js domini
  5.2 → indici database

Settimana 5 (funzionalità avanzate):
  2.7 → notifiche real-time
  2.6 → follow system UI
  6.2 → ricerca utenti
  6.8 → wishlist reale

Settimana 6 (qualità):
  7.4 → refactor componenti grandi
  7.1 → TypeScript strict
  7.3 → gestione errori
  6.6 → Open Graph meta tags
  6.7 → PWA icone reali
