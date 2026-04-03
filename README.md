# Geekore

Il tuo universo geek in un unico posto. Anime, manga, videogiochi e board game in un unico profilo social.

## Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database + Auth**: Supabase
- **Deploy**: Vercel
- **API**: AniList (anime/manga), Steam, IGDB (giochi), BoardGameGeek

---

## Setup locale

### 1. Clona e installa

```bash
git clone https://github.com/TUO_USERNAME/geekore.git
cd geekore
npm install
```

### 2. Variabili d'ambiente

```bash
cp .env.local.example .env.local
```

Compila `.env.local` con:
- `NEXT_PUBLIC_SUPABASE_URL` — dalla dashboard Supabase → Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — stessa pagina
- `STEAM_API_KEY` — da https://steamcommunity.com/dev/apikey

### 3. Database Supabase

1. Crea un nuovo progetto su [supabase.com](https://supabase.com)
2. Vai su **SQL Editor**
3. Incolla e lancia il contenuto di `supabase-schema.sql`

### 4. Lancia in locale

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

---

## Deploy su Vercel

1. Pusha il codice su GitHub
2. Vai su [vercel.com](https://vercel.com) → **New Project** → importa la repo
3. In **Environment Variables** aggiungi le stesse variabili di `.env.local`
4. Click **Deploy**

---

## Struttura del progetto

```
src/
├── app/
│   ├── page.tsx              # Landing page pubblica
│   ├── auth/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── feed/page.tsx         # Home feed amici
│   ├── discover/page.tsx     # Scopri + ricerca
│   ├── news/page.tsx         # News personalizzate
│   ├── wishlist/page.tsx     # Wishlist + uscite
│   └── profile/page.tsx      # Profilo personale
├── components/
│   ├── layout/               # AppShell, BottomNav
│   ├── feed/                 # FeedCard, StoriesBar
│   └── ui/                   # Avatar, MediaBadge
├── lib/
│   ├── supabase/             # client, server, middleware
│   ├── api/                  # anilist.ts, steam.ts
│   └── utils.ts
└── types/index.ts
```

---

## Roadmap v1.0

- [ ] Collegare feed a dati reali da Supabase
- [ ] Ricerca con AniList API in `/discover`
- [ ] Connessione account Steam
- [ ] Sistema notifiche uscite
- [ ] Onboarding utente nuovo
