# Geekore — Linee guida di design

> Documento di sintesi del sistema visivo e dell'architettura informativa di Geekore.
> Pensato come riferimento condiviso fra design, prodotto e sviluppo.
> Le viste mockup sono nella cartella `wireframes/exports/`.

---

## 1. Posizionamento e tono

**Cos'è Geekore.** Un social network per appassionati che traccia, ricorda e racconta tutto ciò che si guarda, legge e gioca: anime, manga, videogiochi, film, serie TV e boardgame in un unico profilo.

**Tono di voce.**
- Diretto, italiano, mai marketing.
- Linguaggio affettivo ma asciutto: "Traccia tutto ciò che ami", "Cosa stai guardando?", "Bentornato".
- Le label tecniche restano in inglese (Library, Discover, For-you) perché sono già parte del lessico geek; il copywriting di contorno è in italiano.
- Uppercase + monospace solo per metadati tecnici (timestamp, conteggi, ID).

**Personalità grafica.** Dark editoriale con un solo accento giallo-lime acido. Sei colori "type" identificano il tipo di media e non escono mai da quel ruolo. Niente gradienti decorativi, niente illustrazioni AI, niente emoji nel branding.

---

## 2. Token cromatici

| Token | Hex | Uso |
|---|---|---|
| `bg-primary` | `#0B0B0F` | Sfondo app |
| `bg-secondary` | `#14141B` | Superfici elevate (drawer, sheet) |
| `bg-card` | `#16161E` | Contenitori, card |
| `bg-elevated` | `#1C1C26` | Hover, dropdown |
| `border` | `#2A2A36` | Hairline 1px default |
| `border-soft` | `#1C1C26` | Separatori interni alle card |
| `text` | `#F4F4F5` | Testo primario |
| `text-secondary` | `#A1A1AA` | Body secondario |
| `text-tertiary` | `#52525B` | Metadati, mono |
| `accent` | `#E6FF3D` | UNICO accento attivo (CTA, focus, brand mark) |

**Type tokens (uno per tipo media, mai usati per stati):**

| Token | Hex | Tipo media |
|---|---|---|
| `t-anime` | `#38BDF8` | Anime |
| `t-manga` | `#F97066` | Manga |
| `t-game`  | `#4ADE80` | Videogiochi |
| `t-board` | `#FB923C` | Boardgame |
| `t-movie` | `#EF4444` | Film |
| `t-tv`    | `#C084FC` | Serie TV |

**Regole d'uso.**
- L'accent giallo-lime è l'unico colore attivo. Non si usa per i tipi di media, non per gli stati di errore (rosso `#EF4444` riservato), non per i decori.
- I 6 type colors compaiono solo come: pill di categoria, type-tag sulle cover, bordo card per categoria, accenti sui dot dei post.
- Nessun gradient per i bottoni. L'unico gradient ammesso è lo Story-ring degli avatar (lineare 135°, accent → 60% accent → accent).
- Nessuna shadow sui contenitori inline. Le shadow appaiono solo su menu, drawer e bottom sheet (`0 24px 80px rgba(0,0,0,0.5)`).

---

## 3. Tipografia

**Tre famiglie, tre ruoli.**

| Famiglia | Ruolo | Pesi |
|---|---|---|
| Cabinet Grotesk | Display, titoli, wordmark | 800, 900 |
| Switzer | Body, UI, label | 400, 600, 700, 800 |
| JetBrains Mono | Metadati, timestamp, conteggi | 400, 500, 700 |

**Scala (mobile / 1× / 16px base).**

| Token | Specifica | Uso |
|---|---|---|
| `gk-display` | Cabinet 56/1.0, -0.04em, 900 | Hero su landing |
| `gk-h1` | Cabinet 32/1.05, -0.03em, 800 | Titolo schermata, nome opera |
| `gk-h2` | Cabinet 24/1.1, -0.03em, 800 | Drawer header, hero profilo |
| `gk-title` | Cabinet 22/1.1, -0.02em, 800 | Nome card grande |
| `gk-headline` | Switzer 17/1.35, 700 | Nome utente, titolo card piccola |
| `gk-body` | Switzer 15/1.6, 400, `text-secondary` | Body, abstract |
| `gk-body-strong` | Switzer 14/1.5, 600 | Body con enfasi |
| `gk-caption` | Switzer 12/1.4, 400 | Caption, helper text |
| `gk-mono` | JetBrains 11/1.45, uppercase, 0.05em | Metadati |
| `gk-label` | Switzer 11/1.3, 700, uppercase, 0.1em | Label sezione |

