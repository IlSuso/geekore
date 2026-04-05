# Geekore — Note di architettura e pulizia

## File da ELIMINARE dal progetto

Questi file sono duplicati, orfani o inutili:

```
src/desktop.ini                          ← file Windows, elimina
public/desktop.ini                       ← file Windows, elimina

src/lib/supabase/proxy.ts               ← middleware duplicato, non usato
src/context/NewsContext.tsx             ← non importato da nessuna parte

src/components/feed/post-card.tsx       ← duplicato di FeedCard.tsx
src/components/feed/create-post.tsx     ← duplicato della logica in feed/page.tsx
src/components/feed/comment-section.tsx ← duplicato della logica in FeedCard.tsx
src/components/layout/navbar.tsx        ← duplicato di src/components/Navbar.tsx
src/components/feed/header.tsx          ← usato solo da explore/page.tsx (unifica)
src/components/feed/nav.tsx             ← duplicato di Navbar.tsx (usato solo da explore)

src/app/dashboard/page.tsx              ← form inutile non collegato a niente
src/app/search/page.tsx                 ← stub vuoto (solo UI statica)
```

## Client Supabase — usa SEMPRE questi

### Nei componenti client (`'use client'`):
```ts
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```

### Nelle Server Components / API Routes:
```ts
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
```

### Import legacy (compatibilità):
```ts
import { supabase } from '@/lib/supabase'  // OK, punta al client SSR
```

NON usare più `createClient` da `@supabase/supabase-js` direttamente —
salverebbe la sessione in localStorage invece dei cookie.

## Struttura corretta dei file

```
src/
├── app/
│   ├── api/
│   │   ├── auth/me/route.ts
│   │   ├── boardgames/route.ts
│   │   ├── igdb/route.ts
│   │   ├── news/route.ts
│   │   ├── news/sync/route.ts
│   │   └── steam/
│   │       ├── callback/route.ts  ← aggiornato
│   │       ├── connect/route.ts   ← aggiornato
│   │       ├── games/route.ts
│   │       └── route.ts
│   ├── discover/page.tsx
│   ├── explore/page.tsx
│   ├── feed/page.tsx
│   ├── login/page.tsx             ← aggiornato
│   ├── news/page.tsx
│   ├── notifications/page.tsx
│   ├── profile/
│   │   ├── page.tsx               ← nuovo (redirect a /profile/me)
│   │   ├── [username]/page.tsx    ← riscritto
│   │   ├── edit/page.tsx          ← riscritto
│   │   └── me/page.tsx
│   ├── register/page.tsx          ← aggiornato
│   └── leaderboard/page.tsx
├── components/
│   ├── Navbar.tsx                 ← aggiornato (link /profile/me)
│   ├── icons/SteamIcon.tsx
│   ├── ui/
│   │   ├── avatar.tsx
│   │   └── MediaBadge.tsx
│   ├── explore/search-section.tsx
│   ├── dashboard/profile-form.tsx
│   └── feed/
│       ├── FeedCard.tsx           ← MANTIENI questo
│       └── StoriesBar.tsx
└── lib/
    ├── supabase.ts                ← shim compatibilità
    ├── supabase/
    │   ├── client.ts              ← client browser SSR
    │   └── server.ts              ← client server SSR
    └── api/
        └── anilist.ts
```

## Sicurezza

Il file `supabase-rls.sql` va eseguito su Supabase SQL Editor.
Aggiunge RLS a tutte le tabelle — senza di esso chiunque può
leggere e scrivere i dati di qualsiasi utente via API pubblica.

## Modello di sicurezza profili

- `isOwner` è calcolato confrontando `auth.getUser().id` con `profile.id`
- Non dipende dall'URL — manipolare l'URL non dà accesso ai dati altrui
- RLS su `user_media_entries` garantisce che le INSERT/UPDATE/DELETE
  funzionino solo sul proprio `user_id` anche se qualcuno bypassa il frontend
