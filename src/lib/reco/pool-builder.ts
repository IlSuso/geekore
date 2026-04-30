// src/lib/reco/pool-builder.ts
// ═══════════════════════════════════════════════════════════════════════════
// POOL BUILDER — Sistema a 4 tier ispirato a Netflix/Spotify
//
// Il pool di 200 titoli per tipo non è piatto — è strutturato in 4 bucket
// con proporzioni dinamiche basate sulla solidità del profilo utente.
//
// TIER 1 — CORE (60% default):
//   Titoli ad alta affinità con il profilo. matchScore ≥ 65.
//   Sono le raccomandazioni "sicure" — l'utente le vede e pensa "sì, esatto".
//
// TIER 2 — STRETCH (20% default):
//   Affinità media ma qualità oggettiva alta. matchScore 45-65 + qualità ≥ soglia alta.
//   Titoli ottimi che l'algoritmo non conosce ancora bene per quel profilo.
//   Es: un utente che ama Drama ma ha pochi manga → manga Drama top-rated.
//
// TIER 3 — CROSS-MEDIA TRANSFER (10% default):
//   Generi forti dell'utente in ALTRI tipi trasferiti a questo tipo.
//   Es: ama film Sci-Fi → anime/manga Sci-Fi anche senza averli mai toccati.
//   Solo titoli di qualità alta per non deludere sulla "scommessa cross-media".
//
// TIER 4 — QUALITY WILDCARDS (10% default):
//   Capolavori oggettivi indipendentemente dall'affinità calcolata.
//   AniList ≥ 82, TMDB ≥ 8.0. Safety net per profili deboli e nuovi utenti.
//
// PROFILO DEBOLE (< 15 titoli o pochi rating per tipo):
//   CORE 30% / WILDCARD 40% / STRETCH 20% / TRANSFER 10%
//   → Netflix-style cold start: qualità assoluta come proxy del gusto mancante.
// ═══════════════════════════════════════════════════════════════════════════

import type { Recommendation, TasteProfile } from './types'
import type { MediaType } from './engine-types'
import { ADJACENCY_GRAPH } from './genre-maps'

export interface PoolTierConfig {
  coreRatio: number      // 0-1
  stretchRatio: number
  transferRatio: number
  wildcardRatio: number
}

export interface QualityGates {
  // Soglie per Tier 1 (core match)
  coreMinScore: number        // matchScore minimo
  coreMinQuality: number      // AniList score o TMDB voteAvg normalizzato 0-100

  // Soglie per Tier 2 (stretch — affinità media ma alta qualità)
  stretchMinScore: number     // matchScore minimo (più basso del core)
  stretchMinQuality: number   // qualità oggettiva più alta

  // Soglie per Tier 3 (transfer cross-media)
  transferMinQuality: number  // solo titoli buoni per la scommessa cross-media

  // Soglie per Tier 4 (wildcard assoluti)
  wildcardMinQuality: number  // capolavori oggettivi
}

// Soglie qualità per tipo — normalizzate su scala 0-100
// AniList usa già 0-100. TMDB vote_average viene moltiplicato × 10.
const QUALITY_GATES: Record<MediaType, QualityGates> = {
  anime: {
    coreMinScore: 62,    stretchMinScore: 42,
    coreMinQuality: 62,  stretchMinQuality: 72,
    transferMinQuality: 70, wildcardMinQuality: 82,
  },
  manga: {
    coreMinScore: 55,    stretchMinScore: 38,   // soglie più basse: profilo manga spesso debole
    coreMinQuality: 60,  stretchMinQuality: 70,
    transferMinQuality: 68, wildcardMinQuality: 80,
  },
  movie: {
    coreMinScore: 62,    stretchMinScore: 42,
    coreMinQuality: 65,  stretchMinQuality: 72,
    transferMinQuality: 70, wildcardMinQuality: 80,
  },
  tv: {
    coreMinScore: 62,    stretchMinScore: 42,
    coreMinQuality: 65,  stretchMinQuality: 72,
    transferMinQuality: 70, wildcardMinQuality: 80,
  },
  game: {
    coreMinScore: 60,    stretchMinScore: 40,
    coreMinQuality: 60,  stretchMinQuality: 70,
    transferMinQuality: 68, wildcardMinQuality: 78,
  },
  boardgame: {
    coreMinScore: 50,    stretchMinScore: 35,   // BGG ha meno dati → più permissivo
    coreMinQuality: 60,  stretchMinQuality: 68,
    transferMinQuality: 65, wildcardMinQuality: 75,
  },
}