**Regole.**
- Mai mescolare display (Cabinet) e body (Switzer) sulla stessa riga di lettura.
- Il monospace è solo per dati: timestamp, EP/vol, conteggi follower, hashtag tecnici. Non per UI generica.
- Su slide ≥1920w il display arriva a 88–96px; mai sotto 32px su titoli desktop.
- `text-wrap: pretty` su tutti i body lunghi.

---

## 4. Architettura informativa

### 4.1 Mappa schermate

**Pubblico (no auth)**
- `/` Landing — hero + community live + features
- `/login` Accesso
- `/register` Registrazione (specchio di /login)
- `/forgot-password` Reset

**Onboarding (post-registrazione, 4 step)**
- Step 1 — Scelta tipi media (almeno 1)
- Step 2 — Import sources (AniList, Steam, Letterboxd, BoardGameGeek) · skippabile
- Step 3 — Swipe per i gusti (~10 titoli)
- Step 4 — Conferma + invito ad aggiungere amici

**App autenticata (5 sezioni in bottom-nav)**
1. **Home** `/home` — feed sociale
2. **Per te** `/for-you` — raccomandazioni
3. **Library** `/library` — collezione personale
4. **Discover** `/discover` — esplora media
5. **Friends** `/friends` — rete sociale

**Schermate secondarie**
- `/swipe` — modalità a card per scoprire titoli
- `/profile/[username]` — profilo utente (proprio o altrui)
- `/notifications` (drawer + pagina) — attività ricevute
- `/settings/*` — preferenze, account, integrazioni
- Drawer: `MediaDetailsDrawer` (bottom sheet 90% h con cover full-bleed)

### 4.2 Bottom nav (mobile · 5 tab)

`Home` — `Per te` — `Library` — `Discover` — `Friends`

