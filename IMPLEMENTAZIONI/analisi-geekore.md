# Geekore — Analisi UX & Visual Design a 360°
*Audit di un utente esigente. Nessuno sviluppatore in mente, solo l'esperienza di chi apre l'app per scoprire, tracciare e condividere ciò che ama.*

---

## 0. TL;DR — il verdetto in 30 secondi

Geekore ha **una buona ossatura tecnica** (system di token CSS, scale tipografica semantica `gk-*`, type pairing pulito con Plus Jakarta Sans, componenti ben separati, performance accortissime con virtualizzazione e cache) ma soffre di **un problema d'identità grave**: non si capisce a colpo d'occhio che è un'app "geek".

Sembra un clone neutro di Instagram in modalità dark/viola, e questo tradisce il prodotto: chi ama anime/manga/videogiochi si aspetta **densità informativa, copertine grandi, una tassonomia per medium chiarissima e un'estetica che vibra** — non un feed generalista.

I tre problemi più gravi, per impatto:

1. **Identità visiva debole** — viola+nero+gradient, zero personalità, wordmark "geekore." troppo timido, manca un sistema di copertura/poster gerarchico.
2. **Architettura informativa appiattita** — il bottom-tab (Home / Discover / For You / Swipe / Profile) sovrappone funzioni simili senza una gerarchia chiara per medium, costringe l'utente a "indovinare" dove cercare un manga vs un boardgame.
3. **Scarsa differenziazione per medium** — il colore `--type-anime/manga/game/board/movie/tv` esiste nei token ma viene usato in modo inconsistente (a volte nei badge, mai come tema di sezione). Risultato: tutti i contenuti sembrano uguali.

Sotto, l'analisi dettagliata divisa per sistema. Ho indicato per ogni punto **gravità** (🔴 critico / 🟠 importante / 🟡 polish) e **priorità di intervento**.

---

## 1. Identità visiva & branding

### 1.1 🔴 Il wordmark non dice "geek"

```css
.font-display { font-family: var(--font-display), 'Inter', sans-serif; }
```

Plus Jakarta Sans è un sans-serif corporate-friendly bellissimo, ma **completamente neutro**. Su un'app che parla a chi ama Hunter×Hunter, Baldur's Gate 3 e Gloomhaven non passa nulla del mood "fandom".

Nel `MobileHeader.tsx` il wordmark è:
```jsx
<span className="text-[24px] font-bold text-white tracking-tight">geekore</span>
<span className="w-[7px] h-[7px] rounded-full bg-violet-500" />
```

È esattamente il pattern "minimal startup nordica". Confronta con Letterboxd (lettere ritagliate, dot pattern), MyAnimeList (azzurro saturo + serif), IGDB (monospace). **Nessun di questi competitor è neutro.**

**Cosa percepisco da utente:** "è un'altra app social, non capisco perché dovrei sceglierla invece di Instagram."

**Direzione:**
- Wordmark con un dettaglio vibrante: un glifo geometrico (pixel/modulo/dado/diamante) al posto del puntino, oppure una `o` stilizzata (occhio, target, console d-pad).
- Type pairing: tenere Jakarta per UI, ma **introdurre un display font con carattere** per H1 di pagina, titoli di sezione e numeri grandi (Space Grotesk, General Sans, Migra, Cabinet Grotesk, anche un mono come JetBrains per i count).
- Una mascotte/marchio secondario (anche solo un set di 6 glifi colorati per i 6 medium).

### 1.2 🟠 Palette: viola standard, zero memoria

`--brand: #8b5cf6` è il viola Tailwind 500. Il gradient `from-violet-500 to-fuchsia-500` è il default ChatGPT/Claude/Notion AI/Linear AI. **È un colore senza signature**.

Inoltre i colori per medium sono **desaturati al 35%** (`--type-anime: #5fa8c8` vs originale `#38bdf8`):

```css
/* Media type — desaturati 35% per non competere col brand */
--type-anime:  #5fa8c8;   /* era #38bdf8 */
--type-manga:  #c47a6e;   /* era #f97066 */
--type-game:   #5a9e6e;   /* era #4ade80 */
--type-board:  #c49542;   /* era #fb923c */
```

Questa è una scelta di progettazione comprensibile (evitare conflitto con il brand) **ma sbagliata in chiave UX**: in un'app dove il *contenuto* è il protagonista, il colore del medium DEVE essere più vibrante del brand, non meno. Il brand è il vestito, non il prodotto.

**Direzione:**
- Riportare i colori medium al 100% di saturazione e **rimuovere il gradient brand viola/fuchsia** dai contesti dove dialoga con i contenuti (badge, feed item, bottoni per medium). Tenere il viola pieno solo per CTA primarie e brand surface (logo, focus ring, link).
- Definire una palette signature: 1 viola pieno + 1 colore caldo unconventional (corallo? mandarino acido? lime tossico?) come accent secondario. Evitare il classico "viola+rosa".
- Considera **light mode** (vedi 1.3).

### 1.3 🟠 Solo dark mode, e il dark è uniformemente nero