// Determina la solidità del profilo per un tipo specifico
// Restituisce 0 (nessun dato) → 1 (profilo solido)
function profileStrength(tasteProfile: TasteProfile, type: MediaType): number {
  const typeCount = tasteProfile.collectionSize[type] || 0
  const typeGenres = tasteProfile.topGenres[type] || []

  if (typeCount === 0) return 0
  if (typeCount < 5) return 0.2
  if (typeCount < 15) return 0.4

  // Controlla quanti titoli hanno segnali di rating forti (score > 1 nel profilo)
  // Un profilo con 186 anime non votati è più debole di uno con 30 anime votati
  const strongSignals = typeGenres.filter(g => g.score > 5).length
  if (typeCount >= 30 && strongSignals < 3) return 0.5  // molti titoli, pochi segnali forti
  if (typeCount < 30) return 0.6
  return Math.min(1, 0.6 + (strongSignals / 20) * 0.4)
}

// Calcola proporzioni tier in base alla solidità del profilo
// Profilo debole → più wildcard (Netflix cold-start)
// Profilo solido → più core
export function computeTierRatios(strength: number): PoolTierConfig {
  if (strength <= 0.2) {
    return { coreRatio: 0.25, stretchRatio: 0.20, transferRatio: 0.15, wildcardRatio: 0.40 }
  }
  if (strength <= 0.4) {
    return { coreRatio: 0.35, stretchRatio: 0.22, transferRatio: 0.13, wildcardRatio: 0.30 }
  }
  if (strength <= 0.6) {
    return { coreRatio: 0.45, stretchRatio: 0.22, transferRatio: 0.13, wildcardRatio: 0.20 }
  }
  if (strength <= 0.8) {
    return { coreRatio: 0.55, stretchRatio: 0.20, transferRatio: 0.12, wildcardRatio: 0.13 }
  }
  return { coreRatio: 0.60, stretchRatio: 0.20, transferRatio: 0.10, wildcardRatio: 0.10 }
}

// Estrae il quality score normalizzato 0-100 da una Recommendation
// Usa il campo score (già normalizzato 0-5 nei fetcher) × 20
export function getQualityScore(rec: Recommendation): number {
  if (rec.score == null) return 55  // default neutro se mancante
  return Math.min(100, rec.score * 20)
}

// Identifica se un titolo è un "cross-media transfer" rispetto al tipo corrente
// ovvero se i suoi generi matchano il profilo dell'utente in ALTRI tipi
function isCrossMediaTransfer(
  rec: Recommendation,
  type: MediaType,
  tasteProfile: TasteProfile
): boolean {
  const recGenres = new Set(rec.genres)
  // Generi forti in altri tipi (non quello corrente)
  const otherTypeGenres = new Set<string>()
  for (const [t, genres] of Object.entries(tasteProfile.topGenres)) {
    if (t === type) continue
    for (const g of genres.slice(0, 5)) {
      otherTypeGenres.add(g.genre)
    }
  }
  // Transfer se almeno un genere è forte in un altro tipo
  // ma il tipo corrente ha un profilo debole su quel genere
  const typeGenreNames = new Set((tasteProfile.topGenres[type] || []).map(g => g.genre))
  for (const g of recGenres) {
    if (otherTypeGenres.has(g) && !typeGenreNames.has(g)) return true
  }
  return false
}

// Identifica se un titolo è adiacente al profilo (per lo stretch tier)
// Usa l'ADJACENCY_GRAPH: generi vicini a quelli del profilo ma non nel profilo top
function isAdjacentStretch(
  rec: Recommendation,
  tasteProfile: TasteProfile
): boolean {
  const topGenreNames = new Set(tasteProfile.globalGenres.slice(0, 6).map(g => g.genre))
  const recGenres = rec.genres || []

  for (const g of recGenres) {
    if (topGenreNames.has(g)) return false  // è già nel core, non è stretch
  }

  // Controlla se qualche genere della rec è adiacente a un top genre
  for (const topGenre of topGenreNames) {
    const adjacent = ADJACENCY_GRAPH[topGenre] || []
    for (const adj of adjacent) {
      if (recGenres.includes(adj)) return true
    }
  }
  return false
}

export interface BuildPoolResult {
  items: Recommendation[]
  diagnostics: {
    tierCounts: { core: number; stretch: number; transfer: number; wildcard: number }
    profileStrength: number
    ratios: PoolTierConfig
    adaptiveThresholds: { core: number; stretch: number }
  }
}

