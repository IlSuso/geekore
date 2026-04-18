// src/app/api/cron/fake-activity/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// Cron giornaliero — simula attività naturale degli utenti fake
//
// Configurazione vercel.json:
//   { "path": "/api/cron/fake-activity", "schedule": "0 * * * *" }
//   (gira ogni ora; ogni utente fake ha un offset derivato dal suo UUID,
//    quindi ognuno "posta" in un'ora diversa della giornata)
//
// Richiede in .env:
//   SUPABASE_SERVICE_ROLE_KEY=...
//   CRON_SECRET=...   (Vercel lo passa automaticamente)
//
// PREREQUISITO: eseguire migration_used_fake_content.sql su Supabase
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

// ── Profili degli utenti fake ─────────────────────────────────────────────────
// Ogni utente ha una "personalità" che guida il tipo di contenuto che posta
const FAKE_USERS: Record<string, { username: string; topics: string[]; style: string }> = {
  'a1000000-0000-0000-0000-000000000001': {
    username: 'marco_geek',
    topics: ['game', 'souls', 'rpg'],
    style: 'entusiasta',
  },
  'a1000000-0000-0000-0000-000000000002': {
    username: 'giulia_otaku',
    topics: ['manga', 'shonen', 'slice_of_life'],
    style: 'analitico',
  },
  'a1000000-0000-0000-0000-000000000003': {
    username: 'luca_gamer',
    topics: ['game', 'indie', 'strategy'],
    style: 'ironico',
  },
  'a1000000-0000-0000-0000-000000000004': {
    username: 'sara_cosplay',
    topics: ['anime', 'fantasy', 'manga'],
    style: 'emozionale',
  },
  'a1000000-0000-0000-0000-000000000005': {
    username: 'andrea_nerd',
    topics: ['game', 'strategy', 'indie'],
    style: 'entusiasta',
  },
  'a1000000-0000-0000-0000-000000000006': {
    username: 'elena_cine',
    topics: ['film', 'tv', 'serie'],
    style: 'critico',
  },
  'a1000000-0000-0000-0000-000000000007': {
    username: 'matteo_rpg',
    topics: ['rpg', 'game', 'jrpg'],
    style: 'appassionato',
  },
  'a1000000-0000-0000-0000-000000000008': {
    username: 'chiara_manga',
    topics: ['manga', 'shojo', 'josei'],
    style: 'emozionale',
  },
  'a1000000-0000-0000-0000-000000000009': {
    username: 'davide_steam',
    topics: ['game', 'indie', 'open_world'],
    style: 'ironico',
  },
  'a1000000-0000-0000-0000-000000000010': {
    username: 'francesca_pop',
    topics: ['anime', 'tv', 'manga'],
    style: 'casual',
  },
  'a1000000-0000-0000-0000-000000000011': {
    username: 'simone_hs',
    topics: ['game', 'horror', 'film'],
    style: 'entusiasta',
  },
  'a1000000-0000-0000-0000-000000000012': {
    username: 'valentina_sw',
    topics: ['film', 'tv', 'fantasy'],
    style: 'analitico',
  },
  'a1000000-0000-0000-0000-000000000013': {
    username: 'riccardo_gg',
    topics: ['game', 'souls', 'fps'],
    style: 'competitivo',
  },
  'a1000000-0000-0000-0000-000000000014': {
    username: 'alessia_book',
    topics: ['manga', 'light_novel', 'anime'],
    style: 'analitico',
  },
  'a1000000-0000-0000-0000-000000000015': {
    username: 'federico_retro',
    topics: ['game', 'retro', 'indie'],
    style: 'nostalgico',
  },
}

const FAKE_USER_IDS = Object.keys(FAKE_USERS)

// ── Hash deterministico del contenuto (per burn) ──────────────────────────────
function hashContent(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16)
}