- Altezza 58px + safe-area inferiore
- Indicator superiore 2px × 28px in accent con glow
- Icona 21px outline / filled (filled solo sull'attivo)
- Label 10px, font-weight 800
- Stato attivo: colore accent, icona riempita

### 4.3 Sidebar desktop (240px)

Stessa gerarchia di sezioni, in colonna:
- Logo + wordmark
- Search persistente sotto i tab principali
- 5 tab principali (radius 16, attivo con bordo lime + barra laterale 3px)
- Sezione "Scopri" (Trending, Wishlist, Liste, Stats, Classifica)
- Footer: Notifiche + chip utente

---

## 5. Schermate · linee guida per vista

### 5.1 Landing `/`
*Vedi: `wireframes/exports/02-landing.png`*

- Hero centrato verticalmente, claim su due righe con la seconda in accent.
- Pill superiore "● Il tuo universo geek in un unico posto" come eyebrow.
- Due CTA: primaria su accent (`Registrati gratis`), secondaria su bg-card (`Accedi`).
- Sotto, **community live**: tre numeri in display (geek iscritti, media tracciati, categorie). I valori sono streamed via Suspense per non bloccare il TTFB.
- Sotto i numeri, riga di pill per le 5 categorie + "Steam, Progressi, Feed social".

### 5.2 Login `/login` & Register `/register`
*Vedi: `wireframes/exports/03-login-onboarding.png`*

- Wordmark ridotta in alto a sinistra, mai centrata.
- Toggle locale (IT/EN) come segmented control compatto in alto a destra.
- Card singola: padding interno 22, radius 24, bg-card.
- Input alti 48px, radius 14, font-size 16 per evitare zoom su iOS.
- CTA primaria a tutta larghezza, accent + testo `#0B0B0F`. Niente gradients.
- Errore inline sotto al form, mai toast.
- Le pagine /login, /register, /onboarding non mostrano la bottom nav.

### 5.3 Onboarding `/onboarding`
*Vedi: `wireframes/exports/03-login-onboarding.png`*

4 step lineari, barra di progresso fissa in alto + label "Passo N di 4".

- **Step 1 · Scegli i media** — griglia 2×3 di tile colorate, una per tipo media. Tile selezionata = bordo accent + bg accent 6%. Almeno 1 obbligatoria.
- **Step 2 · Import sources** — lista verticale con 4 servizi (AniList, Steam, Letterboxd, BoardGameGeek). Skippabile con "Salta" secondaria + "Continua →" primaria.
- **Step 3 · Swipe** — stack di card 3:4 con cover full-bleed, type-tag e match%. 4 azioni rotonde sotto: ✕ skip, ↻ undo, ♥ like, + add to library.
- **Step 4 · Conferma** — riassunto delle preferenze + invito a seguire 5–10 utenti suggeriti. CTA "Inizia" porta a `/home`.

> Lo stato persiste tra step: tornare indietro non distrugge i dati selezionati.

### 5.4 Feed `/home`
*Vedi: `wireframes/exports/04-feed-home.png`*

Core dell'app. Anatomia mobile dall'alto al basso:

1. **Header** 52px — wordmark a sinistra, notifiche (con badge dot rosso) + avatar a destra.
2. **Filtri primari** (4 chip stato): `Tutti` · `Seguiti` · `In tendenza` · `Discovery`.
3. **Filtri tipo media** (chip colorate): `Anime` · `Manga` · `Game` · `TV` ecc. Multi-select.
4. **Composer** sticky: avatar + input "Cosa stai guardando?" + send button accent.
5. **Stream di feed-card.** Una card è composta da:
   - Head: avatar (con story-ring se attività recente) · nome+username · timestamp mono · `⋯`
   - Body: type-pill colorata + frase libera
   - Eventuale immagine 16:9 con bordi sottili sopra/sotto (no shadow)
   - Action bar: ♥ like (count) · 💬 comment (count) · ↗ share · 🔖 save (right-aligned)

Desktop: 3-col grid (sidebar 240 · feed flex · right rail 280). Right rail mostra: card "La tua estate" (riassunto stagionale), "Trending tra i tuoi amici", "Suggeriti da seguire" con chip taste-match.

### 5.5 Discover `/discover`
*Vedi: `wireframes/exports/05-discover.png`*

Gerarchia top→bottom:
1. **Search bar** sempre in cima, supporta dettato vocale (microfono in accent).
2. **Type chips** che fanno da scope per la ricerca successiva.
3. **Browse** — 6 prompt fissi (uno per tipo media), griglia 2×3 mobile / 3×2 desktop. Card con icona colorata e tre titoli di esempio in mono.
4. **Trending oggi** — rail orizzontale, copertine 2:3, type-tag in alto, score in basso.
5. **Per tipo media** — un rail per categoria, in TYPE_ORDER fisso (anime, game, tv, manga, movie, board).
6. **Tap** sulla card apre `MediaDetailsDrawer`: bottom sheet 90% h con cover full-bleed.

> La ricerca: debounce 350ms, skeleton ranked, 5 sorgenti API (AniList, TMDB, IGDB, BGG, OpenLibrary). Ranking client-side: starts-with prima di contains.

### 5.6 Per te `/for-you` & `/swipe`
*Vedi: `wireframes/exports/06-foryou-swipe.png`*

**For-you** mostra rail con ordine fisso:
1. **DNA Widget** in cima (gusti dominanti come "Slow-burn · Filosofico · Personaggi").
2. **Top match** — priorità 100, badge `★ N% match` in accent.
3. **Continua a guardare** — sequel/nuove stagioni di titoli completati.
4. **Dai tuoi amici** — alta affinità sociale.
5. **Quick picks** — 5 titoli random ad alta confidence.
6. **Hidden gems** — score con <7000 voti.
7. **Per genere** — top 3 generi del DNA.
8. **"Perché hai amato X"** — semantically related a un titolo specifico.

Badge sui titoli: `★ N% match` (accent), `🏆 Award` (giallo `#F59E0B`), `✦ Serendipity` (viola `#A78BFA`), `📅 Stagione` (t-anime).

**Swipe `/swipe`** — modalità immersiva, sfondo nero. Stack di card 3:4 con 4 azioni:
- ✕ skip (memorizzato lato server, niente più riproposizioni)
- ↻ undo
- ♥ wishlist
- ＋ add to library

Le code persistono in tabelle `swipe_queue_*` lato server.

### 5.7 Library `/library`
*Vedi: `wireframes/exports/07-library.png`*

Tre view selezionabili (segmented control in alto a destra):
- **List** — riga compatta: cover 44×60 con micro-progress sul bordo · titolo + type-pill + stato · barra progresso + score a destra.
- **Grid** — copertine 2:3, type-tag, progress, badge ✓ per i completati.
- **Stats** — KPI in mono (totale, completati, in corso) + heatmap anno + barre per tipo media.

Filtri primari: `Tutto` · `In corso` · `Completati` · `Wishlist`.
Filtri secondari: chip per tipo media.

Heatmap: 6 mesi, 7 righe (giorni), 4 livelli di intensità in accent.

### 5.8 Profilo `/profile/[username]`
*Vedi: `wireframes/exports/08-profilo.png`*

**Hero — 2 stati.**
- **Profilo proprio** — header con `✎ Modifica` e `⚙ Settings`. Niente CTA Segui.
- **Profilo altrui** — back arrow in header. Tre azioni sotto la bio: `Segui` (CTA primaria accent), `Messaggio` (secondaria), `⋯` menu.

**Hero composition.** Avatar 76px radius 24 a sinistra · display name 20/800 + ✓ verified · @username in mono · bio 12 max 2 righe · 3 stat (Opere, Followers, Following) con valore display 18 + label mono.

**Card Taste-match** (solo profili altrui): label mono accent + percentuale display + barra progresso. Solo se >= 50%.

**Tab.** `Collezione` (default) · `Activity` · `Commenti`.
- Collezione: griglia 3 col mobile / 6 col desktop. Drag-reorder solo nel proprio profilo.
- Activity: timeline cronologica.
- Commenti: muro pubblico, simile a un guestbook.

### 5.9 Notifiche · drawer
*Vedi: `wireframes/exports/09-notifiche-componenti.png`*

Bottom sheet a 60% h con drag-handle. Ogni riga:
- Dot 6px accent se non letta, vuoto se letta
- Avatar 32 (utente) o icona 32 (sistema/integrazione)
- Testo: `<b>@user</b>` + verbo + media in italics o `<b style="accent">titolo</b>`
- Sotto: timestamp in mono uppercase 9px

Stati: 1) social (like, follow, comment), 2) sistema (raccomandazioni), 3) integrazione (Steam playtime, Letterboxd sync).