// Calcola soglie adattive basate sulla distribuzione reale dei matchScore dei candidati.
// Se il profilo è debole e i candidati hanno punteggi bassi, le soglie si adattano
// invece di restare fisse e lasciare il Core vuoto.
function computeAdaptiveThresholds(
  candidates: Recommendation[],
  gates: QualityGates,
  strength: number
): { coreMin: number; stretchMin: number } {
  if (candidates.length === 0) return { coreMin: gates.coreMinScore, stretchMin: gates.stretchMinScore }

  const scores = candidates.map(r => r.matchScore).sort((a, b) => b - a)
  const p70 = scores[Math.floor(scores.length * 0.30)] || 0  // 70° percentile
  const p45 = scores[Math.floor(scores.length * 0.55)] || 0  // 45° percentile

  // La soglia core è il massimo tra:
  // - la soglia fissa gates (qualità minima assoluta)
  // - il 70° percentile adattato alla strength (profilo debole → percentile più basso)
  const adaptiveCoreMin = strength >= 0.8
    ? Math.max(gates.coreMinScore, p70)
    : strength >= 0.6
    ? Math.max(gates.coreMinScore * 0.85, p70 * 0.9)
    : Math.max(gates.coreMinScore * 0.70, p70 * 0.80)

  const adaptiveStretchMin = Math.max(gates.stretchMinScore * 0.75, p45 * 0.75)

  return {
    coreMin: Math.round(Math.min(adaptiveCoreMin, 75)),   // cap a 75 per non essere impossibili
    stretchMin: Math.round(Math.min(adaptiveStretchMin, 50)),
  }
}

// Funzione principale: prende tutti i candidati dai fetcher e li distribuisce nei 4 tier
export function buildTieredPool(
  candidates: Recommendation[],
  type: MediaType,
  tasteProfile: TasteProfile,
  targetSize = 200
): BuildPoolResult {
  const gates = QUALITY_GATES[type]
  const strength = profileStrength(tasteProfile, type)
  const ratios = computeTierRatios(strength)
  const { coreMin, stretchMin } = computeAdaptiveThresholds(candidates, gates, strength)

  const coreTarget    = Math.round(targetSize * ratios.coreRatio)
  const stretchTarget = Math.round(targetSize * ratios.stretchRatio)
  const transferTarget = Math.round(targetSize * ratios.transferRatio)
  const wildcardTarget = targetSize - coreTarget - stretchTarget - transferTarget

  const seen = new Set<string>()

  // ── Tier 4: Quality Wildcards ─────────────────────────────────────────────
  // Capolavori oggettivi indipendentemente dall'affinità calcolata.
  // Questi esistono per il cold-start e per la serendipità di qualità.
  const wildcards = candidates
    .filter(r => getQualityScore(r) >= gates.wildcardMinQuality && !seen.has(r.id))
    .sort((a, b) => getQualityScore(b) - getQualityScore(a))
  const wildcardPicked = weightedSample(wildcards, wildcardTarget, 'quality', seen)
  wildcardPicked.forEach(r => seen.add(r.id))

  // ── Tier 3: Cross-Media Transfer ──────────────────────────────────────────
  const transfers = candidates
    .filter(r =>
      getQualityScore(r) >= gates.transferMinQuality &&
      isCrossMediaTransfer(r, type, tasteProfile) &&
      !seen.has(r.id)
    )
    .sort((a, b) => (getQualityScore(b) + b.matchScore) - (getQualityScore(a) + a.matchScore))
  const transferPicked = weightedSample(transfers, transferTarget, 'balanced', seen)
  transferPicked.forEach(r => seen.add(r.id))

  // ── Tier 2: Adjacent Stretch ──────────────────────────────────────────────
  const stretches = candidates
    .filter(r =>
      r.matchScore >= stretchMin &&
      r.matchScore < coreMin &&
      getQualityScore(r) >= gates.stretchMinQuality &&
      !seen.has(r.id)
    )
    .sort((a, b) => (getQualityScore(b) * 0.6 + b.matchScore * 0.4) - (getQualityScore(a) * 0.6 + a.matchScore * 0.4))
  const stretchPicked = weightedSample(stretches, stretchTarget, 'balanced', seen)
  stretchPicked.forEach(r => seen.add(r.id))

  // ── Tier 1: Core Match ────────────────────────────────────────────────────
  const cores = candidates
    .filter(r => r.matchScore >= coreMin && !seen.has(r.id))
    .sort((a, b) => (b.matchScore * 0.75 + getQualityScore(b) * 0.25) - (a.matchScore * 0.75 + getQualityScore(a) * 0.25))
  const corePicked = weightedSample(cores, coreTarget, 'affinity', seen)
  corePicked.forEach(r => seen.add(r.id))

  // ── Backfill: se i tier non coprono il target, riempie con candidati rimanenti ──
  // Mantiene sempre una soglia qualità minima — non entra mai spazzatura.
  const allPicked = [...corePicked, ...stretchPicked, ...transferPicked, ...wildcardPicked]

  if (allPicked.length < targetSize) {
    // Soglia minima assoluta: score >= 50 (AniList 50/100, TMDB 5.0/10)
    // equivalente a "almeno decente" — non capolavori ma nemmeno titoli brutti
    const absoluteMinQuality = 50
    const remaining = candidates
      .filter(r => !seen.has(r.id) && getQualityScore(r) >= absoluteMinQuality)
      .sort((a, b) => (b.matchScore * 0.5 + getQualityScore(b) * 0.5) - (a.matchScore * 0.5 + getQualityScore(a) * 0.5))

    for (const r of remaining) {
      if (allPicked.length >= targetSize) break
      allPicked.push(r)
      seen.add(r.id)
    }
  }

  // Segna i tier per debugging e per il sampler
  corePicked.forEach(r => { (r as any)._tier = 'core' })
  stretchPicked.forEach(r => { (r as any)._tier = 'stretch'; r.isDiscovery = true })
  transferPicked.forEach(r => { (r as any)._tier = 'transfer'; r.isDiscovery = true })
  wildcardPicked.forEach(r => { (r as any)._tier = 'wildcard'; r.isSerendipity = true })

  return {
    items: allPicked.sort((a, b) => b.matchScore - a.matchScore),
    diagnostics: {
      tierCounts: {
        core: corePicked.length,
        stretch: stretchPicked.length,
        transfer: transferPicked.length,
        wildcard: wildcardPicked.length,
      },
      profileStrength: strength,
      ratios,
      adaptiveThresholds: { core: coreMin, stretch: stretchMin },
    },
  }
}

