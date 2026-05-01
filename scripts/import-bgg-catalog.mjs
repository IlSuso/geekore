#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const args = new Map(
  process.argv.slice(2).map(arg => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    return [key, value]
  })
)

const csvPath = process.argv.slice(2).find(arg => !arg.startsWith('--'))
const limit = Number(args.get('limit') || 1000)
const delayMs = Number(args.get('delay') || 5500)
const batchSize = 20

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const bggBearerToken = process.env.BGG_BEARER_TOKEN

if (!csvPath || !supabaseUrl || !serviceKey) {
  console.error('Usage: node scripts/import-bgg-catalog.mjs ./bg_ranks.csv --limit=1000 --delay=5500')
  console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

const bggHeaders = {
  'User-Agent': 'Geekore/1.0 (geekore.it)',
  ...(bggBearerToken ? { Authorization: `Bearer ${bggBearerToken}` } : {}),
}

if (!bggBearerToken) {
  console.warn('[bgg-catalog] BGG_BEARER_TOKEN missing: CSV rows will import, but XML enrichment may return 401.')
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i++
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(cell)
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRankRows(csv) {
  const [headers, ...rows] = parseCsv(csv)
  const normalized = headers.map(normalizeHeader)
  const indexOf = (...names) => normalized.findIndex(header => names.includes(header))
  const idIdx = indexOf('id', 'objectid', 'thingid', 'bggid', 'gameid')
  const titleIdx = indexOf('name', 'title')
  const rankIdx = indexOf('rank', 'boardgamerank')
  const ratingIdx = indexOf('averagerating', 'average', 'avg rating', 'avg')
  const usersIdx = indexOf('usersrated', 'usersrating', 'numratings', 'ratings')
  const yearIdx = indexOf('yearpublished', 'year')

  if (idIdx < 0 || titleIdx < 0) {
    throw new Error(`CSV headers not recognized: ${headers.join(', ')}`)
  }

  return rows
    .map(row => ({
      bgg_id: asNumber(row[idIdx]),
      title: row[titleIdx]?.trim(),
      rank: rankIdx >= 0 ? asNumber(row[rankIdx]) : null,
      average_rating: ratingIdx >= 0 ? asNumber(row[ratingIdx]) : null,
      users_rated: usersIdx >= 0 ? asNumber(row[usersIdx]) : null,
      year_published: yearIdx >= 0 ? asNumber(row[yearIdx]) : null,
    }))
    .filter(row => row.bgg_id && row.title)
    .sort((a, b) => (a.rank || 999999) - (b.rank || 999999))
    .slice(0, limit)
}

function valuesFor(chunk, type) {
  const re = new RegExp(`<link[^>]*type="${type}"[^>]*value="([^"]*)"`, 'g')
  const values = []
  let match
  while ((match = re.exec(chunk)) !== null) {
    if (match[1] !== '(Uncredited)') values.push(match[1])
  }
  return [...new Set(values)]
}

function valueFor(chunk, tag) {
  return chunk.match(new RegExp(`<${tag}[^>]*value="([^"]*)"`))?.[1]
}

function textFor(chunk, tag) {
  return chunk.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]
}

function cleanDescription(value) {
  if (!value) return null
  return value
    .replace(/&#10;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, 600) || null
}

function parseThingXml(xml, baseRows) {
  const byId = new Map(baseRows.map(row => [String(row.bgg_id), row]))
  const parsed = []
  const itemRe = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRe.exec(xml)) !== null) {
    const chunk = match[0]
    const id = chunk.match(/\bid="(\d+)"/)?.[1]
    const base = id ? byId.get(id) : null
    if (!id || !base) continue

    parsed.push({
      ...base,
      year_published: asNumber(valueFor(chunk, 'yearpublished')) ?? base.year_published,
      average_rating: asNumber(valueFor(chunk, 'average')) ?? base.average_rating,
      users_rated: asNumber(valueFor(chunk, 'usersrated')) ?? base.users_rated,
      rank: asNumber(chunk.match(/<rank[^>]*name="boardgame"[^>]*value="(\d+)"/)?.[1]) ?? base.rank,
      categories: valuesFor(chunk, 'boardgamecategory'),
      mechanics: valuesFor(chunk, 'boardgamemechanic'),
      designers: valuesFor(chunk, 'boardgamedesigner').slice(0, 8),
      image_url: textFor(chunk, 'image') || null,
      thumbnail_url: textFor(chunk, 'thumbnail') || null,
      min_players: asNumber(valueFor(chunk, 'minplayers')),
      max_players: asNumber(valueFor(chunk, 'maxplayers')),
      playing_time: asNumber(valueFor(chunk, 'playingtime')),
      complexity: asNumber(valueFor(chunk, 'averageweight')),
      description: cleanDescription(textFor(chunk, 'description')),
      last_enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }
  return parsed
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function upsertRows(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from('bgg_catalog').upsert(chunk, { onConflict: 'bgg_id' })
    if (error) throw error
  }
}

const csv = await fs.readFile(path.resolve(csvPath), 'utf8')
const rankRows = parseRankRows(csv)
console.log(`[bgg-catalog] Parsed ${rankRows.length} rank rows`)

let enrichedCount = 0
for (let i = 0; i < rankRows.length; i += batchSize) {
  const batch = rankRows.slice(i, i + batchSize)
  const ids = batch.map(row => row.bgg_id).join(',')
  const res = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`, {
    headers: bggHeaders,
  })
  if (!res.ok) {
    console.warn(`[bgg-catalog] BGG batch failed ${res.status}, ids=${ids}`)
    await upsertRows(batch)
  } else {
    const xml = await res.text()
    const enriched = parseThingXml(xml, batch)
    await upsertRows(enriched.length > 0 ? enriched : batch)
    enrichedCount += enriched.length
  }
  console.log(`[bgg-catalog] ${Math.min(i + batch.length, rankRows.length)}/${rankRows.length} imported`)
  if (i + batchSize < rankRows.length) await sleep(delayMs)
}

console.log(`[bgg-catalog] Done. Enriched ${enrichedCount}/${rankRows.length} rows`)