```jsx
export type Theme = 'dark'
export function useTheme() { return useContext(ThemeContext) }  // sempre dark
```

```css
html, body { background-color: #000000 !important; }
```

Tre osservazioni:

a. **Il nero #000 puro è una scelta forte**, ma diventa monotono se non c'è un sistema di elevazione visivo: le superfici `--bg-card: #111111`, `--bg-card-hover: #1c1c1c` sono troppo vicine. L'occhio fatica a distinguere card sovrapposte. Letterboxd, AniList e Steam usano blu-notte o grigi caldi proprio per questo — il nero neutrale è ostile all'imagery colorata.

b. **Manca la light mode**. Per un'app che vuole "scalare" e diventare daily-driver, escludere il 40% di utenti che preferiscono light è una decisione di prodotto da rivedere o almeno motivare. Anche un solo theme "dim" (grigio antracite caldo) aiuterebbe.

c. **Il `!important` su `body { background: #000 }` è un debito tecnico**: rende impossibile riusare lo shell per pagine pubbliche/landing con altro tono.

### 1.4 🔴 Il dot accent dopo "geekore." è la cosa più memorabile e quasi non si vede

Nel desktop navbar:
```jsx
<span>geekore<span className="text-violet-400">.</span></span>
```

L'unico vero elemento di carattere del brand è quel puntino, e `text-violet-400` su sfondo nero a 15px è praticamente invisibile. Va alzato di un livello: dimensione, tono, magari forma alternativa.

---

## 2. Tipografia & gerarchia

### 2.1 🟠 La scala semantica esiste ma non è sfruttata

`globals.css` definisce una scala bellissima:
```css
.gk-display  { 32–56px, weight 900, letter-spacing -0.03em }
.gk-title    { 22px,    weight 800 }
.gk-headline { 17px,    weight 700 }
.gk-body     { 14px,    line-height 1.7 }
.gk-caption  { 11px }
.gk-label    { 11px UPPERCASE 0.08em }
```

Ma nel codice delle pagine domina il **Tailwind raw**: `text-[15px] font-semibold tracking-tight`, `text-[17px] font-bold`, `text-[10px]` ovunque. Ho contato in `Navbar.tsx + MobileHeader.tsx + home/page.tsx` almeno **7 dimensioni font diverse senza pattern**: 9, 10, 11, 12, 13, 14, 15, 17, 22, 24px. Il prodotto sembra "scritto da molte mani".

**Conseguenza UX:** il feed non ha ritmo tipografico. Username, body, timestamp, contatori like, badge categoria, copy commenti — tutto tende a 11–13px, l'occhio non sa dove cadere.

**Direzione:**
- Adottare le classi `.gk-*` in modo **dogmatico**: ogni testo deve appartenere a una di esse.
- Aumentare il contrasto fra livelli: hero della home a `gk-display`, titoli delle sezioni "Continua a guardare / Per Te / Trending" a `gk-title` (22px+800), card a `gk-headline`, meta a `gk-caption`.
- Il body a 14px è leggibile ma **piccolo per un feed**: alza a 15px, e definisci un solo `gk-body-lg` per i post.

### 2.2 🟡 Italiano misto a inglese

"Swipe", "For You", "trending", "wishlist", "leaderboard"... contro "Notifiche", "Profilo", "Modifica Profilo", "Esci da Geekore". Sceglierne uno o un mix coerente; oggi sembra casuale. Per un brand italiano, lascerei i termini di marketing in inglese (`Swipe`, `For You`) ma localizzerei tutto il resto.

### 2.3 🟡 Caratteri 9-10px sono sotto-soglia

```jsx
className="text-[10px] leading-none font-medium tracking-tight"  // bottom-nav label
className="text-[9px]"  // alcune meta
```

10px per le label del bottom nav su mobile è sul limite di leggibilità (Apple HIG raccomanda 11pt minimo, Google 12sp). Con safe-area insets sui notch crowdded, leggi male. Saliamo a 11–12px, riducendo il padding verticale.

---

## 3. Navigazione & architettura informativa

### 3.1 🔴 Bottom-nav: 5 tab che si sovrappongono concettualmente

**Mobile:** Home / Discover / For You / Swipe / Profile.
**Desktop:** Home / Discover / For You / Swipe (profilo nel dropdown a destra).

Da utente nuovo:
- **Discover** = ricerca testuale.
- **For You** = consigli personalizzati raggruppati in righe.
- **Swipe** = consigli personalizzati uno alla volta, formato Tinder.
- **Home** = feed sociale.

**Il problema:** Discover, For You e Swipe sono *tutte e tre forme diverse di scoperta*. Tre tab su cinque sono dedicate alla scoperta; **il tracking della propria collezione (la value-prop "il tuo universo geek in un unico posto") è sepolto nel profilo**.

Conseguenza: chi entra non capisce dove stanno **i suoi contenuti**. Nessuna tab "Library / La mia libreria / Collection".

