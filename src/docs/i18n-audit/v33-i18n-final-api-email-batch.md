# Geekore i18n v33 — chiusura residui

Questa patch parte dallo ZIP aggiornato `src7.zip` e chiude i residui principali emersi dall'audit v32.

## Cosa è stato fatto

### Errori API localizzati IT/EN
Aggiunto `src/lib/i18n/apiErrors.ts`, helper server-side che legge la lingua da:

1. query `?lang=`
2. header `x-lang` / `x-geekore-locale`
3. cookie `geekore_locale`
4. `Accept-Language`
5. fallback `it`

Sono stati collegati agli errori traducibili molti endpoint API, tra cui:

- collection / wishlist / lists
- social: post, commenti, like, follow, profile comment
- import: AniList, MAL, Letterboxd
- avatar e upload immagini post
- preferences / onboarding / profile update
- recommendations feedback/mood/similar/onboarding
- push subscribe / notifications read
- Steam / IGDB / BGG / Xbox
- taste / search / translate description
- cron protetti

### Avatar/upload
Gli errori di upload avatar e immagini post ora non restano più fissi in italiano per casi come:

- file mancante
- file troppo grande
- formato non supportato
- non autenticato
- upload fallito
- troppe richieste

### Email digest
Il digest settimanale ora è localizzato in base a `profiles.preferred_locale`:

- subject IT/EN
- titolo sezioni
- saluto
- CTA
- footer/disiscrizione
- testo “sta guardando / is watching”

In più l'attività amici nel digest usa `display_name` quando disponibile, non solo username.

### Rate limit e validazioni frequenti
Tradotti anche diversi messaggi di throttling/validazione:

- troppe richieste
- troppe importazioni
- troppe cancellazioni
- ricerca troppo corta/lunga
- caratteri non consentiti
- configurazione/risposta/timeout IGDB
- Steam ID non valido

## Nota
Restano hardcoded intenzionali o tecnici: log server, tag interni, nomi di brand, URL, chiavi Supabase/select, commenti e stringhe non mostrate direttamente all'utente.