### 5.10 Friends `/friends`
*Vedi: `wireframes/exports/10-friends.png`*

Tre canali sociali in un'unica vista:

1. **Stories rail** in cima — solo amici con attività < 24h. Avatar in story-ring + label.
2. **Activity feed** in stile Discord/Last.fm: avatar 32 · `<b>@user</b>` + verbo + media · timestamp mono · cover 36×48 a destra.
3. Filtri: `Attività` · `In comune` · `Suggeriti`.

**Verbi attività** — vocabolario chiuso:
> sta guardando · ha iniziato · ha completato · ha votato · ha aggiunto alla wishlist · ha commentato · ha messo like · ha pubblicato · ha ricevuto un badge

Tap → apre il drawer del media o il post. Niente dettagli inline per evitare clutter.

---

## 6. Componenti ricorrenti
*Vedi: `wireframes/exports/09-notifiche-componenti.png`*

### 6.1 Pill / chip

| Variante | Stile |
|---|---|
| Default | bg-card, border, text-secondary |
| Active | bg accent 8%, border accent 30%, text accent |
| Type (anime/manga/game/board/movie/tv) | bg colore 8%, border colore 30%, text colore |
| Match | accent 8% bg, prefisso `★` |
| Award | giallo 8% bg, prefisso `🏆` |

Altezza 24, radius 99, padding 0 10, font 11/700.

### 6.2 Avatar

- Quadrati con radius. Tre taglie: sm 24/r8, md 32/r12, lg 76/r24.
- Background: gradient lineare 135° tra due type colors per personalizzare. La firma utente è generata da hash username.
- **Story-ring** — solo per attività recente <24h: gradient lineare 135° accent → accent 50% → accent, padding 2, border interno 2 in bg.

### 6.3 Cover media

- Aspect 2:3, radius 14, border 1px.
- **Type-tag** in alto-sinistra: bg `rgba(11,11,15,0.85)` blur 4, padding 3 7, font mono 9 bold uppercase, color = type color.
- **Score badge** in basso-sinistra: bg nero 60%, font mono 9, prefisso `★`.
- **Match badge** in alto-destra (solo for-you): bg accent 15%, border accent 30%, font mono 9 accent.
- **Progress bar** sul bordo inferiore (3px) per i media in corso, fill accent.
- **Check accent** in alto-destra (solo completati): cerchio 14px accent + ✓.

