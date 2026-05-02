# Geekore visual rebrand roadmap

Questa roadmap traduce i documenti di audit e visione visuale in passaggi implementabili nel repository.

## Stato attuale osservato

Il rebrand non parte da zero. In `main` sono gia presenti alcuni interventi corretti:

- token colore nuovi in `src/app/globals.css`, incluso `--bg-primary: #0B0B0F`, `--accent: #E6FF3D` e colori medium saturi;
- bottom nav aggiornato a `Home / For You / Libreria / Discover / Profile`;
- `Swipe` rimosso dalla bottom nav e mantenuto come pagina/modalita separata;
- `MobileHeader` gia ripulito dai gradient casuali in favore di grigi di sistema e accent giallo;
- font body/display/mono gia caricati via `next/font`.

Restano pero incoerenze da sistemare in modo progressivo: shell ancora parzialmente legata al nero puro, classi Tailwind raw diffuse, pagina Discover ancora piu vicina a search che a discovery, feed ancora poco poster-first, e componenti/card non ancora canonici.

## Principi guida

1. **Poster-first**: ogni media deve privilegiare cover, titolo, stato, rating/progresso e medium.
2. **Un solo accent signature**: `#E6FF3D` per stati attivi, highlight, indicatori e micro-interazioni.
3. **Viola come brand/CTA, non come rumore ovunque**.
4. **Colori medium saturi**: anime, manga, game, board, movie, TV devono restare riconoscibili.
5. **Scala tipografica dogmatica**: preferire utility semantiche `gk-*` invece di `text-[npx]` sparsi.
6. **Navigation chiara**: Library e For You sono pilastri; Swipe e una modalita, non un tab principale.
7. **PR piccole**: ogni intervento deve essere revisionabile e reversibile.

## Roadmap proposta

### Fase 0 — Fondazione visiva sicura

Obiettivo: eliminare conflitti base prima di toccare le pagine.

- Allineare `themeColor`, meta `theme-color` e body shell a `#0B0B0F`.
- Evitare `bg-black` sul body quando esistono gia token globali.
- Consolidare alias CSS per superfici, testo, bordi, accent e medium.
- Non cambiare layout funzionale in questa fase.

### Fase 1 — Design system minimo

Obiettivo: rendere riusabili le scelte del rebrand.

- Creare o consolidare componenti piccoli e canonici:
  - `GeekoreWordmark`;
  - `MediaTypeBadge`;
  - `PosterCard`;
  - `RailSection`;
  - `SectionHeader`;
  - `EmptyState` coerente con il nuovo tono.
- Ridurre duplicazioni di colori inline (`#E6FF3D`, `#1C1C26`, `#2A2A36`) quando possibile.
- Spostare convenzioni visuali ripetute fuori dalle singole pagine.

### Fase 2 — Shell e navigazione

Obiettivo: rendere l'app immediatamente piu identitaria senza riscrivere le feature.

- Verificare coerenza tra `Navbar`, `MobileHeader`, `ActiveTabContext` e `KeepAliveTabShell`.
- Mantenere ordine tab: `Home / For You / Libreria / Discover / Profile`.
- Rendere active state coerente: accent giallo + indicatore unico.
- Valutare avatar/profile come azione account su desktop, lasciando Library in nav.

### Fase 3 — Discover diventa davvero Discover

Obiettivo: non aprire una pagina vuota che dice solo “Cerca qualcosa”.

- Aggiungere blocchi iniziali prima della ricerca:
  - trending/community picks;
  - rail per medium;
  - sezioni “continua”, “nuovi”, “popolari” quando i dati sono disponibili.
- Rendere i filtri medium piu leggibili su mobile.
- Stato wishlist/collection sempre visibile sulle card, non solo hover.

### Fase 4 — Feed poster-first

Obiettivo: smettere di sembrare un Instagram generico.

- Distinguere `ActivityPost` e `DiscussionPost`.
- Per activity post: cover, medium, stato, rating/progresso, titolo linkabile.
- Composer piu rapido: medium + media search in un unico flusso.
- Reazioni e badge coerenti con identita geek, senza duplicare troppe icone.

### Fase 5 — For You e Library

Obiettivo: trasformare le due pagine nel cuore del prodotto.

- Canonizzare due dimensioni card: poster large e poster compact.
- For You: meno rail ridondanti, piu gerarchia e sezioni saltabili.
- Library: vista compact densa come default, grid come alternativa.
- Introdurre progress/status component riusabili.

### Fase 6 — Pulizia e hardening UX

Obiettivo: rendere il sistema mantenibile.

- Cercare e ridurre `text-[9px]`, `text-[10px]`, `text-[13px]` arbitrari.
- Rimuovere gradient legacy non legati ai medium.
- Ridurre colori inline a token/classi.
- Controllare mobile safe area, contrasto, tap target e empty states.

## Interventi inclusi in questa PR

Questa PR avvia la Fase 0 e prepara la Fase 1:

- sostituisce il theme color PWA/meta da `#000000` a `#0B0B0F`;
- rimuove `bg-black text-white` dal `body` del root layout, lasciando `globals.css` governare background e colore via token;
- aggiunge `src/lib/mediaTypes.ts` come fonte canonica per label e colori medium;
- aggiunge `MediaTypeBadge`, `PosterCard`, `SectionHeader` e `RailSection` come componenti base del nuovo sistema poster-first.

Le nuove componenti sono intenzionalmente additive: non riscrivono ancora pagine complesse, ma permettono di migrare Discover, For You, Library e Feed a piccoli passaggi senza duplicare stile e logica visuale.
