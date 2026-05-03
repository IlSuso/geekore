// scripts/visual-audit-screenshots-v2.mjs
// Audit screenshot desktop Geekore: pagine base + stati interattivi con selector più robusti.

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const BASE_URL = (process.env.AUDIT_BASE_URL || 'https://geekore.it').replace(/\/$/, '')
const EMAIL = process.env.AUDIT_EMAIL || ''
const PASSWORD = process.env.AUDIT_PASSWORD || ''
const WIDTH = Number(process.env.AUDIT_WIDTH || 1440)
const HEIGHT = Number(process.env.AUDIT_HEIGHT || 1200)
const HEADFUL = process.env.AUDIT_HEADFUL === '1'
const SLOW_MO = Number(process.env.AUDIT_SLOW_MO || 0)
const CAPTURE_STATES = process.env.AUDIT_CAPTURE_STATES !== '0'

const PUBLIC_ROUTES = [
  ['00_landing', '/'],
  ['01_login', '/login'],
  ['02_register', '/register'],
]

const APP_ROUTES = [
  ['10_home', '/home'],
  ['11_for_you', '/for-you'],
  ['12_library', '/library'],
  ['13_discover', '/discover'],
  ['14_friends', '/friends'],
  ['15_community', '/community'],
  ['16_explore', '/explore'],
  ['17_trending', '/trending'],
  ['18_lists', '/lists'],
  ['19_notifications', '/notifications'],
  ['20_stats_global', '/stats/global'],
  ['21_settings_profile', '/settings/profile'],
  ['22_swipe', '/swipe'],
  ['23_profile_me', '/profile/me'],
]

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

function url(route) {
  return `${BASE_URL}${route}`
}

async function settle(page, ms = 900) {
  await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(ms)
}

async function clickFirst(page, selectors, timeout = 2500) {
  for (const selector of selectors) {
    try {
      const locator = typeof selector === 'string' ? page.locator(selector).first() : selector.first()
      if ((await locator.count()) > 0) {
        await locator.click({ timeout })
        return true
      }
    } catch {}
  }
  return false
}

async function fillFirst(page, selectors, value, timeout = 2500) {
  for (const selector of selectors) {
    try {
      const locator = typeof selector === 'string' ? page.locator(selector).first() : selector.first()
      if ((await locator.count()) > 0) {
        await locator.fill(value, { timeout })
        return true
      }
    } catch {}
  }
  return false
}

async function screenshot(page, outDir, file) {
  await page.screenshot({ path: path.join(outDir, file), fullPage: true })
}

async function capturePage(page, outDir, manifest, name, route) {
  const requestedUrl = url(route)
  const start = Date.now()
  console.log(`→ ${name}: ${requestedUrl}`)
  try {
    await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const file = `${name}.png`
    await screenshot(page, outDir, file)
    manifest.pages.push({
      name,
      path: route,
      requestedUrl,
      finalUrl: page.url(),
      title: await page.title().catch(() => ''),
      screenshot: file,
      ok: true,
      durationMs: Date.now() - start,
    })
  } catch (error) {
    const file = `${name}__ERROR.png`
    await screenshot(page, outDir, file).catch(() => {})
    manifest.pages.push({
      name,
      path: route,
      requestedUrl,
      finalUrl: page.url(),
      screenshot: file,
      ok: false,
      error: String(error?.message || error),
      durationMs: Date.now() - start,
    })
  }
}

async function captureState(page, outDir, manifest, name, run, note = '') {
  console.log(`→ state ${name}`)
  try {
    await run()
    await page.waitForTimeout(800)
    const file = `${name}.png`
    await screenshot(page, outDir, file)
    manifest.states.push({ name: name.replace(/^\d+_state_/, ''), ok: true, screenshot: file, finalUrl: page.url(), note })
  } catch (error) {
    manifest.states.push({ name: name.replace(/^\d+_state_/, ''), ok: false, error: String(error?.message || error), finalUrl: page.url() })
  }
}