**Direzione:**
- Rimappare a 5 tab: **Home (feed) · Library (la tua collezione, oggi è dentro Profile) · Discover (ricerca + browse) · For You (raccomandazioni personali, fonde l'attuale For You + Swipe come modalità) · Profile**.
- Trasformare "Swipe" da tab a **modalità all'interno di For You** (toggle in alto: Lista / Swipe). Liberare uno slot.
- Considerare un **"+" centrale** stile Instagram/TikTok per "aggiungi qualcosa che hai consumato" — è l'azione più importante in un tracker e oggi è nascosta nel composer della home.

### 3.2 🟠 Header mobile context-aware: ottimo concept, esecuzione disordinata

`MobileHeader.tsx` cambia in base alla pagina (wordmark sul feed, titolo+icona su Discover/For You, nome utente sul profilo). **L'idea è giusta**, ma:

- 14 configurazioni diverse di icona+gradient per le pagine (`from-sky-500 to-blue-600`, `from-violet-500 to-fuchsia-500`, `from-orange-500 to-red-500`, `from-emerald-500 to-teal-600`...). È un campionario di colori senza sistema. Sembra un'app onboarding di iOS 7.
- Le icone+gradient sembrano rubricate da un design Notion/Linear ma cambiano significato per pagina invece che per medium. **Giusto sarebbe**: il colore associato a una pagina dovrebbe corrispondere a *cosa contiene quella pagina*, non essere arbitrario.
- L'header ha 52px di altezza + safe-area: troppo pesante. Su feed scorrevole sarebbe meglio un header compatto che si nasconde allo scroll (oggi non lo fa, c'è solo `:root[data-to-swipe] .swipe-header { visibility: hidden }` per la pagina swipe).

**Direzione:**
- Ridurre i gradient a **un solo grigio scuro** per pagine "system" (Settings, Notifiche), e ai **6 colori per medium** quando la pagina è specifica (es. per una sezione "Anime" il gradient anime). Le pagine miste (Discover, For You) non dovrebbero avere icona colorata in alto.
- Auto-hide in scroll: l'header occupa real estate prezioso su un feed di poster.

### 3.3 🟠 Active indicator inconsistente

- Desktop navbar: `<span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full bg-violet-500" />` (barra inferiore).
- Mobile navbar: `<span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full bg-violet-500" style={{width: 28, height: 2}} />` (barra superiore).
- Profile tab dentro pagina profilo: `border-bottom: 2px solid var(--brand)` con cambio colore label a `--violet-light`.
- Filtri pillola: pillola piena viola.

Quattro convenzioni diverse per lo stesso concetto "selezionato". Per chi naviga tutto il giorno, questa incoerenza si percepisce come "app fatta a pezzi".

### 3.4 🟡 Profile tab nel dropdown desktop, ma nel bottom-nav su mobile

Coerente in sé, ma sul desktop l'utente fa **2 click per arrivare al profilo** (avatar → "Il tuo profilo"). Aggiungerei l'avatar come tab cliccabile diretta a destra, con il dropdown su long-click/secondary action.

---

## 4. Feed / Home

### 4.1 🔴 È un Instagram un po' triste

Layout post in `home/page.tsx`:
- Avatar 40px + username + timestamp
- Body text
- Badge categoria (CategoryBadge)
- Immagine
- Bar: like (Flame), comment, share