// ════════════════════════════════════════════════════════════════════════════
// POST POOL — raggruppati per topic, linguaggio informale italiano
// Ogni entry è: { topics: string[], text: string }
// ════════════════════════════════════════════════════════════════════════════
const POST_POOL: { topics: string[]; text: string }[] = [
  // ── GAMING generico ──────────────────────────────────────────────────────
  { topics: ['game', 'rpg', 'jrpg', 'souls', 'indie', 'strategy', 'fps', 'open_world', 'retro'],
    text: 'ok raga devo ammetterlo: ho passato le ultime 4 ore a fare side quest invece di andare avanti con la storia principale e non mi pento minimamente' },
  { topics: ['game', 'rpg', 'jrpg', 'souls', 'indie'],
    text: 'quella sensazione quando finisci un gioco che ti ha tenuto sveglio per settimane e non sai cosa fare della tua vita. grazie e arrivederci.' },
  { topics: ['game', 'indie', 'strategy', 'open_world'],
    text: 'gli indie nel 2024 stanno letteralmente umiliando i tripla A. ho speso 15€ e ci ho messo più ore che in qualsiasi gioco da 70€' },
  { topics: ['game', 'souls', 'rpg'],
    text: 'ho murato contro il boss di turno per 2 ore, l\'ho battuto, ho urlato, il vicino ha bussato. tutto normale.' },
  { topics: ['game', 'fps', 'strategy', 'open_world'],
    text: 'ancora in giro dopo mezzanotte. domani mi odierò. stasera sono invincibile.' },
  { topics: ['game', 'souls', 'fps', 'rpg'],
    text: 'no ma raga il combat system di questo gioco è una cosa da un altro pianeta. ogni schivata ha un peso diverso. chef kiss.' },
  { topics: ['game', 'rpg', 'jrpg', 'indie'],
    text: 'pensavo "beh ci gioco un\'oretta" — sono passate 5 ore. la cena era sul fuoco.' },
  { topics: ['game', 'open_world', 'rpg', 'jrpg'],
    text: 'quando un gioco ha un\'ambientazione così buona che esplori ogni angolo invece di andare agli obiettivi. questo è il gioco.' },
  { topics: ['game', 'retro', 'indie'],
    text: 'ho ripreso in mano un gioco del 2004 e regge ancora benissimo. forse allora i game designer avevano più tempo per polire le cose.' },
  { topics: ['game', 'souls', 'fps'],
    text: 'colonna sonora ascoltata durante l\'ennesima run: 10/10. mi mette uno stato d\'ansia incredibile e mi piace tantissimo.' },
  { topics: ['game', 'rpg', 'jrpg'],
    text: 'la mia lista su steam è tipo 400 giochi. ne ho finiti forse 20. questo sono io. questa è la mia vita.' },
  { topics: ['game', 'indie', 'retro'],
    text: 'un amico mi ha consigliato questo titolino indie di cui non avevo mai sentito parlare. già 40 ore dentro. grazie e ti odio.' },
  { topics: ['game', 'rpg', 'jrpg'],
    text: 'il problema dei giochi con crafting è che finisco per trascorrere più tempo a craftare che a giocare effettivamente' },
  { topics: ['game', 'open_world', 'rpg'],
    text: 'npc random con una storyline più interessante della quest principale. gli sviluppatori sanno cosa stanno facendo e lo fanno apposta.' },
  { topics: ['game', 'strategy'],
    text: '"solo un\'altra partita" — 3 ore dopo. il sole sta per sorgere. non ho rimpianti.' },
  { topics: ['game', 'souls', 'fps', 'rpg'],
    text: 'i giochi che ti danno la sensazione che il personaggio abbia fisicamente peso quando si muove sono una cosa sacra' },
  { topics: ['game', 'indie', 'retro'],
    text: 'non capirò mai perché la community di certi giochi sia tossica quando il gioco stesso è così bello. contraddizione enorme.' },
  { topics: ['game', 'rpg', 'jrpg', 'souls'],
    text: 'update: sono finalmente riuscito a passare quella sezione che mi bloccava da ieri. ho quasi pianto. non quasi.' },
  { topics: ['game', 'open_world', 'rpg', 'jrpg'],
    text: 'mi sono perso 40 minuti a guardare il tramonto dentro al gioco. la grafica era tipo un dipinto. vale tutto.' },
  { topics: ['game', 'souls', 'fps'],
    text: 'il mio controller ha appena avuto la sua prima morte significativa. riposa in pace piccolo. hai sofferto tanto.' },
  { topics: ['game', 'rpg', 'jrpg'],
    text: 'hot take: i tutorial interminabili rovinano più giochi di quanto il gioco stesso non possa rovinare. basta, fateci giocare.' },
  { topics: ['game', 'indie', 'strategy'],
    text: 'finalmente capito perché hanno vinto il GOTY. ci sono momenti di game design così eleganti che hai voglia di applaudire.' },
  { topics: ['game', 'retro', 'indie'],
    text: 'pixel art fatta bene > qualsiasi grafica ultra realistica. lo dico e non mi pento.' },
  { topics: ['game', 'souls', 'rpg', 'fps'],
    text: 'il momento in cui realizzi che il gioco ti stava preparando per questo boss sin dall\'inizio. rispetto assoluto.' },
  { topics: ['game', 'open_world', 'rpg'],
    text: 'tipo ho fatto 3 ore di lore, ho letto tutte le note, ho ascoltato tutti i dialoghi. sì lo so. sono fatto così.' },

  // ── SOULS-LIKE ───────────────────────────────────────────────────────────
  { topics: ['souls'],
    text: 'elden ring: muoio 40 volte contro lo stesso boss. alla 41esima lo batto senza essere colpito una volta sola. questo gioco è malato.' },
  { topics: ['souls'],
    text: 'la gente che dice che i souls-like sono inaccessibili non ha ancora capito che la difficoltà È il gioco. non è un ostacolo, è il punto.' },
  { topics: ['souls'],
    text: 'sekiro mi ha insegnato la pazienza più di qualsiasi altra cosa nella mia vita. e mi ha fatto anche incazzare moltissimo, ma questo è secondario.' },
  { topics: ['souls'],
    text: 'quando finalmente parry-i un attacco che non riuscivo a leggere da ore — quella sensazione non la trovi in nessun altro genere.' },
  { topics: ['souls'],
    text: 'DLC di elden ring completato. le mani tremano ancora. grazie miyazaki, sei un genio e un bastardo allo stesso tempo.' },

  // ── JRPG ─────────────────────────────────────────────────────────────────
  { topics: ['jrpg', 'rpg'],
    text: 'final fantasy ha colonne sonore che mi fanno venire i brividi dopo 20 anni. nobuo uematsu è un compositore leggendario, non si discute.' },
  { topics: ['jrpg', 'rpg'],
    text: 'sono a 80 ore di persona e sto ancora a fare solo social link. il gioco effettivo quando inizia.' },
  { topics: ['jrpg'],
    text: 'un jrpg con una storia che ti fa venire voglia di trovare il numero di telefono degli sviluppatori solo per ringraziarli.' },
  { topics: ['jrpg', 'rpg'],
    text: 'il problema dei jrpg è che non riesci mai a smettere nel momento giusto. c\'è sempre un altro dungeon, sempre un altro capitolo.' },
  { topics: ['jrpg'],
    text: 'atlus che prende un concept assurdo e lo trasforma in uno dei giochi più belli dell\'anno. routine a questo punto.' },

  // ── INDIE ────────────────────────────────────────────────────────────────
  { topics: ['indie'],
    text: 'balatro è un gioco di carte su poker ma in realtà è cocaina digitale. non lo toccate. siete avvertiti.' },
  { topics: ['indie'],
    text: 'hades II in early access è già il mio gioco dell\'anno e siamo solo a metà. supergiant games non sbaglia un colpo.' },
  { topics: ['indie'],
    text: 'stardew valley update nuovo → torno dentro dopo due anni → sparisco per una settimana. la storia si ripete.' },
  { topics: ['indie'],
    text: 'un gioco fatto da una persona sola che batte produzioni da milioni di dollari in termini di polish e cura. chapeau.' },
  { topics: ['indie'],
    text: 'dave the diver sembra un puzzle ma poi è un ristorante ma poi è un mystery ma poi è un action. roba assurda.' },

  // ── RETRO ────────────────────────────────────────────────────────────────
  { topics: ['retro'],
    text: 'ho tirato fuori dal garage il snes. donkey kong country regge ancora. la musica di david wise è immortale.' },
  { topics: ['retro'],
    text: 'i giochi del 1995 avevano livelli segreti che scoprivi solo per caso o se conoscevi qualcuno che li aveva già trovati. tipo magia nera.' },
  { topics: ['retro'],
    text: 'nostalgia game: primo rpg che hai giocato da bambino. il mio era pokemon rosso su game boy. non dimentico.' },
  { topics: ['retro'],
    text: 'la colonna sonora di questo gioco del 2001 mi buca ancora il cervello. i compositori di quell\'era erano su un altro livello.' },

  // ── ANIME ────────────────────────────────────────────────────────────────
  { topics: ['anime'],
    text: 'dungeon meshi mi fa venire una fame incredibile a ogni episodio. non è normale cucinare mostri e farlo sembrare invitante.' },
  { topics: ['anime'],
    text: 'solo leveling ha l\'animazione migliore degli ultimi anni per un power fantasy. a-1 pictures si è superata.' },
  { topics: ['anime'],
    text: 'frieren è un anime lento nel senso migliore possibile. ogni scena respira. non è pigrizia, è stile.' },
  { topics: ['anime'],
    text: 'quando un anime di 12 episodi riesce a farti affezionare a personaggi più di serie con 200 puntate. la scrittura, raga, la scrittura.' },
  { topics: ['anime'],
    text: 'jjk stagione 2 ha rotto tutti gli standard di animazione per un anime shonen. mappa ha fatto qualcosa di storico.' },
  { topics: ['anime'],
    text: 'finalmente capisco l\'hype di attack on titan. ci ho messo 5 anni ad iniziarlo e ora non mi spiego il ritardo.' },
  { topics: ['anime'],
    text: 'blue lock è l\'anime più assurdo sul calcio e anche il più coinvolgente. mi fa venire voglia di allenarmi e non so nemmeno giocare.' },
  { topics: ['anime'],
    text: 'maratona anime questo weekend. non rispondo a nessuno. sto bene.' },
  { topics: ['anime'],
    text: 'quando l\'opening di un anime è così buona che non la skippi MAI, neanche dopo la 50esima volta.' },
  { topics: ['anime'],
    text: 'episodio nuovo di frieren. mi siedo. mi preparo un tè. voglio assaporare ogni momento.' },
  { topics: ['anime'],
    text: 'oshi no ko mi ha distrutto psicologicamente nel primo episodio. e poi ho continuato comunque. siamo fatti male.' },

  // ── MANGA ────────────────────────────────────────────────────────────────
  { topics: ['manga', 'shonen'],
    text: 'berserk capitolo nuovo. ancora non realizzo. miura avrebbe approvato il lavoro che stanno facendo.' },
  { topics: ['manga', 'shonen'],
    text: 'chainsaw man parte 2 è completamente diversa dalla prima e ci sto ancora dentro. fujimoto fa quello che vuole e funziona.' },
  { topics: ['manga', 'shojo', 'josei'],
    text: 'ho riletto nana per l\'ennesima volta. ogni volta mi distrugge in modo diverso. ai yazawa è un genio.' },
  { topics: ['manga'],
    text: 'vinland saga è diventato un manga completamente diverso rispetto all\'inizio. e sono ancora più bello così.' },
  { topics: ['manga', 'shonen'],
    text: 'la cosa bella dei manga è che puoi leggere 10 capitoli in 20 minuti e poi startene lì a fissare il soffitto per un\'ora.' },
  { topics: ['manga'],
    text: 'ho iniziato a leggere i raw in giapponese perché non reggevo l\'attesa della traduzione. ho imparato il giapponese per un manga. normale.' },
  { topics: ['manga', 'shojo', 'josei'],
    text: 'i manga slice of life hanno una capacità di raccontare momenti piccoli che nessun altro medium sa fare uguale.' },
  { topics: ['manga', 'shonen'],
    text: 'quando il manga va in hiatus proprio al cliffhanger più assurdo della storia. grazie. grazie davvero.' },
  { topics: ['manga', 'light_novel'],
    text: 'serie finita, 200 capitoli, final capitolo bellissimo. sto già cercando cosa leggere dopo e so già che niente sarà all\'altezza.' },
  { topics: ['manga', 'shojo'],
    text: 'quel momento in cui un personaggio che odiavi diventa il tuo preferito. la scrittura quando è fatta bene è proprio questo.' },

  // ── LIGHT NOVEL ──────────────────────────────────────────────────────────
  { topics: ['light_novel'],
    text: 'ho iniziato la light novel dopo aver visto l\'anime e capisco perché dicono che il libro è sempre meglio. i dettagli in più cambiano tutto.' },
  { topics: ['light_novel'],
    text: 'alcune light novel hanno worldbuilding di un livello che mette in imbarazzo molti romanzi fantasy occidentali. lo dico senza esitazione.' },

  // ── FILM ─────────────────────────────────────────────────────────────────
  { topics: ['film'],
    text: 'film consigliato da un amico con "vedrai che ti piacerà". guardato. pianto. incazzato. grazie mille davvero.' },
  { topics: ['film'],
    text: 'uno di quei film dove la regia dice più dei dialoghi. ci pensavo ancora stamattina sotto la doccia.' },
  { topics: ['film'],
    text: 'dune 2 è il film fantasy più bello visivamente degli ultimi 10 anni. villeneuve ha fatto qualcosa di epico.' },
  { topics: ['film'],
    text: 'quando un film di 3 ore ti sembra corto perché sei completamente dentro. magia del cinema quando funziona.' },
  { topics: ['film'],
    text: 'oppenheimer guardato al cinema mesi fa e sto ancora pensandoci. nolan è nolan.' },
  { topics: ['film'],
    text: 'film horror guardato da solo di notte. errore mio. non dormirò bene per giorni. ma era bellissimo.' },
  { topics: ['film'],
    text: 'la colonna sonora di questo film merita da sola il prezzo del biglietto. l\'ho riascoltata per un\'ora intera.' },
  { topics: ['film'],
    text: 'quel tipo di finale che non risponde a tutte le domande e hai voglia di urlare ma in realtà è perfetto così.' },

  // ── SERIE TV ─────────────────────────────────────────────────────────────
  { topics: ['tv', 'serie'],
    text: 'shogun (fx) è la miglior serie che ho visto negli ultimi 3 anni. punto. non accetto repliche.' },
  { topics: ['tv', 'serie'],
    text: 'the bear stagione 2 è uno show sul trauma mascherato da serie su un ristorante. mi aspettavo di mangiare bene e invece ho pianto.' },
  { topics: ['tv', 'serie'],
    text: 'fallout amazon mi ha convinto a riprendere fallout 4. ottima serie, ottimo marketing involontario.' },
  { topics: ['tv', 'serie'],
    text: 'quando una serie finisce e ti senti spaesato per giorni. non sai cosa guardare. la vita sembra piatta. è normale vero?' },
  { topics: ['tv', 'serie'],
    text: 'ho consumato 8 episodi in una sera. non me ne vergogno. era troppo buona per fermarmi.' },
  { topics: ['tv', 'serie'],
    text: 'serie consigliata: "guarda solo il primo episodio". 5 ore dopo. notte. lavoro domani mattina. tutto bene.' },
  { topics: ['tv', 'serie', 'fantasy'],
    text: 'quando una serie fantasy riesce a farti voler bene ai personaggi prima ancora che succeda qualcosa di grosso. questo è worldbuilding.' },
  { topics: ['tv', 'serie'],
    text: 'il villain di questa serie è uno dei personaggi più scritti bene degli ultimi anni. non faccio spoiler ma lo sai quando lo vedi.' },
  { topics: ['tv', 'serie'],
    text: 'maratona notturna finita alle 3. occhi che bruciano. non mi pento. domani li odierò ma stasera sono un eroe.' },

  // ── HORROR ───────────────────────────────────────────────────────────────
  { topics: ['horror'],
    text: 'alan wake 2 è il gioco horror più bello degli ultimi 10 anni. remedy ha fatto qualcosa di unico e irripetibile.' },
  { topics: ['horror'],
    text: 'resident evil 4 remake: capcom che prende un classico e lo rende ancora più bello. non sempre il remake è un\'eresia.' },
  { topics: ['horror'],
    text: 'horror fatto bene non ti spaventa con i jumpscare. ti mette un senso di disagio che rimane per ore. questo è il test.' },
  { topics: ['horror'],
    text: 'ho giocato un horror da solo di notte. perché lo faccio sempre. perché mi piace soffrire evidentemente.' },

  // ── FANTASY ──────────────────────────────────────────────────────────────
  { topics: ['fantasy'],
    text: 'un worldbuilding così dettagliato che hai voglia di leggere il lore anche quando non stai giocando/guardando.' },
  { topics: ['fantasy'],
    text: 'quando il magic system di una storia ha regole interne consistenti mi innamoro automaticamente. è una scienza.' },

  // ── META / GEEK GENERICO ─────────────────────────────────────────────────
  { topics: ['game', 'anime', 'manga', 'film', 'tv', 'light_novel', 'retro', 'indie', 'horror', 'fantasy', 'souls', 'rpg', 'jrpg', 'strategy', 'fps', 'open_world', 'slice_of_life', 'shonen', 'shojo', 'josei', 'serie'],
    text: 'avere troppa roba in lista da guardare/leggere/giocare e non sapere mai da dove iniziare. questo siamo noi.' },
  { topics: ['game', 'anime', 'manga', 'film', 'tv'],
    text: 'geekore è il posto dove finalmente posso tracciare tutta la roba che consumo senza dover aprire 5 app diverse' },
  { topics: ['game', 'anime', 'manga', 'film', 'tv'],
    text: 'il momento in cui finisci qualcosa e non sai cosa fare di te. la crisi post-opera colpisce ancora.' },
  { topics: ['game', 'anime', 'manga', 'film', 'tv'],
    text: 'mi hanno chiesto "ma non stai perdendo tempo?" e non ho saputo rispondere perché stavo ancora pensando alla scena finale.' },
  { topics: ['game', 'anime', 'manga', 'film', 'tv', 'horror', 'fantasy'],
    text: 'consiglio del giorno: trovate qualcuno con cui condividere le vostre passioni. cambia tutto.' },
  { topics: ['game', 'anime', 'manga', 'tv', 'film'],
    text: 'c\'è qualcosa che stai seguendo/giocando/leggendo in questo periodo? sono in crisi post-fine e ho bisogno di consigli' },
  { topics: ['game', 'anime', 'manga'],
    text: 'non ho dormito abbastanza ma sono felice. questo è il benchmark giusto.' },
]

