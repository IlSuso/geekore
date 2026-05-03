// scripts/visual-audit-screenshots.mjs
// Genera screenshot desktop full-page per audit grafico Geekore.
// Include pagine principali + stati interattivi: modal, drawer, menu, dropdown, viste alternative.
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
const CAPTURE_STATES = process.env.AUDIT_CAPTURE_STATES !== '0'

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

async function softSettle(page, ms = 700) {
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(ms)
}

async function safeClick(locator, timeout = 2500) {
  try {
    if (await locator.count() === 0) return false
    await locator.first().click({ timeout })
    return true
  } catch {
    return false
  }
}

async function safeFill(locator, value, timeout = 2500) {
  try {
    if (await locator.count() === 0) return false
    await locator.first().fill(value, { timeout })
    return true
  } catch {
    return false
  }
}

async function saveState(page, outDir, manifest, name, note = '') {
  const file = `${name}.png`
  await page.screenshot({ path: path.join(outDir, file), fullPage: true })
  manifest.states.push({
    name: name.replace(/^\d+_state_/, ''),
    ok: true,
    screenshot: file,
    finalUrl: page.url(),
    note,
  })
  console.log(`  ✓ state ${file}`)
}

async function recordStateError(manifest, name, error) {
  manifest.states.push({
    name: name.replace(/^\d+_state_/, ''),
    ok: false,
    error: String(error?.message || error),
  })
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

async function captureAccountMenuState(page, outDir, manifest) {
  const state = '80_state_account_menu'
  try {
    await page.goto(routeUrl('/home'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const opened = await safeClick(page.locator('button[aria-label="Menu account"], button:has-text("@")').first())
    if (!opened) throw new Error('Account menu trigger non trovato')
    await softSettle(page)
    await saveState(page, outDir, manifest, state, 'Menu account sidebar aperto')
  } catch (error) {
    await recordStateError(manifest, state, error)
  }
}

async function captureSidebarSearchState(page, outDir, manifest) {
  const state = '81_state_sidebar_search_results'
  try {
    await page.goto(routeUrl('/home'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const filled = await safeFill(page.locator('aside input[placeholder*="Cerca utenti"], input[placeholder*="Cerca utenti"]').first(), 'ed')
    if (!filled) throw new Error('Search sidebar non trovata')
    await page.waitForTimeout(1000)
    await saveState(page, outDir, manifest, state, 'Dropdown risultati ricerca utenti sidebar')
  } catch (error) {
    await recordStateError(manifest, state, error)
  }
}

async function captureHomeComposerState(page, outDir, manifest) {
  const state = '82_state_home_composer_focus'
  try {
    await page.goto(routeUrl('/home'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const composer = page.locator('textarea, input[placeholder*="guardando"], input[placeholder*="pensando"], [contenteditable="true"]').first()
    const filled = await safeFill(composer, 'Sto provando il composer per audit UI')
    if (!filled) throw new Error('Composer home non trovato')
    await softSettle(page)
    await saveState(page, outDir, manifest, state, 'Composer Home compilato/focused')
  } catch (error) {
    await recordStateError(manifest, state, error)
  }
}

async function captureMediaDrawerState(page, outDir, manifest) {
  const state = '83_state_media_details_drawer'
  try {
    await page.goto(routeUrl('/discover'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const clicked = await safeClick(page.locator('img').nth(1), 3000)
      || await safeClick(page.locator('a[href*="/media"], button:has(img), [role="button"]:has(img)').first(), 3000)
    if (!clicked) throw new Error('Media card/poster cliccabile non trovato')
    await page.waitForTimeout(1500)
    await saveState(page, outDir, manifest, state, 'Drawer/dettaglio media aperto da Discover')
  } catch (error) {
    await recordStateError(manifest, state, error)
  }
}

async function captureLibraryStates(page, outDir, manifest) {
  try {
    await page.goto(routeUrl('/library'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)

    const gridClicked = await safeClick(page.locator('button[aria-label="Vista grid"], button:has(svg)').nth(1))
    if (gridClicked) {
      await softSettle(page)
      await saveState(page, outDir, manifest, '84_state_library_grid_view', 'Library vista griglia')
    }

    const statsClicked = await safeClick(page.locator('button[aria-label="Vista stats"], button:has(svg)').nth(2))
    if (statsClicked) {
      await softSettle(page)
      await saveState(page, outDir, manifest, '85_state_library_stats_view', 'Library vista statistiche')
    }

    await page.goto(routeUrl('/library'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const selectClicked = await safeClick(page.locator('button:has-text("Seleziona")').first())
    if (selectClicked) {
      await softSettle(page)
      await saveState(page, outDir, manifest, '86_state_library_select_mode', 'Library modalità selezione multipla')
    }

    await page.goto(routeUrl('/library'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const firstRowClicked = await safeClick(page.locator('img').first(), 3000)
      || await safeClick(page.locator('[role="button"]:has(img), button:has(img)').first(), 3000)
    if (firstRowClicked) {
      await page.waitForTimeout(1500)
      await saveState(page, outDir, manifest, '87_state_library_media_drawer', 'Drawer media aperto da Library')
    }
  } catch (error) {
    await recordStateError(manifest, '84_87_state_library_states', error)
  }
}

async function captureListsModalState(page, outDir, manifest) {
  const state = '88_state_lists_modal'
  try {
    await page.goto(routeUrl('/lists'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const newListButton = page.locator('button:has-text("Nuova"), button:has-text("Crea")').first()
    if (await newListButton.count()) {
      await newListButton.click()
      await page.waitForTimeout(700)
      await saveState(page, outDir, manifest, state, 'Modal nuova lista')
    } else {
      throw new Error('Bottone nuova lista non trovato')
    }
  } catch (error) {
    await recordStateError(manifest, state, error)
  }
}

async function captureSettingsStates(page, outDir, manifest) {
  try {
    await page.goto(routeUrl('/settings/profile'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)

    const bio = page.locator('textarea').first()
    const filled = await safeFill(bio, 'Bio temporanea per audit visuale: giochi, anime, film e board game.')
    if (filled) {
      await softSettle(page)
      await saveState(page, outDir, manifest, '89_state_settings_profile_filled', 'Settings profile con textarea compilata')
    }

    const personalizeClicked = await safeClick(page.locator('text=Personalizza tutto').first())
    if (personalizeClicked) {
      await page.waitForTimeout(1200)
      await saveState(page, outDir, manifest, '90_state_settings_preferences_modal_or_page', 'Personalizza gusti/preferenze aperto')
    }
  } catch (error) {
    await recordStateError(manifest, '89_90_state_settings_states', error)
  }
}

async function captureSwipeStates(page, outDir, manifest) {
  try {
    await page.goto(routeUrl('/swipe'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)

    const ratingClicked = await safeClick(page.locator('button:has(svg), [role="button"]').filter({ hasText: '' }).nth(3), 2000)
    if (ratingClicked) {
      await softSettle(page)
      await saveState(page, outDir, manifest, '91_state_swipe_after_action', 'Swipe dopo interazione su controlli')
    }
  } catch (error) {
    await recordStateError(manifest, '91_state_swipe_after_action', error)
  }
}

async function captureAuthInteractiveStates(page, outDir, manifest) {
  try {
    await page.goto(routeUrl('/login'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    await safeFill(page.locator('input[type="email"]').first(), 'utente@example.com')
    await safeFill(page.locator('input[type="password"]').first(), 'password-demo')
    await softSettle(page)
    await saveState(page, outDir, manifest, '92_state_login_filled', 'Login compilato')

    await page.goto(routeUrl('/register'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const inputs = page.locator('input')
    if (await inputs.count() >= 4) {
      await inputs.nth(0).fill('Demo Geekore').catch(() => {})
      await inputs.nth(1).fill('demo_geek').catch(() => {})
      await inputs.nth(2).fill('demo@example.com').catch(() => {})
      await inputs.nth(3).fill('PasswordDemo123!').catch(() => {})
      await softSettle(page)
      await saveState(page, outDir, manifest, '93_state_register_filled', 'Register compilato')
    }
  } catch (error) {
    await recordStateError(manifest, '92_93_state_auth_filled', error)
  }
}

async function captureCommonStates(page, outDir, manifest) {
  if (!CAPTURE_STATES) {
    manifest.states.push({ name: 'states_disabled', ok: true, note: 'AUDIT_CAPTURE_STATES=0' })
    return
  }

  console.log('→ Stati interattivi')

  await captureAccountMenuState(page, outDir, manifest)
  await captureSidebarSearchState(page, outDir, manifest)
  await captureHomeComposerState(page, outDir, manifest)
  await captureMediaDrawerState(page, outDir, manifest)
  await captureLibraryStates(page, outDir, manifest)
  await captureListsModalState(page, outDir, manifest)
  await captureSettingsStates(page, outDir, manifest)
  await captureSwipeStates(page, outDir, manifest)
}

async function main() {
  const runId = timestamp()
  const outDir = path.join(process.cwd(), 'audit-screenshots', runId)
  fs.mkdirSync(outDir, { recursive: true })

  const manifest = {
    runId,
    baseUrl: BASE_URL,
    viewport: { width: WIDTH, height: HEIGHT },
    captureStates: CAPTURE_STATES,
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

    await captureAuthInteractiveStates(page, outDir, manifest)

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