async function login(page, manifest) {
  if (!EMAIL || !PASSWORD) {
    manifest.login = { attempted: false, ok: false, reason: 'AUDIT_EMAIL/AUDIT_PASSWORD mancanti.' }
    return false
  }
  try {
    await page.goto(url('/login'), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
    const okEmail = await fillFirst(page, ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]'], EMAIL)
    const okPassword = await fillFirst(page, ['input[type="password"]', 'input[name="password"]', 'input[autocomplete="current-password"]'], PASSWORD)
    if (!okEmail || !okPassword) throw new Error('Input login non trovati')
    const clicked = await clickFirst(page, ['button[type="submit"]', 'button:has-text("Accedi")', 'button:has-text("Login")'])
    if (!clicked) throw new Error('Submit login non trovato')
    await page.waitForURL(current => !current.pathname.startsWith('/login'), { timeout: 30_000 }).catch(() => {})
    await settle(page)
    const ok = !new URL(page.url()).pathname.startsWith('/login')
    manifest.login = { attempted: true, ok, finalUrl: page.url() }
    return ok
  } catch (error) {
    manifest.login = { attempted: true, ok: false, error: String(error?.message || error), finalUrl: page.url() }
    return false
  }
}

async function captureAuthFilledStates(page, outDir, manifest) {
  await captureState(page, outDir, manifest, '92_state_login_filled', async () => {
    await page.goto(url('/login'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    await fillFirst(page, ['input[type="email"]'], 'utente@example.com')
    await fillFirst(page, ['input[type="password"]'], 'PasswordDemo123!')
  }, 'Login compilato')

  await captureState(page, outDir, manifest, '93_state_register_filled', async () => {
    await page.goto(url('/register'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const inputs = page.locator('input')
    if ((await inputs.count()) < 4) throw new Error('Input register insufficienti')
    await inputs.nth(0).fill('Demo Geekore').catch(() => {})
    await inputs.nth(1).fill('demo_geek').catch(() => {})
    await inputs.nth(2).fill('demo@example.com').catch(() => {})
    await inputs.nth(3).fill('PasswordDemo123!').catch(() => {})
  }, 'Register compilato')
}

async function captureInteractiveStates(page, outDir, manifest) {
  if (!CAPTURE_STATES) return

  await captureState(page, outDir, manifest, '80_state_account_menu', async () => {
    await page.goto(url('/home'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, ['button[aria-label="Menu account"]'])
    if (!clicked) throw new Error('Menu account non trovato')
  }, 'Menu account sidebar')

  await captureState(page, outDir, manifest, '81_state_sidebar_search_results', async () => {
    await page.goto(url('/home'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const filled = await fillFirst(page, ['aside input[placeholder*="Cerca utenti"]', 'input[placeholder*="Cerca utenti"]'], 'ed')
    if (!filled) throw new Error('Search sidebar non trovata')
    await page.waitForTimeout(1200)
  }, 'Dropdown ricerca utenti')

  await captureState(page, outDir, manifest, '82_state_home_composer_focus', async () => {
    await page.goto(url('/home'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const selectors = [
      'textarea[placeholder*="Cosa stai guardando"]',
      'input[placeholder*="Cosa stai guardando"]',
      'textarea[placeholder*="guardando"]',
      'input[placeholder*="guardando"]',
      '[contenteditable="true"]',
      'textarea',
    ]
    const filled = await fillFirst(page, selectors, 'Sto provando il composer per audit UI')
    if (!filled) {
      const clicked = await clickFirst(page, ['text=Cosa stai guardando?', 'button:has-text("Cosa stai guardando")', '[role="button"]:has-text("Cosa stai guardando")'])
      if (!clicked) throw new Error('Composer home non trovato')
      await page.waitForTimeout(800)
      await fillFirst(page, selectors, 'Sto provando il composer per audit UI')
    }
  }, 'Composer Home focused/compilato')

  await captureState(page, outDir, manifest, '83_state_media_details_drawer', async () => {
    await page.goto(url('/discover'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, [page.locator('img').nth(1), 'button:has(img)', '[role="button"]:has(img)', 'a[href*="/media"]'], 4000)
    if (!clicked) throw new Error('Media card non trovata')
    await page.waitForTimeout(1500)
  }, 'Drawer media da Discover')

  await captureState(page, outDir, manifest, '84_state_library_grid_view', async () => {
    await page.goto(url('/library'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, ['button[aria-label="Vista grid"]', 'button[aria-label*="grid"]'])
    if (!clicked) throw new Error('Bottone Vista grid non trovato')
  }, 'Library vista griglia')

  await captureState(page, outDir, manifest, '85_state_library_stats_view', async () => {
    await page.goto(url('/library'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, ['button[aria-label="Vista stats"]', 'button[aria-label*="stats"]'])
    if (!clicked) throw new Error('Bottone Vista stats non trovato')
  }, 'Library vista statistiche')

  await captureState(page, outDir, manifest, '86_state_library_select_mode', async () => {
    await page.goto(url('/library'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, ['button:has-text("Seleziona")'])
    if (!clicked) throw new Error('Bottone Seleziona non trovato')
  }, 'Library select mode')

  await captureState(page, outDir, manifest, '87_state_library_media_drawer', async () => {
    await page.goto(url('/library'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, [page.locator('img').first(), 'button:has(img)', '[role="button"]:has(img)'], 4000)
    if (!clicked) throw new Error('Media Library non cliccabile')
    await page.waitForTimeout(1500)
  }, 'Drawer media da Library')

  await captureState(page, outDir, manifest, '88_state_lists_modal', async () => {
    await page.goto(url('/lists'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, ['button:has-text("Nuova")', 'button:has-text("Crea")'])
    if (!clicked) throw new Error('Bottone nuova lista non trovato')
  }, 'Modal nuova lista')

  await captureState(page, outDir, manifest, '89_state_settings_profile_filled', async () => {
    await page.goto(url('/settings/profile'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const filled = await fillFirst(page, ['textarea'], 'Bio temporanea per audit visuale: giochi, anime, film e board game.')
    if (!filled) throw new Error('Textarea bio non trovata')
  }, 'Settings profile compilato')

  await captureState(page, outDir, manifest, '90_state_settings_preferences_flow', async () => {
    await page.goto(url('/settings/profile'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, ['text=Personalizza tutto', 'a:has-text("Personalizza")', 'button:has-text("Personalizza")'])
    if (!clicked) throw new Error('CTA Personalizza non trovata')
    await page.waitForTimeout(1200)
  }, 'Flow personalizzazione gusti da Settings')

  await captureState(page, outDir, manifest, '91_state_swipe_after_action', async () => {
    await page.goto(url('/swipe'), { waitUntil: 'domcontentloaded' })
    await settle(page)
    const clicked = await clickFirst(page, ['button[aria-label*="like"]', 'button[aria-label*="visto"]', 'button:has-text("✓")', 'button:has(svg)'], 2500)
    if (!clicked) throw new Error('Controllo Swipe non trovato')
  }, 'Swipe dopo interazione')
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
    manifest.pageErrors = manifest.pageErrors || []
    manifest.pageErrors.push(String(error?.message || error))
  })

  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) {
      manifest.console = manifest.console || []
      manifest.console.push({ type: msg.type(), text: msg.text().slice(0, 500), url: page.url() })
    }
  })

  try {
    for (const [name, route] of PUBLIC_ROUTES) await capturePage(page, outDir, manifest, name, route)
    await captureAuthFilledStates(page, outDir, manifest)
    const loggedIn = await login(page, manifest)
    for (const [name, route] of APP_ROUTES) await capturePage(page, outDir, manifest, name, route)
    if (loggedIn) await captureInteractiveStates(page, outDir, manifest)
  } finally {
    await browser.close()
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log(`\nScreenshot salvati in: ${outDir}`)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
