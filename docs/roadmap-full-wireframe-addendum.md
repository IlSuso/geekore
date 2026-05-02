# Geekore — Addendum roadmap da full.html

Questo documento integra la roadmap di implementazione principale usando il wireframe completo `full.html` come riferimento visivo aggiuntivo.

Regola principale: le Fasi 1–15 restano la fonte primaria. Questo addendum non introduce feature fuori roadmap, ma chiarisce layout, gerarchie e rifiniture da applicare alle pagine già previste.

## Principi globali ricavati da full.html

- App autenticata desktop: sidebar fissa 240px a sinistra.
- Mobile autenticato: header 52px + bottom nav 58px a 5 tab.
- Right rail da 280px solo dove utile.
- Le pagine dense di copertine devono privilegiare griglie larghe e non usare right rail se limita troppo il contenuto.
- Le schermate auth e onboarding restano fuori dallo shell autenticato: niente sidebar, niente bottom nav.
- `/swipe` è immersiva: niente sidebar nemmeno su desktop.
- Mobile target visuale: 360×720.
- Desktop target visuale: 1280+.

## Fase 16 — Riallineamento full wireframe

### 16.1 Layout shell desktop

Verificare e correggere le pagine autenticate per rispettare:

- sidebar 240px fissa;
- content flessibile;
- right rail 280px solo dove previsto;
- nascondere sidebar/right rail sotto 1024px;
- bottom nav solo mobile.

Pagine da verificare:

- `/home`: sidebar 240 + feed flex + right rail 280;
- `/for-you`: sidebar + contenuto full-width, senza right rail;
- `/library`: sidebar + content, con filtri persistenti desktop;
- `/discover`: sidebar + content, senza right rail;
- `/friends`: sidebar + content, senza right rail;
- `/profile/[username]`: sidebar + profilo full-width, senza right rail;
- `/notifications`: sidebar + content centrale;
- `/settings`: sidebar app + sidebar secondaria settings;
- `/search`: sidebar + risultati.

### 16.2 Discover visual refinement

Integrare la Fase 8 con il layout di `full.html`:

- rimuovere hero troppo grande se presente;
- search bar h48/r16, desktop h54/r16;
- type chips subito sotto la search;
- browse grid 2×3 mobile / 3×2 desktop;
- `Trending oggi` come sezione primaria;
- rails/type order: anime → game → tv → manga → movie → board;
- card browse colorate con border 18% e bg 4%;
- desktop grid trending a 7 colonne quando lo spazio lo permette.

### 16.3 For-you visual refinement

Integrare Fase 9 con `full.html`:

- desktop senza right rail;
- DNA header più ampio desktop;
- griglie/rails a 6 colonne desktop;
- CTA desktop: `Filtri` + `Swipe →`;
- mobile: DNA card in alto, poi rail orizzontali.

### 16.4 Library visual refinement

Integrare Fase 10 con `full.html`:

- mobile: list/grid/stats switch in header area;
- desktop: griglia larga fino a 7 colonne;
- sidebar desktop library con filtri persistenti: In corso, Completati, Wishlist, Tipo;
- stats mobile con KPI 3 colonne, heatmap e barre tipo media.

### 16.5 Friends visual refinement

Integrare Fase 13 con `full.html`:

- stories rail in alto;
- filtri: Attività / In comune / Suggeriti;
- activity cards con avatar 32, verbo chiuso, media e cover 36×48;
- desktop: griglia attività 2 colonne.

### 16.6 Profile visual refinement

Integrare Fase 11 con `full.html`:

- mobile profilo proprio: header username + edit/settings;
- mobile profilo altrui: back + username + menu;
- desktop: hero full-width con cover gradient, avatar che sborda, stats cards e griglia 8 colonne;
- profilo altrui con taste match card se >= 50%.

### 16.7 Media drawer refinement

Integrare Fase 14 con `full.html`:

- mobile: bottom sheet con cover full-bleed sopra, handle e body scrollabile;
- desktop: modal centrata/split, non side drawer, quando aperta sopra Discover/Profile/Home;
- azioni primarie: Aggiungi, Wishlist, Share/Rating.

### 16.8 Notifications refinement

Integrare Fase 12 con `full.html`:

- mobile drawer bottom sheet 60% con sfondo pagina attenuato;
- desktop pagina `/notifications` con filtri Tutto/Social/Sistema/Integrazioni;
- righe con dot unread, avatar o system icon, testo e timestamp mono uppercase.

### 16.9 Settings e Search

Queste pagine non erano dettagliate nella roadmap principale, ma sono presenti in `full.html` e devono essere trattate come fase di coerenza visuale:

- `/settings`: mobile lista sezioni; desktop app sidebar + settings sidebar secondaria;
- `/search`: risultati mobile e desktop coerenti con Discover, highlight query, filtri per tipo e utenti.

## Ordine operativo consigliato

1. Completare Fase 8 Discover usando 16.2.
2. Completare Fase 9 For-you/Swipe usando 16.3.
3. Completare Fase 10 Library usando 16.4.
4. Completare Fase 11 Profile usando 16.6.
5. Completare Fase 12 Notifications usando 16.8.
6. Completare Fase 13 Friends usando 16.5.
7. Completare Fase 14 Media Drawer usando 16.7.
8. Eseguire Fase 16 completa di rifinitura cross-page.