// Campionamento pesato con diversità di genere
// mode: 'affinity' = peso matchScore, 'quality' = peso qualità oggettiva, 'balanced' = mix
function weightedSample(
  candidates: Recommendation[],
  count: number,
  mode: 'affinity' | 'quality' | 'balanced',
  alreadySeen: Set<string>
): Recommendation[] {
  if (candidates.length === 0 || count === 0) return []

  const result: Recommendation[] = []
  const remaining = candidates.filter(r => !alreadySeen.has(r.id))
  const genreCounts: Record<string, number> = {}

  while (result.length < count && remaining.length > 0) {
    // Calcola peso per ogni candidato
    const weights = remaining.map(r => {
      const q = getQualityScore(r)
      let w = mode === 'affinity'
        ? r.matchScore * 0.75 + q * 0.25
        : mode === 'quality'
        ? q * 0.75 + r.matchScore * 0.25
        : r.matchScore * 0.5 + q * 0.5

      // Penalità diversità genere: evita troppi titoli dello stesso genere primario
      const primaryGenre = r.genres?.[0]
      if (primaryGenre) {
        const count = genreCounts[primaryGenre] || 0
        if (count >= 4) w *= 0.15
        else if (count >= 2) w *= 0.55
      }

      // Boost per award winner e continuity
      if (r.isAwardWinner) w *= 1.15
      if (r.isContinuity) w *= 1.25

      // Piccola randomizzazione per varietà (±15%)
      w *= 0.85 + Math.random() * 0.30

      return Math.max(0, w)
    })

    const total = weights.reduce((s, w) => s + w, 0)
    if (total === 0) break

    // Selezione roulette wheel
    let ticket = Math.random() * total
    let chosen = -1
    for (let i = 0; i < weights.length; i++) {
      ticket -= weights[i]
      if (ticket <= 0) { chosen = i; break }
    }
    if (chosen < 0) chosen = remaining.length - 1

    const picked = remaining[chosen]
    result.push(picked)
    remaining.splice(chosen, 1)

    const pg = picked.genres?.[0]
    if (pg) genreCounts[pg] = (genreCounts[pg] || 0) + 1
  }

  return result
}
