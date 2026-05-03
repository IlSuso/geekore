// scripts/visual-audit-screenshots.mjs
// Genera screenshot desktop full-page per audit grafico Geekore.
// Uso:
//   AUDIT_BASE_URL=https://geekore.it AUDIT_EMAIL="demo@geekore.it" AUDIT_PASSWORD="password" npm run audit:screenshots
// Output:
//   audit-screenshots/<timestamp>/*.png
//   audit-screenshots/<timestamp>/manifest.json

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const BASE_URL = (process.env.AUDIT_BASE_URL || 'https://geekore.it').replace(/\/$/, '')
const EMAIL = process.env.AUDIT_EMAIL || ''
const PASSWORD = process.env.AUDIT_PASSWORD || ''
const HEADFUL = process.env.AUDIT_HEADFUL === '1'
const SLOW_MO = Number(process.env.AUDIT_SLOW_MO || 0)
const WIDTH = Number(process.env.AUDIT_WIDTH || 1440)
const HEIGHT = Number(process.env.AUDIT_HEIGHT || 1200)

const PUBLIC_ROUTES = [
  { name: '00_landing', path: '/' },
  { name: '01_login', path: '/login' },
  { name: '02_register', path: '/register' },
]

const APP_ROUTES = [
  { name: '10_home', path: '/home' },
  { name: '11_for_you', path: '/for-you' },
  { name: '12_library', path: '/library' },
  { name: '13_discover', path: '/discover' },
  { name: '14_friends', path: '/friends' },
  { name: '15_community', path: '/community' },
  { name: '16_explore', path: '/explore' },
  { name: '17_trending', path: '/trending' },
  { name: '18_lists', path: '/lists' },
  { name: '19_notifications', path: '/notifications' },
  { name: '20_stats_global', path: '/stats/global' },
  { name: '21_settings_profile', path: '/settings/profile' },
  { name: '22_swipe', path: '/swipe' },
  { name: '23_profile_me', path: '/profile/me' },
]

const EXTRA_ROUTES = (process.env.AUDIT_EXTRA_ROUTES || '')
  .split(',')
  .map(route => route.trim())
  .filter(Boolean)
  .map((route, index) => ({
    name: `90_extra_${String(index + 1).padStart(2, '0')}_${safeName(route)}`,
    path: route.startsWith('/') ? route : `/${route}`,
  }))

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

function safeName(value) {
  return value
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'route'
}

function routeUrl(routePath) {
  return `${BASE_URL}${routePath}`
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

async function screenshotRoute(page, outDir, route, manifest) {
  const url = routeUrl(route.path)
  const startedAt = Date.now()

  console.log(`→ ${route.name}: ${url}`)

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)

    const finalUrl = page.url()
    const title = await page.title().catch(() => '')
    const file = `${route.name}.png`
    const filePath = path.join(outDir, file)

    await page.screenshot({ path: filePath, fullPage: true })

    manifest.pages.push({
      name: route.name,
      path: route.path,
      requestedUrl: url,
      finalUrl,
      title,
      screenshot: file,
      ok: true,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    const file = `${route.name}__ERROR.png`
    const filePath = path.join(outDir, file)
    await page.screenshot({ path: filePath, fullPage: true }).catch(() => {})

    manifest.pages.push({
      name: route.name,
      path: route.path,
      requestedUrl: url,
      finalUrl: page.url(),
      screenshot: fs.existsSync(filePath) ? file : null,
      ok: false,
      error: String(error?.message || error),
      durationMs: Date.now() - startedAt,
    })

    console.error(`  ERRORE ${route.name}: ${String(error?.message || error)}`)
  }
}

async function login(page, manifest) {
  if (!EMAIL || !PASSWORD) {
    manifest.login = {
      attempted: false,
      ok: false,
      reason: 'AUDIT_EMAIL e/o AUDIT_PASSWORD mancanti: verranno catturate solo le pagine raggiungibili senza sessione.',
    }
    return false
  }

  console.log('→ Login demo')

  try {
    await page.goto(routeUrl('/login'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)

    const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first()
    const passwordInput = page.locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]').first()

    await emailInput.waitFor({ state: 'visible', timeout: 20_000 })
    await passwordInput.waitFor({ state: 'visible', timeout: 20_000 })

    await emailInput.fill(EMAIL)
    await passwordInput.fill(PASSWORD)

    const submit = page.locator('button[type="submit"], button:has-text("Accedi"), button:has-text("Login"), button:has-text("Entra")').first()
    await submit.click()

    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30_000 }).catch(() => {})
    await settle(page)

    const finalUrl = page.url()
    const ok = !new URL(finalUrl).pathname.startsWith('/login')

    manifest.login = {
      attempted: true,
      ok,
      finalUrl,
      note: ok ? 'Login apparentemente riuscito.' : 'Login forse fallito: la pagina è rimasta su /login.',
    }

    return ok
  } catch (error) {
    manifest.login = {
      attempted: true,
      ok: false,
      error: String(error?.message || error),
      finalUrl: page.url(),
    }
    console.error(`  ERRORE login: ${String(error?.message || error)}`)
    return false
  }
}

async function captureCommonStates(page, outDir, manifest) {
  const states = []

  // Modal nuova lista, utile per vedere overlay/form/dialog desktop.
  try {
    await page.goto(routeUrl('/lists'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const newListButton = page.locator('button:has-text("Nuova"), button:has-text("Crea")').first()
    if (await newListButton.count()) {
      await newListButton.click()
      await page.waitForTimeout(700)
      const file = '80_state_lists_modal.png'
      await page.screenshot({ path: path.join(outDir, file), fullPage: true })
      states.push({ name: 'lists_modal', ok: true, screenshot: file })
    }
  } catch (error) {
    states.push({ name: 'lists_modal', ok: false, error: String(error?.message || error) })
  }

  manifest.states = states
}

async function main() {
  const runId = timestamp()
  const outDir = path.join(process.cwd(), 'audit-screenshots', runId)
  fs.mkdirSync(outDir, { recursive: true })

  const manifest = {
    runId,
    baseUrl: BASE_URL,
    viewport: { width: WIDTH, height: HEIGHT },
    createdAt: new Date().toISOString(),
    pages: [],
    states: [],
  }

  const browser = await chromium.launch({ headless: !HEADFUL, slowMo: SLOW_MO })
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'it-IT',
  })
  const page = await context.newPage()

  page.on('pageerror', error => {
    manifest.pagesErrors = manifest.pagesErrors || []
    manifest.pagesErrors.push(String(error?.message || error))
  })

  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) {
      manifest.console = manifest.console || []
      manifest.console.push({ type: msg.type(), text: msg.text().slice(0, 500) })
    }
  })

  try {
    for (const route of PUBLIC_ROUTES) {
      await screenshotRoute(page, outDir, route, manifest)
    }

    const loggedIn = await login(page, manifest)

    const routesToCapture = loggedIn
      ? [...APP_ROUTES, ...EXTRA_ROUTES]
      : [...APP_ROUTES, ...EXTRA_ROUTES]

    for (const route of routesToCapture) {
      await screenshotRoute(page, outDir, route, manifest)
    }

    if (loggedIn) {
      await captureCommonStates(page, outDir, manifest)
    }
  } finally {
    await browser.close()
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log(`\nScreenshot salvati in: ${outDir}`)
    console.log('Carica qui la cartella zippata per farmi fare audit grafico pagina per pagina.')
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