### 6.4 Bottoni

- **Primary** — h 48 r 16 bg accent text `#0B0B0F` font Cabinet 800 14. Hover: accent 90%.
- **Secondary** — h 48 r 16 bg-card border 1 text. Hover: bg-elevated.
- **Ghost icon** — 40×40 r 14, text. Hover: bg-elevated.
- **Compact** — h 40 r 14, padding 0 18, per right-rail desktop.

### 6.5 Input

- h 48, r 14, bg-secondary, border 1, padding 0 14, font 16.
- Focus: border accent + ring `0 0 0 3px rgba(230,255,61,0.2)`.
- Error: border `#EF4444`, helper rosso sotto.

### 6.6 Card feed

- bg-card, border 1, radius 16, no shadow.
- Padding 12 sull'esterno, 12 sul body.
- Eventuale immagine: full-width tra body e action bar, separata da `border-soft` 1px sopra/sotto.
- Action bar: 18px gap, font 12/600 text-secondary.

---

## 7. Spazio e ritmo
*Vedi: `wireframes/exports/11-spacing.png`*

**Scala spaziale (multipli di 4).**

| Token | px | Uso |
|---|---|---|
| `s-1` | 4 | Separatori interni (gap chip) |
| `s-2` | 8 | Tra elementi correlati |
| `s-3` | 12 | Padding card piccola |
| `s-4` | 14 | Padding-x mobile globale |
| `s-5` | 18 | Padding card |
| `s-6` | 24 | Margine sezione |
| `s-7` | 32 | Padding card hero |
| `s-8` | 48 | Margine sezione desktop |

**Radius.**

| px | Uso |
|---|---|
| 8 | Type-tag, check, cover small |
| 12 | Avatar small, input |
| 14 | Bottone, cover media |
| 16 | Feed card, input grande |
| 18–20 | Card hero |
| 24 | Card hero login, drawer |
| 99/50% | Pill, swipe action, story-ring |

---

## 8. Stati & micro-interazioni

- **Hover desktop** — bg-elevated o accent 90% per CTA.
- **Active/pressed** — scale 0.97, durata 80ms.
- **Focus ring** — 3px accent 35% alpha intorno all'elemento, mai dentro.
- **Loading** — skeleton bg `linear-gradient(90deg, bg-card 0, bg-elevated 50%, bg-card 100%)` con animazione 1.4s.
- **Empty state** — card border-style dashed, centrato: icona 28 + titolo 14/800 + sub 12 text-tertiary.
- **Error inline** — testo `#EF4444`, dimensione 12, sotto al campo.
- **Swipe gesture** — feedback haptic light. Card ruota 6° max su drag, opacity colore overlay (verde/rosso) a 30%.
- **Pull-to-refresh** — mostra spinner accent in alto, "Aggiornato 2 min fa" in mono dopo.

---

## 9. Accessibilità

- Contrasto testo primario su bg-primary: 16:1. Testo secondario: 7.4:1. Tutti AA-large minimo.
- Hit target minimo 44×44 (bottoni, pill, icona-button).
- Bottom-nav navigabile via tastiera con focus visible accent.
- Tutte le icone hanno `aria-label`. I type-tag espongono il tipo via screen reader.
- Movement: `prefers-reduced-motion` disabilita rotazioni e scale, mantiene fade.

---

## 10. Da definire (open questions)

1. **Brand mark** — il segno `★` nel quadrato accent è un placeholder. Serve un logo definitivo prima del lancio.
2. **Illustrazioni empty state** — al momento icone unicode. Servono illustrazioni custom in stile editoriale (linea sottile bianco/accent) per le viste vuote.
3. **Onboarding step 4** — la schermata "fatto" non è ancora dettagliata: bisogna decidere se è uno schermo statico o un mini-video di celebrazione.
4. **Notifiche push** — copy + suoni sono fuori scope di questo documento.
5. **Type colors per dark/light** — il sistema è progettato dark-first. Una eventuale light theme richiede tonalità più sature dei type-colors per mantenere contrasto.

---

*Riferimento visivo completo: `wireframes/index.html` (apri nel browser per zoom + interazione).*
*Tutti gli screenshot sono in `wireframes/exports/`, numerati nell'ordine narrativo del documento.*