// ════════════════════════════════════════════════════════════════════════════
// COMMENT POOL — raggruppati per "umore" del post a cui rispondono
// Il sistema sceglie commenti coerenti analizzando le parole chiave del post
// ════════════════════════════════════════════════════════════════════════════

// Categorie di commenti → matchate al post tramite keyword
const COMMENT_POOLS: { keywords: string[]; comments: string[] }[] = [
  {
    // Post entusiasti su un gioco/anime appena finito
    keywords: ['finito', 'completato', 'finire', 'platinum', 'platinato', 'finale', 'fine'],
    comments: [
      'quanto ci hai messo in totale?',
      'anch\'io l\'ho finito la settimana scorsa, quella sensazione di vuoto post-fine è reale',
      'sto ancora a metà ma ora hai alzato le aspettative ulteriormente',
      'ok adesso dimmi che cosa iniziare per riempire il vuoto che lascia',
      'anche io stessa reazione al finale. non me l\'aspettavo così',
      'il post-fine mi devasta sempre. poi dopo una settimana inizio qualcos\'altro e si ripete tutto',
      'qualcuno che capisce. anche per me è stato un viaggio assurdo',
    ],
  },
  {
    // Post su boss difficili / sfide
    keywords: ['boss', 'muoio', 'muore', 'difficile', 'parry', 'schivata', 'tentativi', 'run', 'checkpoint'],
    comments: [
      'lol anche io bloccato sullo stesso punto da ieri',
      'quando l\'hai battuto ti vengono i brividi. non esiste emozione simile',
      'consiglio: prova ad aggirarlo e torna dopo. a volte aiuta',
      'che boss? potrebbe essere che sei underlevellato',
      'stessa cosa esatta mi è successa. poi l\'ho battuto e mi sono sentito un dio per 10 minuti',
      'i souls-like sono una terapia mascherata da gioco. lo dico sul serio.',
      'io ci ho messo 6 ore. poi l\'ho passato e non ho dormito per l\'adrenalina',
    ],
  },
  {
    // Post sulle ore di gioco / tempo perso
    keywords: ['ore', 'notte', 'dormito', 'dormire', 'sveglio', 'sonno', 'mezzanotte', 'mattina', 'stasera'],
    comments: [
      'lmao anche io ieri. stavo bene poi sono le 2 di notte',
      'il tempo quando giochi è una dimensione completamente diversa',
      'fra, il sonno è sopravvalutato. lo recuperi nel weekend',
      'questa è la mia vita ogni venerdì sera senza eccezioni',
      'domani ci odieremo ma stasera siamo eroi',
      'già fatto uguale questa settimana, welcome to the club',
    ],
  },
  {
    // Post su anime/manga in corso
    keywords: ['episodio', 'capitolo', 'stagione', 'puntata', 'manga', 'anime', 'arco', 'hiatus'],
    comments: [
      'anche io l\'ho recuperato questa settimana, che salto di qualità',
      'aspetto sempre che escano un po\' di capitoli prima di leggere così non soffro gli hiatus',
      'quando esce il prossimo capitolo?? non reggo più',
      'ma hai letto il manga? è ancora meglio',
      'ho iniziato ieri e sono già 3 stagioni avanti. non vivo più.',
      'sì ma quella scena al capitolo X (no spoiler) mi ha distrutto emotivamente',
      'in che punto sei? non fare spoiler che sono indietro',
    ],
  },
  {
    // Post su consigli / cosa guardare dopo
    keywords: ['consiglio', 'consigli', 'cosa', 'iniziare', 'lista', 'dopo', 'cercando', 'suggerimenti'],
    comments: [
      'se ti è piaciuto quello, devi assolutamente provare anche X',
      'io sono nella tua stessa situazione, se trovi qualcosa di buono segnalami',
      'dipende da cosa ti è piaciuto di più: storia o gameplay/animazione?',
      'dai un\'occhiata a quello che ho in lista, potrebbe piacerti',
      'ho una lista infinita di robe da recuperare, ti mando qualcosa',
      'stesso problema. alla fine rigioco sempre le stesse cose perché non so scegliere',
    ],
  },
  {
    // Post emozionali (pianto, colpo al cuore, storia toccante)
    keywords: ['pianto', 'piangere', 'lacrime', 'toccante', 'bellissimo', 'commosso', 'emozionato', 'cuore', 'devastato'],
    comments: [
      'anch\'io, e non me ne vergogno per niente',
      'quella scena lì è il momento in cui ho capito che era un capolavoro',
      'mi hai fatto venire voglia di ricominciare dall\'inizio',
      'la scrittura quando è fatta così bene fa male nel modo giusto',
      'ok adesso non riesco a pensare ad altro, grazie',
      'io ho fatto finta di niente davanti agli amici. poi a casa da solo. yeah.',
    ],
  },
  {
    // Post ironici / auto-deprecativi
    keywords: ['non dormo', 'non ho dormito', 'lista infinita', 'non finisco mai', 'steam', 'backlog', 'comprato', 'acquistato'],
    comments: [
      'lol la mia steam library ha 300 giochi e ne ho finiti 12',
      'il backlog è una condizione cronica. non si guarisce.',
      'e poi ne compri altri sette durante i saldi. la ruota gira.',
      'stessa energia. stesso problema. nessuna soluzione.',
      'il bello è che continui ad aggiungere roba come se avessi tempo infinito',
      'benvenuto nel club, le riunioni sono ogni giorno e non concludiamo nulla',
    ],
  },
  {
    // Post su colonne sonore / musica
    keywords: ['colonna sonora', 'ost', 'musica', 'soundtrack', 'compositore', 'brano', 'traccia'],
    comments: [
      'l\'ho riascoltata su spotify per ore, sei il mio gemello',
      'la musica di quel gioco/anime è in un altro universo rispetto alla concorrenza',
      'ancora in testa dopo settimane. non passa.',
      'il compositore merita molto più riconoscimento di quanto non abbia',
      'ascoltarla mentre faccio altro e mi vengono i flashback delle scene. pericolo.',
    ],
  },
  {
    // Post generici / universali (fallback)
    keywords: [],
    comments: [
      'concordo al 100%, stessa sensazione',
      'anche io stava pensando la stessa cosa ultimamente',
      'me lo segno assolutamente, grazie del reminder',
      'già messo in lista dopo questo post',
      'aspetta ma anche tu?? finalmente qualcuno che capisce',
      'lo sto aspettando da un sacco, mi hai convinto a iniziarlo prima',
      'troppo forte questa cosa, condivido',
      'anch\'io ogni volta uguale, è quasi terapeutico',
      'ottimo gusto, rispetto massimo',
      'ne ho parlato anche io con un amico ieri, stessa discussione',
      'aggiungo subito in lista, grazie',
      'sì ma hai provato anche X? penso ti piacerebbe molto',
      'quanto tempo ci hai messo?',
      'ormai è un classico moderno, giustamente',
      'beh benvenuto nel club, ci siamo tutti già passati',
      'mi fa piacere sentire che non sono l\'unico',
    ],
  },
]

