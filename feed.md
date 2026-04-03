\# GEEKORE - DOCUMENTAZIONE FEED PAGE



\*\*Ultimo aggiornamento:\*\* 03 Aprile 2026  

\*\*File principale:\*\* `src/app/feed/page.tsx`



\### 1. Struttura Database (Supabase) - Collegamenti importanti



\#### Tabella `posts`

\- `id` → uuid (primary key)

\- `user\_id` → uuid → riferimento a `auth.users(id)` oppure `profiles(id)`

\- `content` → text

\- `image\_url` → text (nullable)

\- `created\_at` → timestamptz



\*\*Foreign Key usata nel codice:\*\*

\- `profiles!posts\_user\_id\_fkey` → join su `profiles` tramite `posts.user\_id`



\#### Tabella `comments`

\- `id` → uuid (primary key)

\- `post\_id` → uuid → riferimento a `posts(id)`

\- `user\_id` → uuid → riferimento a `auth.users(id)` (NON a profiles!)

\- `content` → text

\- `created\_at` → timestamptz



\*\*Nota importante:\*\*  

Non esiste foreign key diretta tra `comments` e `profiles`.  

Per questo motivo non possiamo usare `profiles!comments\_user\_id\_fkey`.  

Usiamo query separata su `profiles` passando `comments.user\_id`.



\#### Tabella `profiles`

\- `id` → uuid (primary key) → stesso id di `auth.users`

\- `username` → text (unique)

\- `display\_name` → text

\- `avatar\_url` → text (nullable)



\#### Tabella `likes`

\- `id` → uuid

\- `post\_id` → uuid

\- `user\_id` → uuid

\- `created\_at` → timestamptz



\### 2. Come funziona il Feed (logica attuale)



\#### Caricamento iniziale (`loadPosts`)

1\. Carica tutti i post ordinati per `created\_at DESC`

2\. Per ogni post:

&#x20;  - Conta i like (`likes\_count`)

&#x20;  - Conta i commenti (`comments\_count`)

&#x20;  - Verifica se l'utente corrente ha messo like (`liked\_by\_user`)

&#x20;  - Carica i commenti base (`id, content, created\_at, user\_id`)

&#x20;  - Per \*\*ogni commento\*\* fa una query su `profiles` per recuperare `username` e `display\_name`



\#### Pubblicazione Post (`handleCreatePost`)

\- Upload immagine (se presente) su Storage → bucket `post-images`

\- Inserisce il post nella tabella `posts`

\- Recupera immediatamente i dati completi del post (con profilo)

\- Aggiunge il post \*\*in cima\*\* alla lista con animazione fluida (ottimistico)

\- Non fa più reload completo della pagina



\#### Pubblicazione Commento (`handleAddComment`)

\- Inserisce il commento nella tabella `comments`

\- Aggiunge immediatamente il commento in cima alla lista del post (ottimistico)

\- Mostra username dell'utente corrente subito

\- Animazione di fade-in per ogni commento



\### 3. Tipi TypeScript principali



```ts

type Post = {

&#x20; id: string;

&#x20; content: string;

&#x20; image\_url?: string | null;

&#x20; created\_at: string;

&#x20; profiles: { 

&#x20;   username: string; 

&#x20;   display\_name?: string; 

&#x20;   avatar\_url?: string 

&#x20; };

&#x20; likes\_count: number;

&#x20; comments\_count: number;

&#x20; liked\_by\_user: boolean;

&#x20; comments: Comment\[];

};



type Comment = {

&#x20; id: string;

&#x20; content: string;

&#x20; created\_at: string;

&#x20; user\_id: string;

&#x20; username?: string;

&#x20; display\_name?: string;

};