**Manca tutto ciò che renderebbe il feed "geek":**
- Nessuna copertina del media nel post (solo immagine custom dell'utente). Se un utente posta "Ho appena finito Frieren" la card non mostra la copertina di Frieren.
- Nessun rating embedded (5/5 stelle, 8.7/10).
- Nessun "status update" tipo "📺 Episodio 14/24", "🎮 12 ore di gioco", "🏆 Boss sconfitto".
- Nessun link/preview al titolo cliccabile per aprire la scheda.

**Risultato:** il feed è blando. Senza imagery di copertine il fil rouge "anime/manga/games" sparisce, resta solo testo e foto utente — Instagram di second'ordine.

**Direzione:**
- Tipizzare i post: **Activity post** (auto-generato: "ho aggiunto X", "ho finito Y con voto Z") **vs Discussion post** (testo libero come oggi). Quelli activity rendono nativamente la copertina + meta del media.
- Ogni post con `category` deve poter linkare al titolo (oggi mostra la subcategoria come badge cliccabile per filtro, ma non apre la scheda media).
- Pre-built templates nel composer: "Sto guardando", "Ho finito", "Recensione", "Top 5", "Domanda", "Confronto".

### 4.2 🟠 La fiamma 🔥 al posto del cuore: scelta brave ma lasciata da sola

```jsx
<Flame size={19} className={`... ${post.liked_by_user ? 'fill-orange-500' : ''}`} />
```

Sostituire ❤️ con 🔥 è un gesto identitario interessante (il "fire" della Gen Z) **ma è l'unico**. Tutto il resto è 100% Instagram. Se vai per quella strada, vai fino in fondo: contatori "engagement" diversi per medium ("🍿 visioni", "🎯 partite", "📖 letti"), reazioni multiple (love/wtf/nostalgic/gamechanger), ranking del post.

### 4.3 🟠 Composer: troppo nascosto + UX dei filtri categoria pesante

Il `CategorySelector` è un dropup con due step (macro → search), gestito via `createPortal`, con doppio rendering specchiato a seconda che apra sopra o sotto. **Ottima implementazione ingegneristica, UX fragile**:

- Utente apre, sceglie "Anime", parte una search API, vede risultati, può scegliere "usa libero" o "usa solo macro": **3 livelli di scelta solo per taggare un post**. Su un'azione che dovrebbe essere veloce, è troppa frizione.
- "Suggerimenti rapidi" (chip "Shonen, Shojo, Seinen…") appaiono solo per categorie senza API support. Asimmetria.

**Direzione:**
- Step unico: dropdown con i 6 medium come radio big-button + un campo search inline che filtra titoli (l'API call parte appena si scrive, i medium si auto-detectano dal risultato).
- Considerare di **unire categoria e link al media**: se taggi "Anime: Frieren", il post link al titolo, niente passi extra.

### 4.4 🟠 Filtro feed per categoria: nascosto

`CategoryFilter` ha bisogno che l'utente clicchi una pillola, scelga macro, eventualmente cerchi sotto-categoria. **Per filtrare per "Solo Anime" servono 2 click + selezione**. La cosa più ovvia — una riga di chip Anime/Manga/Film/TV/Game/Board sopra il feed — non c'è.

### 4.5 🟡 Stories Bar disinstallata? (riferito nel docs)

Il file `GEEKORE-ANALISI-COMPLETA.md` cita `StoriesBar.tsx` ma non l'ho trovato in `src/components/feed`. Se le stories sono state rimosse, va bene; se erano in roadmap, **per un'app geek le "story momentanee" sono meno utili che status episode-by-episode**: skippale.

### 4.6 🟡 Pinned post: meccanica non spiegata

```jsx
const PINNED_LIKE_THRESHOLD = 3
// "post in evidenza" = i 2 con più like negli ultimi 7 giorni
```

L'utente non ha modo di sapere come quelle card sono finite "in evidenza", né di rimuoverle dal feed. Aggiungere tooltip o switch nel dropdown filtri.

---

## 5. Discover (ricerca)

### 5.1 🟠 Ricerca = pagina di benvenuto vuota fino a 2 caratteri

```jsx
{!loading && !searchTerm.trim() && (
  <EmptyState icon={Search} title="Cerca qualcosa"
    description="Anime, manga, film, serie TV, videogiochi, giochi da tavolo e libri." />
)}
```

L'utente apre Discover e vede **una scritta "Cerca qualcosa"**. Niente di più. **È uno spreco di pagina madornale.** Una pagina Discover di un tracker dovrebbe sempre mostrare:
- "Trending oggi" (top 10 per medium nelle ultime 24h)
- "In uscita questa settimana" (calendario release)
- "Top stagionale" (anime stagionali, film al cinema, GoTY candidates)
- "Più aggiunti dalla community" (azione sociale)
- "Esplora per genere" (chips: shonen, soulslike, RPG, eurogame…)

Senza questi, "Discover" è solo "Search". Rinomina o riempi.

### 5.2 🟠 Filtri tipo: 7 chip in scroll orizzontale

```jsx
const FILTERS = [
  { id: 'all',       label: 'Tutti' },
  { id: 'anime',     label: 'Anime' },
  { id: 'manga',     label: 'Manga' },
  { id: 'movie',     label: 'Film' },
  { id: 'tv',        label: 'Serie' },
  { id: 'game',      label: 'Videogiochi' },
  { id: 'boardgame', label: 'Giochi da Tavolo' },
];
```

Su mobile, 7 chip scrollano. La sesta e settima sono sempre tagliate. **Per un'app dove il "tipo di media" è il primo asse di filtraggio, questo è critico**. Proposte:
- Bottom-sheet "Filtri" con i 6 medium come griglia 2×3 toggle multi-selezione.
- Oppure 3 colonne (Watch / Play / Read) come macro-categoria, tipo subcategory.

### 5.3 🟠 Card discovery: aspetto ratio e densità

```jsx
<div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
  <div className="aspect-[2/3] overflow-hidden bg-[var(--bg-card)] rounded-xl">
```

3 colonne su mobile è OK, ma:
- `text-[11px]` per il titolo è troppo piccolo (vedi 2.3).
- `text-[10px]` per anno: spreca line-height senza informazione utile (la maggior parte degli utenti vede "2024" e dice "ok").
- Mancano: punteggio aggregato, numero di utenti che lo hanno (social proof), stato "in collezione/wishlist" leggibile **prima** dell'hover (oggi solo l'hover svela il check verde).
- Su mobile l'hover non esiste: i bottoni "+" e "bookmark" sono **invisibili a meno che non tocchi la card**, che però apre il drawer. Risultato: per mettere in wishlist devi aprire il drawer, scrollare, tappare il bookmark dentro.

**Direzione:**
- Stato collezione/wishlist sempre visibile (icona top-right semi-trasparente).
- Long-press → bottom-sheet "Aggiungi / Wishlist / Visto / Vedi dettagli".

### 5.4 🟡 Voice search: feature buona, posizione nascosta

Il microfono sta in fondo a destra, 32px, senza label. È una feature wow che merita più visibilità — almeno la prima volta, un toast "💡 Prova la ricerca vocale!".

---

## 6. For You

### 6.1 🟠 La pagina più ricca, rischia di essere la più caotica

Da `for-you/page.tsx` ci sono **almeno 9 tipi di "rail"**: top-match, continue, social, fresh, discovery, genre, because-title, quick-picks, hidden-gems + ContinuitySection separata + DNA Widget + PreferencesModal + feedback granulare.

L'intento è ottimo — la profondità è il punto forte di un'app per fan. Ma:
- Header con icona "ArrowRight" su gradient ambra, sotto "Continua a guardare" in 16px bold. Card a 176×256 con badge "Sequel"... è **buono**, è tra le poche schermate ben progettate.
- **Però**: scrollare 9 sezioni orizzontali una sotto l'altra è esauriente. Manca un "indice" / "panini scroll" / ancore in alto per saltare a "Quick picks", "Hidden gems"…
- Ogni rail ha dimensioni card diverse (`w-44`, `w-40`, `w-52`...). Sembrano negoziate in chat con il PM. Servono **2 card-size canoniche**: poster-large (180×270) per hero/top match, poster-small (120×180) per rail rapidi.

### 6.2 🟠 Badge sopra le card: troppi, troppo simili

Su una sola card può apparire: badge tipo (gradient colorato), badge serendipity, badge award winner, badge seasonal, social-boost label, friend-watching, MatchBadge percentuale, episodi count. **8 layer di metadata su 180×270px**. La card scompare sotto le decorazioni.

**Direzione:**
- Massimo 2 badge per card. Uno per il "perché" (match% / sequel / discovery), uno per il "cosa" (tipo media solo se la rail mischia tipi).
- Tutto il resto va dentro il `MediaDetailsDrawer`.

### 6.3 🟡 DNA Widget: ottimo, sottoutilizzato

`DNAWidget` mostra il profilo gusti dell'utente — è la feature che dovrebbe stare in cima a For You **e** sul profilo. Oggi vive solo qui. Renderla riferibile e dare la possibilità di "esplora DNA" (clicca su un genere, vedi raccomandazioni di solo quel genere).

---

## 7. Swipe (Tinder per media)

### 7.1 🟠 Pagina interessante, ma orfana

`swipe/page.tsx` è ben costruito tecnicamente (queue per tipo, dedup, anti-ripetizione). UX-wise:
- L'esperienza Tinder è centrata sulla card singola: per un media tracker, **la card di swipe deve essere ricchissima** (cover full-bleed + titolo + tagline + metacritic + 1 bullet "perché tu lo ameresti"). Ho letto il codice — c'è il `description`, ma il "why" è l'asset chiave: deve essere una frase corta, frizzante, scrivibile dall'AI.
- Mancano gestures secondarie: solo destra/sinistra. Dovrebbero esserci almeno: swipe-up = wishlist, swipe-down = "non ora, ricordamelo". Le nightclub-style 4 directions sono ormai standard (Tinder ha super-like, Bumble ha boost, Hinge ha rose).
- Niente "preview audio/video": un trailer di 5s che parte muto in autoplay sulla card di swipe sarebbe disruptive — Letterboxd e Trakt non lo fanno, sarebbe una signature.

### 7.2 🟡 Coerenza con For You

Swipe e For You sono *la stessa coda di raccomandazioni in due format*. Vanno presentati come modalità della stessa funzione:

```
For You
[ Lista ▾ ] [ Swipe ]
```

Un toggle in alto, niente tab bottom dedicata.

---

## 8. Profile / Library

### 8.1 🔴 La libreria è la feature, ma non è "primaria"

Il valore promesso è "il tuo universo geek in un unico posto": **questa pagina è il prodotto**. Eppure:
- Sta dentro `/profile/[username]` come **sezione tra altre 3** (Collection, Activity, Comments). Tre tab equivalenti, tutte allo stesso peso visivo.
- "Collection" mostra le card del proprio media con `min-h-[340px]` su mobile, sortable via dnd-kit. L'esperienza è **Pinterest senza tema**: griglia di poster, badge tipo, rating.

Cose che mancano:
- **View toggle inadeguato**: solo `grid` e `compact`. In una library moderna servono almeno: Grid poster, Lista compatta (riga con cover small + meta + rating), Calendario (per release/visioni), Stats panel.
- **Filtraggio**: mostra solo per status (watching/completed/dropped/paused) e tipo. Mancano filtri per anno, rating, genere, "ultimi N aggiunti". Il dropdown sort esiste (date, rating, title, progress) ma è seppellito.
- **Bulk actions**: zero. Non posso selezionare 10 manga e marcarli "letti", o spostarli in una lista.

### 8.2 🟠 Drag-and-drop reorder: fluido ma poco scopribile

`SortableBox` è abilitato per default sull'owner. **Nessun affordance**: l'utente non sa che può trascinare finché non lo fa per caso. Almeno un'icona `GripVertical` su hover, o uno stato "Riordina" toggleable.

### 8.3 🟠 Card del profile: 340–420px di altezza minima

```jsx
className="rounded-3xl overflow-hidden min-h-[340px] sm:min-h-[380px] md:min-h-[420px]"
```

Card altissime in una grid 2-3 colonne mobile. Scrolling pesante per chi ha 200+ titoli. Chi ha una collezione grossa **vuole densità**, non altezza per "respirare". Necessita una vista lista o compact con immagini più piccole come default per chi ha >50 elementi.

### 8.4 🟠 Status pill: 4 stati scuri, leggibilità bassa

```jsx
completed: 'bg-emerald-500/20 text-emerald-400'
paused:    'bg-yellow-500/20 text-yellow-400'
dropped:   'bg-red-500/20 text-red-400'
watching:  'bg-zinc-700/40 text-zinc-400'
```

Su sfondo card già scuro, opacità 20% sul bg + 100% sul testo è ai limiti del contrasto WCAG AA. Ho dei dubbi che `text-emerald-400 (#34d399)` su `bg-emerald-500/20 (#10b98133)` su page bg `#000` passi 4.5:1.

**Direzione:** uso di pill solide (full saturation) per gli stati attivi, e contorni 1px-outlined per gli stati "non attivi" (paused, dropped). Il "completed" è il più importante: dovrebbe avere un colore ALTRO dal verde (per non confondere con "online"/"available") — magari il viola brand pieno.

### 8.5 🟡 Steam cover triple fallback: ottimo, manca il fallback finale

```jsx
const urls = [library_600x900, header.jpg, capsule_231x87]
```

Se tutti tre falliscono, mostra un placeholder grigio con icona Gamepad2. **Per coerenza**, lo stesso pattern dovrebbe valere per AniList/TMDB/IGDB/BGG/Google Books. Oggi lì la fallback è "nascondi immagine + mostra icona dietro": meno robusto.

### 8.6 🟡 Tab "Activity" e "Comments" sul profilo

- Activity: bene, è il diary stile Letterboxd. Ma **nessuna timeline visiva** (oggi è probabilmente lista cronologica). Un "heatmap" stile GitHub sarebbe la signature feature di un media-tracker (matrici 365 giorni × intensity).
- Comments: profile comments à la guestbook è una scelta MySpace-coded. Per un'app social moderna è **una zona di moderazione futura impegnativa**. Valutare se vale la pena.

---

## 9. Media Details Drawer

### 9.1 🟠 Drawer da destra, full-screen su mobile: ok, ma mai un trailer

Il drawer è ben fatto: cover, badge tipo, descrizione collassabile, link esterno alla source (BGG/AniList/IGDB/TMDB), forme di rating. **Manca:**
- **Trailer/teaser embed**: per anime/film/giochi è la prima cosa che l'utente vuole vedere. YouTube embed è banale, va aggiunto.
- **Galleria screenshot/episode list**: per giochi/serie, una scheda-info senza screenshot non vende.
- **Cast & crew**: presente solo per movie/tv. Per anime serve VA + studio (anilist li ha), per giochi serve director (igdb).
- **Provider/dove guardarlo**: il campo `watchProviders` esiste nei tipi ma non sono certo sia renderato nel drawer. È **una delle feature killer** di JustWatch/Reelgood — fondamentale.

### 9.2 🟠 Form "aggiungi al profilo": numeri rotti

```jsx
formEpisode, formSeason: stringhe da convertire
formEpisodeError, formSeasonError: validation
```

L'utente che aggiunge una serie deve digitare numero stagione + episodio in due input numerici. **Per show con 12 stagioni × 24 episodi è insulto**. Pattern moderno:
- Slider verticale per stagione, slider orizzontale per episodio.
- Bottoni rapidi: "+1 ep", "Stagione completa", "Marca tutto come visto".
- Smart default: se hai marcato 14/24 di S1, e clicchi "completa", la modal salta a "vuoi iniziare S2?"

### 9.3 🟡 Edge-swipe iOS dedicato: ottimo dettaglio

```jsx
const IOS_EDGE_SWIPE_ZONE = 30
const IOS_DISMISS_THRESHOLD = 80
```

Pochi sviluppatori si prendono cura di questo. Bene. Manca solo l'animazione di rubber-band quando l'utente trascina oltre la soglia (oggi suppongo sia un translateX lineare).

---

## 10. Stati visivi (loading, empty, error)

### 10.1 🟠 Skeleton: ok, ma uniformi e lente

`skeleton` con shimmer 1.4s. La velocità è OK. Il problema:
- Gli skeleton sono **identici per tutti i tipi di card**. Una skeleton di "post di feed" e di "card discovery" hanno la stessa silhouette generica → l'utente non capisce subito cosa sta caricando.
- Servono skeleton tipo-specifici: feed post (avatar+block), poster small (rectangle 2:3), poster large, list item.

### 10.2 🟠 Empty states: minimali, mancano CTA

`<EmptyState icon={Search} title="Cerca qualcosa" description="..." accent="zinc" />`

Tre elementi e basta. Per un'app sociale, ogni empty state è un'opportunità di onboarding:
- "Library vuota" → "Aggiungi il tuo primo titolo. Importa da AniList/Steam/MAL/Letterboxd/BGG con un click" + 5 grossi bottoni.
- "Wishlist vuota" → suggerimenti basati sui titoli simili, oppure import da MyAnimeList plan-to-watch.
- "Nessuna notifica" → "Segui qualcuno" + suggested users.

### 10.3 🟡 PullToRefresh indicator: presente, basico

OK, ma su una pagina dove la query rete dura 3-5s, l'utente ha bisogno di **feedback in più di un cerchio rotante** → "🔄 Aggiornamento... 12 nuovi post".

---

## 11. Onboarding & primo accesso

Non ho letto la pagina `/onboarding` ma dal flow `/profile/setup` deduco che:
1. Login → profile-setup (username, display name, avatar) → home.

**Manca un onboarding di sostanza**, che è esattamente quello che differenzia un'app geek dalla concorrenza:
- "Quali medium ti interessano?" (multi-select 6 medium con illustrazione, NON le solite icone Lucide)
- "Importa la tua libreria" (AniList, MAL, Letterboxd, Steam, BGG: già tutti supportati lato code, ma lo scopri solo se vai in Profile → Settings).
- "Scegli 5 titoli che ami" (cold-start dei consigli)
- "Segui questi utenti / friend-finder via Twitter/MAL"

Senza questi step, il "For You" iniziale è freddo come un hot-dog di stazione.

---

## 12. Mobile-specific

### 12.1 🔴 La user-select bloccata è aggressiva

```css
@media (max-width: 767px) {
  body { -webkit-user-select: none; user-select: none; }
  input, textarea, [contenteditable], p, h1, h2, h3, h4, h5, h6, span, a {
    -webkit-user-select: text; user-select: text;
  }
}
```

Il fallback whitelisting su `p, h1...h6, span, a` copre la maggioranza ma **ci sono container `div` che contengono testo non taggato**: l'utente non può selezionare/copiare descrizioni di media o commenti. Per un'app di review/discussione dove la gente cita testi, **questo va rimosso**.

### 12.2 🟠 Hit target ok, ma haptic ovunque

```jsx
if ('vibrate' in navigator) navigator.vibrate(8)
navigator.vibrate(30)
navigator.vibrate([30, 20, 30])
```

Vibrazioni ogni tap di nav, ogni filtro, ogni voice. Su Android **dopo 5 minuti dà fastidio**. Limitare a azioni significative (like, follow, completamento), non navigation.

### 12.3 🟡 Bottom nav 56px + safe-area: corretto, ma `box-shadow: 0 20px 0 20px #000` è un hack

```css
nav.mobile-nav {
  box-shadow: 0 20px 0 20px #000000;
  transform: translateZ(0);
}
```

Stai disegnando un quadrato nero attorno alla navbar per coprire la safe-area. Funziona, ma è fragile (rompe se cambi colore). Soluzione più pulita: `padding-bottom: env(safe-area-inset-bottom)` con il contenuto interno limitato a 56px e il padding che riempie lo spazio sotto.

### 12.4 🟡 `overflow-x: hidden` sul body per bloccare swipe orizzontale

```css
body { overflow-x: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior-x: none; }
```

OK su mobile, ma su desktop blocchi anche feature legittime tipo carousels horizontal. Verificare che `gk-carousel` non perda sulla larghezza.

---

## 13. Accessibilità

### 13.1 🟠 Colori medium desaturati + testo bianco su bg colorato 30%

Pill viste prima: `bg-violet-600/20 border-violet-500/40 text-violet-300`. Verificare contrasto testo viola-300 su violet-600/20 + bg-zinc-900: probabile fail WCAG AA per testo non-bold sotto i 18px.

### 13.2 🟠 Focus ring: presente ma generico

```css
:focus-visible {
  outline: 2px solid #8b5cf6;
  outline-offset: 2px;
  border-radius: 4px;
}
```

Buon default, ma sui bottoni con `border-radius: 9999px` (pill) il `border-radius: 4px` del focus stona. Settarlo a `inherit` o eliminare.

### 13.3 🟠 Aria labels parziali

Buon lavoro su molti `aria-label`, ma:
- Le card di Discover sono `<div>` cliccabili (non `<button>`/`<a>`).
- Le tab del bottom-nav sono `<button>` con `data-testid` ma label visibili che ripetono `aria-label` mancante.
- Skip link "vai al contenuto" assente.

### 13.4 🟡 prefers-reduced-motion: rispettato per view-transitions

Bene. Tuttavia gli animation-* shimmer/pulse-glow non sono coperti — vanno wrappati in media query.

---

## 14. Performance percepita (UX)

L'app fa **molto** lato perf: virtualizzazione (`VirtualPostCard` con IntersectionObserver), in-memory cache (2 min TTL), AbortController su search, content-visibility, will-change paused fuori-viewport, KeepAliveTabShell.

**Ma:**
- Nessun feedback ottico durante un'azione async lunga > 300ms tranne lo spinner generico. Il toggle wishlist, ad esempio, fa fetch e poi aggiorna stato — se la rete è lenta, **la card non risponde subito**. **Optimistic UI ovunque.**
- Cold start della pagina For You ha skeleton loaders ma le rail caricano una alla volta: l'utente vede "popping" sequenziale. Carica almeno la prima rail in SSR/streaming.

---

## 15. Quick wins (cose facili e con impatto alto)

In ordine di sforzo / impatto:

| # | Cosa | Sforzo | Impatto |
|--|--|--|--|
| 1 | Riempire la pagina Discover di sezioni "Trending / In uscita / Top stagionale" anche prima della query | M | 🔥🔥🔥 |
| 2 | Stato collezione/wishlist sempre visibile sulle card discovery (no hover-only) | S | 🔥🔥 |
| 3 | Sostituire "Profile" con "Library" nel bottom-nav, spostando l'identità in alto a destra | S | 🔥🔥🔥 |
| 4 | Activity post auto-generati sul feed con copertina del media | M | 🔥🔥🔥 |
| 5 | Wordmark con glifo signature (al posto del puntino viola) | S | 🔥🔥 |
| 6 | Limitare i badge sulle card a 2 max | S | 🔥🔥 |
| 7 | Trailer YouTube embed nel MediaDetailsDrawer | S | 🔥🔥 |
| 8 | Heatmap "anno di consumo" sul profilo (visualizzazione signature) | M | 🔥🔥 |
| 9 | Empty state Library con import buttons grossi | S | 🔥 |
| 10 | Onboarding "5 titoli che ami" + friend-finder | L | 🔥🔥 |

---

## 16. Direzioni di rebrand visivo (3 piste)

Se il rebrand fosse sul tavolo, queste tre piste sono coerenti col target:

### A. **"Arcade Modern"** — neon-soft retrofuturismo
- Background: nero molto profondo ma con tinta fredda (`#06070D`).
- Accent: ciano elettrico (`#5CE1FF`) + magenta (`#FF4D9D`) come duotone.
- Type: **General Sans** (display) + **JetBrains Mono** (numeri/badge meta).
- Texture: scanline / dot pattern molto sottile sui background di sezione.
- Mood: quello di Vampire Survivors, Nintendo Switch home, Plex.

### B. **"Otaku Editorial"** — magazine giapponese contemporaneo
- Background: bianco sporco + nero corvino, alternanza forte (sì, light mode prima).
- Accent: rosso vermiglio puro (`#E60022`) come unico accent (omaggio Shueisha/Kodansha) + viola scuro per stato.
- Type: **Migra** (display, contrast alto, hairline serif) + **Söhne** o **Inter** per UI.
- Layout: pesante asimmetria, kanji/katakana decorativi nei header di sezione.
- Mood: Letterboxd × Pitchfork × WIRED.

### C. **"Cabinet Maximalism"** — espressivo, illustrativo
- Background: gradient sottili tra antracite caldo (`#16131A`) e blu inchiostro (`#0F1126`).
- Accent: una sola tinta saturata (giallo acido `#F0D905` o lime tossico `#A6FF00`) usata come "highlighter" per selezioni/CTA.
- Type: **Cabinet Grotesk** (display) + **Switzer** (UI) + **JetBrains** (mono).
- Iconografia: custom 1.5px stroke, diversa da Lucide standard, con varianti filled per stati attivi.
- Mood: Cosmos.so, Are.na, Lex.

Tutte e tre sostituirebbero il viola+gradient con qualcosa di più riconoscibile.

---

## 17. Cosa ho ammirato

Per chiudere su un tono giusto:

- **Type scale semantica `gk-*`** definita: rara, segno di maturità.
- **Token `--bg-card-hover` allineato a `--bg-hover`** con commento di refactoring: cura.
- **PerformanceVirtualPostCard con misurazione altezza prima dell'unmount**: livello senior.
- **Voice search nativa** in `useVoiceSearch`: dettaglio premium.
- **PullToRefresh + AndroidBack stack + iOS edge-swipe** dedicati: i 3 dettagli che separano un'app fatta bene da una mediocre.
- **Cache profilo 5 min, cache feed 2 min**, abort di search, optimistic on like: hai pensato all'esperienza vera, non solo al codice.
- **Importazioni multiple (AniList, MAL, Letterboxd, Xbox, Steam, BGG)**: una delle tue armi competitive vere. **Esponila molto di più**.

Geekore ha **le ossa giuste**. Quello che manca è la pelle — un'identità visiva, una gerarchia di cosa l'app E', e UX che faccia sentire l'utente in un posto **fatto per i geek, non in un Instagram tinto di viola**.

---

*Fine analisi.*