// ── Sceglie commenti coerenti con il contenuto del post ──────────────────────
function pickCoherentComment(postContent: string): string {
  const lower = postContent.toLowerCase()

  // Cerca il pool più specifico con più keyword match
  let bestPool = COMMENT_POOLS[COMMENT_POOLS.length - 1] // fallback generico
  let bestScore = 0

  for (const pool of COMMENT_POOLS.slice(0, -1)) {
    const score = pool.keywords.filter(kw => lower.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestPool = pool
    }
  }

  return bestPool.comments[Math.floor(Math.random() * bestPool.comments.length)]
}

// ── Filtra post per topic dell'utente ────────────────────────────────────────
function getPostsForUser(userId: string): { topics: string[]; text: string }[] {
  const user = FAKE_USERS[userId]
  if (!user) return POST_POOL

  return POST_POOL.filter(p =>
    p.topics.some(t => user.topics.includes(t))
  )
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Controlla se un contenuto è già stato usato (burn) ───────────────────────
async function isUsed(supabase: any, text: string): Promise<boolean> {
  const hash = hashContent(text)
  try {
    const { data } = await supabase
      .from('used_fake_content')
      .select('content_hash')
      .eq('content_hash', hash)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

async function markUsed(supabase: any, text: string): Promise<void> {
  const hash = hashContent(text)
  await supabase
    .from('used_fake_content')
    .insert({ content_hash: hash })
    .onConflict('content_hash')
    .ignore()
}

// ── Sceglie un post non ancora usato per l'utente ────────────────────────────
async function pickUnusedPost(
  supabase: any,
  userId: string
): Promise<string | null> {
  const candidates = getPostsForUser(userId)
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)

  for (const candidate of shuffled) {
    if (!(await isUsed(supabase, candidate.text))) {
      return candidate.text
    }
  }
  return null // tutto bruciato
}

async function pickUnusedComment(
  supabase: any,
  postContent: string
): Promise<string | null> {
  // Genera 3-5 varianti del commento per avere più possibilità di trovarne uno non usato
  const baseComments = Array.from({ length: 5 }, () => pickCoherentComment(postContent))
  const unique = [...new Set(baseComments)]

  for (const comment of unique) {
    if (!(await isUsed(supabase, comment))) {
      return comment
    }
  }
  return null
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPALE
// Gira una volta al giorno (schedule: "0 12 * * *").
// Seleziona 3-5 utenti casuali tra i 15, ognuno con probabilità diverse
// di postare/commentare/likare. I timestamp vengono randomizzati nelle
// ultime 23 ore così i contenuti appaiono distribuiti nella giornata.
// ════════════════════════════════════════════════════════════════════════════

// Genera un timestamp casuale tra le 12:00 UTC di ieri e adesso
// così i post appaiono distribuiti nelle ultime 24 ore, mai nel futuro
function randomTimestampSinceMidnight(): string {
  const now = Date.now()
  const yesterdayNoon = new Date()
  yesterdayNoon.setUTCDate(yesterdayNoon.getUTCDate() - 1)
  yesterdayNoon.setUTCHours(12, 0, 0, 0)
  const windowMs = now - yesterdayNoon.getTime()
  // 5 minuti di margine prima di adesso
  const safeWindow = Math.max(windowMs - 5 * 60 * 1000, 0)
  const offsetMs = Math.floor(Math.random() * safeWindow)
  return new Date(yesterdayNoon.getTime() + offsetMs).toISOString()
}

// Shuffle Fisher-Yates
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: string[] = []

  // ── Seleziona 3-5 utenti casuali per oggi ─────────────────────────────────
  const count = 3 + Math.floor(Math.random() * 3) // 3, 4 o 5
  const activeUsers = shuffle(FAKE_USER_IDS).slice(0, count)

  // ── Recupera post recenti (ultimi 14 giorni) per like/commenti ────────────
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentPosts } = await supabase
    .from('posts')
    .select('id, user_id, content')
    .gte('created_at', twoWeeksAgo)
    .limit(60)

  // ── Controlla chi ha già postato oggi ─────────────────────────────────────
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { data: todayPosts } = await supabase
    .from('posts')
    .select('user_id')
    .in('user_id', FAKE_USER_IDS)
    .gte('created_at', todayStart.toISOString())

  const alreadyPostedToday = new Set((todayPosts || []).map((p: any) => p.user_id))

  for (const userId of activeUsers) {
    // Ogni utente: 50% post, 30% commento, 20% like
    const roll = Math.random()

    if (roll < 0.50 && !alreadyPostedToday.has(userId)) {
      // ── POST ──────────────────────────────────────────────────────────────
      const content = await pickUnusedPost(supabase, userId)
      if (content) {
        const { error } = await supabase
          .from('posts')
          .insert({ user_id: userId, content, created_at: randomTimestampSinceMidnight() })
        if (!error) {
          await markUsed(supabase, content)
          results.push(`POST [${FAKE_USERS[userId].username}]: "${content.slice(0, 60)}..."`)
        }
      } else {
        results.push(`SKIP POST [${FAKE_USERS[userId].username}]: pool esaurito`)
      }

    } else if (roll < 0.80 && recentPosts && recentPosts.length > 0) {
      // ── COMMENTO ──────────────────────────────────────────────────────────
      const eligible = recentPosts.filter((p: any) => p.user_id !== userId)
      if (eligible.length > 0) {
        const targetPost = pick(eligible)
        const comment = await pickUnusedComment(supabase, targetPost.content || '')
        if (comment) {
          // Il commento appare dopo il post ma sempre nella giornata
          const commentAt = randomTimestampSinceMidnight()
          const { error } = await supabase
            .from('comments')
            .insert({ post_id: targetPost.id, user_id: userId, content: comment, created_at: commentAt })
          if (!error) {
            await markUsed(supabase, comment)
            results.push(`COMMENT [${FAKE_USERS[userId].username}] @ ${commentAt.slice(11, 16)} UTC: "${comment}"`)
          }
        } else {
          results.push(`SKIP COMMENT [${FAKE_USERS[userId].username}]: commenti esauriti`)
        }
      }

    } else if (recentPosts && recentPosts.length > 0) {
      // ── LIKE ──────────────────────────────────────────────────────────────
      const eligible = recentPosts.filter((p: any) => p.user_id !== userId)
      if (eligible.length > 0) {
        const targetPost = pick(eligible)
        const { data: existing } = await supabase
          .from('likes')
          .select('id')
          .eq('user_id', userId)
          .eq('post_id', targetPost.id)
          .maybeSingle()

        if (!existing) {
          const likeAt = randomTimestampSinceMidnight()
          const { error } = await supabase
            .from('likes')
            .insert({ user_id: userId, post_id: targetPost.id, created_at: likeAt })
          if (!error) {
            results.push(`LIKE [${FAKE_USERS[userId].username}] @ ${likeAt.slice(11, 16)} UTC su post ${targetPost.id.slice(-6)}`)
          }
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    active_users: activeUsers.map(id => FAKE_USERS[id].username),
    actions: results.length,
    details: results,
  })
}