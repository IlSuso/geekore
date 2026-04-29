import { translateWithCache } from '@/lib/deepl'
import { truncateAtSentence } from '@/lib/utils'
import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { applyFormatDiversity, getCurrentAnimeSeasonDates, isAwardWorthy, releaseFreshnessMult, runtimePenalty } from './scoring'
import { BGG_TO_CROSS_GENRE, CROSS_TO_BGG_CATEGORY, CROSS_TO_IGDB_GENRE, CROSS_TO_IGDB_THEME, IGDB_VALID_GENRES, TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP } from './genre-maps'
import { BGG_CATEGORY_SEED_IDS } from './bgg-seeds'
async function fetchBGGHotList(headers: HeadersInit): Promise<string[]> {
  try {
    const res = await fetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', {
      headers, signal: AbortSignal.timeout(8000), next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const idRe = /<item[^>]*id="(\d+)"/g
    const ids: string[] = []
    let m
    while ((m = idRe.exec(xml)) !== null) ids.push(m[1])
    return ids
  } catch { return [] }
}

export async function fetchBoardgameRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile,
  isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>
): Promise<Recommendation[]> {
  const BGG_BASE = 'https://boardgamegeek.com/xmlapi2'
  const bggHeaders: HeadersInit = {
    'User-Agent': 'Geekore/1.0 (geekore.it)',
    ...(process.env.BGG_BEARER_TOKEN ? { Authorization: `Bearer ${process.env.BGG_BEARER_TOKEN}` } : {}),
  }
  const BGG_MIN_YEAR = 1990  // includi classici moderni dal '90
  const BGG_MAX_RANK = 2500  // amplia pool a top 2500 per titoli di nicchia

  // ── Step 1: raccogli ID pool in parallelo ────────────────────────────────
  const activeSlots = slots.slice(0, 12)  // più slot per pool più vario
  const seedIds = new Set<string>()
  for (const slot of activeSlots) {
    const seeds = BGG_CATEGORY_SEED_IDS[slot.genre] || BGG_CATEGORY_SEED_IDS['Strategy'] || []
    for (const id of seeds) seedIds.add(id)
  }
  const hotIds = await fetchBGGHotList(bggHeaders)

  // Fetch top BGG per rank (pagine 1 e 2 = top ~200 titoli oggettivamente buoni)
  // Integra seed ID fissi con titoli che il ranking BGG promuove organicamente
  const topRankedIds = await (async () => {
    try {
      const pages = await Promise.all([1, 2, 3].map(page =>
        fetch(`${BGG_BASE}/search?query=&type=boardgame&page=${page}`, {
          headers: bggHeaders, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
        }).then(r => r.ok ? r.text() : '').catch(() => '')
      ))
      const ids: string[] = []
      for (const xml of pages) {
        const re = /<item[^>]*id="(\d+)"/g; let m
        while ((m = re.exec(xml)) !== null) ids.push(m[1])
      }
      return ids
    } catch { return [] as string[] }
  })()

  const allIds = [...new Set([...hotIds, ...topRankedIds, ...seedIds])]
  if (allIds.length === 0) return []

  // ── Step 2: fetch dettagli in batch paralleli da 20 ──────────────────────
  const batches: string[][] = []
  for (let i = 0; i < allIds.length; i += 20) batches.push(allIds.slice(i, i + 20))

  const batchXmls = await Promise.all(batches.map(async (batch) => {
    try {
      const res = await fetch(`${BGG_BASE}/thing?id=${batch.join(',')}&stats=1`, {
        headers: bggHeaders, signal: AbortSignal.timeout(12000), next: { revalidate: 3600 },
      })
      return res.ok ? res.text() : ''
    } catch { return '' }
  }))

  // ── Step 3: parse, filtra, scoringa ──────────────────────────────────────
  const results: Recommendation[] = []
  const seen = new Set<string>()

  for (const thingXml of batchXmls) {
    if (!thingXml) continue
    const itemRe = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
    let m
    while ((m = itemRe.exec(thingXml)) !== null) {
      const chunk = m[0]
      const idM = chunk.match(/\bid="(\d+)"/)
      if (!idM) continue
      const recId = `bgg-${idM[1]}`
      if (seen.has(recId) || shownIds?.has(recId)) continue
      if (isAlreadyOwned('boardgame', recId, '')) continue

      const nameM = chunk.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/)
      if (!nameM) continue
      const title = nameM[1].trim()

      // Filtro rank: solo top 1000
      const rankM = chunk.match(/<rank[^>]*name="boardgame"[^>]*value="(\d+)"/)
      const bggRank = rankM ? parseInt(rankM[1]) : undefined
      if (bggRank !== undefined && bggRank > BGG_MAX_RANK) continue

      // Filtro anno: solo dal 2005
      const yearM = chunk.match(/<yearpublished[^>]*value="(\d+)"/)
      const year = yearM ? parseInt(yearM[1]) : undefined
      if (year !== undefined && year < BGG_MIN_YEAR) continue

      // Cover full-res, fallback thumbnail
      const image = (chunk.match(/<image>([^<]+)<\/image>/) || [])[1]?.trim()
      const thumbnail = (chunk.match(/<thumbnail>([^<]+)<\/thumbnail>/) || [])[1]?.trim()
      const cover = image || thumbnail
      if (!cover || cover.length < 10) continue

      const rawDesc = (chunk.match(/<description>([^<]*)<\/description>/) || [])[1] || ''
      const description = rawDesc
        .replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '')
        .replace(/<[^>]+>/g, '').trim().slice(0, 300) || undefined

      const catRe = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/g
      const categories: string[] = []
      let cm
      while ((cm = catRe.exec(chunk)) !== null) categories.push(cm[1])
      const mechRe = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]*)"/g
      const mechanics: string[] = []
      while ((cm = mechRe.exec(chunk)) !== null) mechanics.push(cm[1])
      const designerRe = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/g
      const designers: string[] = []
      while ((cm = designerRe.exec(chunk)) !== null) {
        if (cm[1] !== '(Uncredited)') designers.push(cm[1])
      }

      const ratingM = chunk.match(/<average[^>]*value="([\d.]+)"/)
      const bggScore = ratingM ? parseFloat(ratingM[1]) : undefined
      if (bggScore !== undefined && bggScore < 5.8) continue

      const minpM = chunk.match(/<minplayers[^>]*value="(\d+)"/)
      const maxpM = chunk.match(/<maxplayers[^>]*value="(\d+)"/)
      const timeM = chunk.match(/<playingtime[^>]*value="(\d+)"/)
      const weightM = chunk.match(/<averageweight[^>]*value="([\d.]+)"/)

      const crossGenres = new Set<string>()
      for (const cat of categories) {
        crossGenres.add(cat)
        const mapped = BGG_TO_CROSS_GENRE[cat]
        if (mapped) for (const cg of mapped) crossGenres.add(cg)
      }
      const recGenres = [...crossGenres]

      const matchScore = computeMatchScore(recGenres, mechanics, tasteProfile, [], [])
      if (matchScore < 3) continue  // soglia minima per pool master ampio — filtra solo titoli totalmente fuori gusto

      const bestSlot = activeSlots.find(s =>
        (BGG_CATEGORY_SEED_IDS[s.genre] || []).includes(idM[1]) ||
        categories.some(c => c.toLowerCase().includes(s.genre.toLowerCase()))
      ) || activeSlots[0]

      let finalScore = matchScore
      const ratingCountM = chunk.match(/<usersrated[^>]*value="(\d+)"/)
      const ratingCount = ratingCountM ? parseInt(ratingCountM[1]) : 0
      if (bggScore !== undefined && bggScore >= 7.5 && ratingCount >= 500) {
        finalScore = Math.min(100, finalScore + 8)
      }
      if (bggRank !== undefined) {
        // Anti-overhype: i titoli arcinoti (top 30) ottengono un bonus ridotto
        // per lasciare spazio a gemme di nicchia nella top 100-800
        if (bggRank <= 30) finalScore = Math.min(100, finalScore + 2)
        else if (bggRank <= 100) finalScore = Math.min(100, finalScore + 5)
        else if (bggRank <= 300) finalScore = Math.min(100, finalScore + 4)  // hidden gem bonus
        else if (bggRank <= 800) finalScore = Math.min(100, finalScore + 2)
      }
      finalScore = Math.min(100, Math.round(finalScore * releaseFreshnessMult(year)))
      if (finalScore < 40) continue

      seen.add(recId)
      results.push({
        id: recId, title, type: 'boardgame', coverImage: cover, year,
        genres: categories.length > 0 ? categories : recGenres,
        score: bggScore !== undefined ? Math.round((bggScore / 2) * 10) / 10 : undefined,
        description,
        why: buildWhyV3(recGenres, recId, title, tasteProfile, matchScore, bestSlot.isDiscovery, {}),
        matchScore: finalScore,
        isDiscovery: bestSlot.isDiscovery,
        isAwardWinner: bggScore !== undefined && bggScore >= 7.5 && ratingCount >= 500,
        min_players: minpM ? parseInt(minpM[1]) : undefined,
        max_players: maxpM ? parseInt(maxpM[1]) : undefined,
        playing_time: timeM ? parseInt(timeM[1]) : undefined,
        complexity: weightM ? Math.round(parseFloat(weightM[1]) * 10) / 10 : undefined,
        mechanics: mechanics.slice(0, 8),
        designers: designers.slice(0, 3),
      } as any)
    }
  }

  // Traduci le descrizioni in italiano (stesso pattern di manga e videogiochi)
  const bgDescItems = results
    .filter(r => r.description)
    .map(r => ({ id: `bgg:${r.id}`, text: r.description! }))
  if (bgDescItems.length > 0) {
    const t = await translateWithCache(bgDescItems)
    results.forEach(r => { if (r.description) r.description = t[`bgg:${r.id}`] || r.description })
  }

  // ── TOP-UP BGG: se il pool è sotto 200, usa ID supplementari per rank ────
  // Strategia corretta: BGG XMLAPIv2 non ha browse per rank.
  // Usiamo una lista estesa di ID BGG top 500-2500 noti, non ancora nei seed,
  // e li fetchiamo in batch filtrando per affinità crossmediale.
  // NOTA: search?query=boardgame è errata (cerca titolo "boardgame", non browse).
  // search?query=&type=boardgame è già usata nel loop principale (pag 1-3).
  const BGG_POOL_TARGET = 200
  if (results.length < BGG_POOL_TARGET) {
    // ID supplementari: giochi BGG top 300-2500 non già presenti nei seed per categoria.
    // Selezionati da BGG top list per rappresentare generi vari con alta qualità.
    const BGG_EXTENDED_IDS = [
      // Top 100-300 BGG (mix generi: war, party, cooperative, abstract, family)
      '12333','68448','9209','148228','9625','35424','3232','40692','2651','4098',
      '13','171','822','30549','3076','476','9217','31260','25613','110327',
      '37111','70323','25643','45','532','147020','136888','148949','177590',
      '159675','193458','227966','162886','176494','180263','187425','189643',
      '191189','197574','199792','200680','205059','209685','213900','215312',
      '218417','218603','219513','220308','221107','224517','228939','229853',
      '230689','230802','231571','232717','233078','234669','236457','237182',
      '238690','241464','242302','246784','246900','251247','253344','254640',
      '256916','258779','261537','262203','262543','262712','264220','266192',
      '266524','270844','271320','271324','281549','284083','285645','285967',
      '291041','291457','291572','293006','295947','296720','301217','305096',
      '306723','311031','311885','316377','316554','317985','322289','329081',
      '329082','329669','332241','332686','336986','342942','350184','351913',
      '354986','357563','366013','372782','225694','199478','218419','354018',
      // Top 300-800 BGG meno mainstream ma con alta affinità potenziale
      '163412','163967','164928','166669','167355','168786','170216','171231',
      '171668','172386','174430','175640','176396','177188','178020','179976',
      '180263','182028','183394','185785','187096','187227','188803','190296',
      '191189','192291','193460','195856','196652','197807','199042','200048',
      '201706','203993','205637','206941','208983','210253','211088','212427',
      '214977','216754','217861','220451','221533','222765','224694','226320',
      '228504','230231','231893','233253','234451','238691','240980','242705',
      '244711','248134','249530','251730','253284','255683','256680','258779',
      '261393','262874','265688','266192','268084','270642','273607','278266',
      '280096','281596','283948','286096','287954','289474','292457','294096',
    ]
    // Filtra ID già visti nel loop principale
    const unseenExtendedIds = BGG_EXTENDED_IDS.filter(id => !seen.has(`bgg-${id}`))
    // Fetch in batch da 20 ID (limite BGG consigliato)
    const extBatches: string[][] = []
    for (let i = 0; i < unseenExtendedIds.length; i += 20) extBatches.push(unseenExtendedIds.slice(i, i + 20))

    for (const batch of extBatches) {
      if (results.length >= BGG_POOL_TARGET) break
      try {
        const detailXml = await fetch(
          `${BGG_BASE}/thing?id=${batch.join(',')}&stats=1`,
          { headers: bggHeaders, signal: AbortSignal.timeout(12000), next: { revalidate: 3600 } }
        ).then(r => r.ok ? r.text() : '').catch(() => '')
        if (!detailXml) continue

        // Tutto il resto è identico al loop principale: stesso parsing, stesse soglie, stessa logica di score
        const itemRe2 = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
        let m2
        while ((m2 = itemRe2.exec(detailXml)) !== null) {
          if (results.length >= BGG_POOL_TARGET) break
          const chunk = m2[0]
          const idM2 = chunk.match(/\bid="(\d+)"/)
          if (!idM2) continue
          const recId = `bgg-${idM2[1]}`
          if (seen.has(recId) || shownIds?.has(recId)) continue
          if (isAlreadyOwned('boardgame', recId, '')) continue

          const nameM2 = chunk.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/)
          if (!nameM2) continue

          const rankM2 = chunk.match(/<rank[^>]*name="boardgame"[^>]*value="(\d+)"/)
          const bggRank2 = rankM2 ? parseInt(rankM2[1]) : undefined
          if (bggRank2 !== undefined && bggRank2 > BGG_MAX_RANK) continue

          const yearM2 = chunk.match(/<yearpublished[^>]*value="(\d+)"/)
          const year2 = yearM2 ? parseInt(yearM2[1]) : undefined
          if (year2 !== undefined && year2 < BGG_MIN_YEAR) continue

          const image2 = (chunk.match(/<image>([^<]+)<\/image>/) || [])[1]?.trim()
          const thumbnail2 = (chunk.match(/<thumbnail>([^<]+)<\/thumbnail>/) || [])[1]?.trim()
          const cover2 = image2 || thumbnail2
          if (!cover2 || cover2.length < 10) continue

          const ratingM2 = chunk.match(/<average[^>]*value="([\d.]+)"/)
          const bggScore2 = ratingM2 ? parseFloat(ratingM2[1]) : undefined
          if (bggScore2 !== undefined && bggScore2 < 5.8) continue

          const catRe2 = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/g
          const categories2: string[] = []; let cm2
          while ((cm2 = catRe2.exec(chunk)) !== null) categories2.push(cm2[1])
          const mechRe2 = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]*)"/g
          const mechanics2: string[] = []
          while ((cm2 = mechRe2.exec(chunk)) !== null) mechanics2.push(cm2[1])

          const crossGenres2 = new Set<string>()
          for (const cat of categories2) {
            crossGenres2.add(cat)
            const mapped = BGG_TO_CROSS_GENRE[cat]
            if (mapped) for (const cg of mapped) crossGenres2.add(cg)
          }
          const recGenres2 = [...crossGenres2]
          // computeMatchScore usa globalGenres (tutti i media) → profilo crossmediale
          const matchScore2 = computeMatchScore(recGenres2, mechanics2, tasteProfile, [], [])
          if (matchScore2 < 3) continue  // stessa soglia del loop principale

          const rawDesc2 = (chunk.match(/<description>([^<]*)<\/description>/) || [])[1] || ''
          const description2 = rawDesc2
            .replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '')
            .replace(/<[^>]+>/g, '').trim().slice(0, 300) || undefined

          const ratingCountM2 = chunk.match(/<usersrated[^>]*value="(\d+)"/)
          const ratingCount2 = ratingCountM2 ? parseInt(ratingCountM2[1]) : 0
          let finalScore2 = matchScore2
          if (bggScore2 !== undefined && bggScore2 >= 7.5 && ratingCount2 >= 500) finalScore2 = Math.min(100, finalScore2 + 8)
          if (bggRank2 !== undefined) {
            if (bggRank2 <= 30) finalScore2 = Math.min(100, finalScore2 + 2)
            else if (bggRank2 <= 100) finalScore2 = Math.min(100, finalScore2 + 5)
            else if (bggRank2 <= 300) finalScore2 = Math.min(100, finalScore2 + 4)
            else if (bggRank2 <= 800) finalScore2 = Math.min(100, finalScore2 + 2)
          }
          finalScore2 = Math.min(100, Math.round(finalScore2 * releaseFreshnessMult(year2)))
          if (finalScore2 < 40) continue  // stessa soglia del loop principale

          const minpM2 = chunk.match(/<minplayers[^>]*value="(\d+)"/)
          const maxpM2 = chunk.match(/<maxplayers[^>]*value="(\d+)"/)
          const timeM2 = chunk.match(/<playingtime[^>]*value="(\d+)"/)
          const weightM2 = chunk.match(/<averageweight[^>]*value="([\d.]+)"/)
          const designerRe2 = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/g
          const designers2: string[] = []
          while ((cm2 = designerRe2.exec(chunk)) !== null) {
            if (cm2[1] !== '(Uncredited)') designers2.push(cm2[1])
          }

          seen.add(recId)
          results.push({
            id: recId, title: nameM2[1].trim(), type: 'boardgame', coverImage: cover2, year: year2,
            genres: categories2.length > 0 ? categories2 : recGenres2,
            score: bggScore2 !== undefined ? Math.round((bggScore2 / 2) * 10) / 10 : undefined,
            description: description2,
            why: buildWhyV3(recGenres2, recId, nameM2[1].trim(), tasteProfile, matchScore2, false, {}),
            matchScore: finalScore2,
            isAwardWinner: bggScore2 !== undefined && bggScore2 >= 7.5 && ratingCount2 >= 500,
            min_players: minpM2 ? parseInt(minpM2[1]) : undefined,
            max_players: maxpM2 ? parseInt(maxpM2[1]) : undefined,
            playing_time: timeM2 ? parseInt(timeM2[1]) : undefined,
            complexity: weightM2 ? Math.round(parseFloat(weightM2[1]) * 10) / 10 : undefined,
            mechanics: mechanics2.slice(0, 8),
            designers: designers2.slice(0, 3),
          } as any)
        }
      } catch { /* continua con batch successivo */ }
    }

    // Fallback: se ancora sotto target, usa search?query=&type=boardgame pagine 4+
    // (query vuota = tutti i boardgame BGG, ordinati alfabeticamente — non ideale ma funziona)
    if (results.length < BGG_POOL_TARGET) {
      let topUpPage = 4
      const MAX_BGG_TOPUP_PAGES = 12
      while (results.length < BGG_POOL_TARGET && topUpPage <= MAX_BGG_TOPUP_PAGES) {
        try {
          const searchXml = await fetch(
            `${BGG_BASE}/search?query=&type=boardgame&page=${topUpPage}`,
            { headers: bggHeaders, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
          ).then(r => r.ok ? r.text() : '').catch(() => '')

        const pageIds: string[] = []
        const re = /<item[^>]*id="(\d+)"/g; let mi
        while ((mi = re.exec(searchXml)) !== null) {
          if (!seen.has(`bgg-${mi[1]}`)) pageIds.push(mi[1])
        }
        if (pageIds.length === 0) break

        // Fetcha dettagli per questi ID
        const detailXml = await fetch(
          `${BGG_BASE}/thing?id=${pageIds.join(',')}&stats=1`,
          { headers: bggHeaders, signal: AbortSignal.timeout(12000), next: { revalidate: 3600 } }
        ).then(r => r.ok ? r.text() : '').catch(() => '')

        if (!detailXml) { topUpPage++; continue }

        const itemRe2 = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
        let m2
        while ((m2 = itemRe2.exec(detailXml)) !== null) {
          if (results.length >= BGG_POOL_TARGET) break
          const chunk = m2[0]
          const idM2 = chunk.match(/\bid="(\d+)"/)
          if (!idM2) continue
          const recId = `bgg-${idM2[1]}`
          if (seen.has(recId) || shownIds?.has(recId)) continue
          if (isAlreadyOwned('boardgame', recId, '')) continue

          const nameM2 = chunk.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/)
          if (!nameM2) continue

          const rankM2 = chunk.match(/<rank[^>]*name="boardgame"[^>]*value="(\d+)"/)
          const bggRank2 = rankM2 ? parseInt(rankM2[1]) : undefined
          if (bggRank2 !== undefined && bggRank2 > BGG_MAX_RANK) continue

          const yearM2 = chunk.match(/<yearpublished[^>]*value="(\d+)"/)
          const year2 = yearM2 ? parseInt(yearM2[1]) : undefined
          if (year2 !== undefined && year2 < BGG_MIN_YEAR) continue

          const image2 = (chunk.match(/<image>([^<]+)<\/image>/) || [])[1]?.trim()
          const thumbnail2 = (chunk.match(/<thumbnail>([^<]+)<\/thumbnail>/) || [])[1]?.trim()
          const cover2 = image2 || thumbnail2
          if (!cover2 || cover2.length < 10) continue

          const ratingM2 = chunk.match(/<average[^>]*value="([\d.]+)"/)
          const bggScore2 = ratingM2 ? parseFloat(ratingM2[1]) : undefined
          if (bggScore2 !== undefined && bggScore2 < 5.8) continue

          const catRe2 = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/g
          const categories2: string[] = []; let cm2
          while ((cm2 = catRe2.exec(chunk)) !== null) categories2.push(cm2[1])
          const mechRe2 = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]*)"/g
          const mechanics2: string[] = []
          while ((cm2 = mechRe2.exec(chunk)) !== null) mechanics2.push(cm2[1])

          const crossGenres2 = new Set<string>()
          for (const cat of categories2) {
            crossGenres2.add(cat)
            const mapped = BGG_TO_CROSS_GENRE[cat]
            if (mapped) for (const cg of mapped) crossGenres2.add(cg)
          }
          const recGenres2 = [...crossGenres2]
          const matchScore2 = computeMatchScore(recGenres2, mechanics2, tasteProfile, [], [])
          if (matchScore2 < 3) continue  // stessa soglia minima del loop principale

          const rawDesc2 = (chunk.match(/<description>([^<]*)<\/description>/) || [])[1] || ''
          const description2 = rawDesc2
            .replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '')
            .replace(/<[^>]+>/g, '').trim().slice(0, 300) || undefined

          const ratingCountM2 = chunk.match(/<usersrated[^>]*value="(\d+)"/)
          const ratingCount2 = ratingCountM2 ? parseInt(ratingCountM2[1]) : 0
          let finalScore2 = matchScore2
          if (bggScore2 !== undefined && bggScore2 >= 7.5 && ratingCount2 >= 500) finalScore2 = Math.min(100, finalScore2 + 8)
          if (bggRank2 !== undefined) {
            if (bggRank2 <= 30) finalScore2 = Math.min(100, finalScore2 + 2)
            else if (bggRank2 <= 100) finalScore2 = Math.min(100, finalScore2 + 5)
            else if (bggRank2 <= 300) finalScore2 = Math.min(100, finalScore2 + 4)
            else if (bggRank2 <= 800) finalScore2 = Math.min(100, finalScore2 + 2)
          }
          finalScore2 = Math.min(100, Math.round(finalScore2 * releaseFreshnessMult(year2)))
          if (finalScore2 < 40) continue  // stessa soglia del loop principale

          const minpM2 = chunk.match(/<minplayers[^>]*value="(\d+)"/)
          const maxpM2 = chunk.match(/<maxplayers[^>]*value="(\d+)"/)
          const timeM2 = chunk.match(/<playingtime[^>]*value="(\d+)"/)
          const weightM2 = chunk.match(/<averageweight[^>]*value="([\d.]+)"/)
          const designerRe2 = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/g
          const designers2: string[] = []
          while ((cm2 = designerRe2.exec(chunk)) !== null) {
            if (cm2[1] !== '(Uncredited)') designers2.push(cm2[1])
          }

          seen.add(recId)
          results.push({
            id: recId, title: nameM2[1].trim(), type: 'boardgame', coverImage: cover2, year: year2,
            genres: categories2.length > 0 ? categories2 : recGenres2,
            score: bggScore2 !== undefined ? Math.round((bggScore2 / 2) * 10) / 10 : undefined,
            description: description2,
            why: buildWhyV3(recGenres2, recId, nameM2[1].trim(), tasteProfile, matchScore2, false, {}),
            matchScore: finalScore2,
            isAwardWinner: bggScore2 !== undefined && bggScore2 >= 7.5 && ratingCount2 >= 500,
            min_players: minpM2 ? parseInt(minpM2[1]) : undefined,
            max_players: maxpM2 ? parseInt(maxpM2[1]) : undefined,
            playing_time: timeM2 ? parseInt(timeM2[1]) : undefined,
            complexity: weightM2 ? Math.round(parseFloat(weightM2[1]) * 10) / 10 : undefined,
            mechanics: mechanics2.slice(0, 8),
            designers: designers2.slice(0, 3),
          } as any)
        }
      } catch { /* continua */ }
      topUpPage++
    }
  }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Handler principale V6 — Pool-based recommendations ───────────────────────
//
// NOVITÀ V6:
//   • Bacino (pool) persistente per tipo (~80 titoli), salvato in recommendations_pool
//   • Il pool viene rigenerato solo se: scaduto (24h) O collezione cambiata O forceRefresh
//   • Ad ogni GET si pesca randomicamente dal pool (shuffle + slice), evitando solo
//     i titoli mostrati nella SESSIONE CORRENTE (non nelle ultime 2 settimane)
//   • recommendations_shown ora traccia solo la sessione corrente (TTL: 4h)
//   • Il bacino non si riduce mai: ogni refresh mostra un sottoinsieme diverso
//     dello stesso pool ampio, ruotando i contenuti senza escluderli definitivamente
// ─────────────────────────────────────────────────────────────────────────────

