// DESTINAZIONE: tests/global-setup.ts
// Eseguito una volta prima di tutti i test.
// Crea (o riusa) l'utente di test e salva il cookie di autenticazione
// in tests/.auth/user.json — tutti i test lo riusano senza dover fare login.
//
// Legge le variabili da tests/.env.test (non committare questo file).

import { chromium, type FullConfig } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Carica tests/.env.test se esiste
const envPath = path.resolve(__dirname, '.env.test')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_EMAIL = process.env.TEST_EMAIL || 'e2e@geekore.it'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'GeekoreE2E2024!'
const AUTH_FILE = path.resolve(__dirname, '.auth/user.json')

export default async function globalSetup(config: FullConfig) {
  // Crea la cartella .auth se non esiste
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  // Se il file di auth esiste già ed è recente (< 1 ora), riusalo
  if (fs.existsSync(AUTH_FILE)) {
    const stat = fs.statSync(AUTH_FILE)
    const ageMs = Date.now() - stat.mtimeMs
    if (ageMs < 60 * 60 * 1000) {
      console.log('[setup] Riuso sessione esistente (< 1 ora)')
      return
    }
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    // Tenta login
    await page.goto(`${BASE_URL}/login`)
    await page.locator('input[type="email"]').fill(TEST_EMAIL)
    await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /accedi|login|entra/i }).click()

    // Aspetta redirect post-login (max 15s)
    await page.waitForURL(/\/(feed|for-you|discover|profile)/, { timeout: 15_000 })

    console.log(`[setup] Login riuscito come ${TEST_EMAIL}`)
  } catch {
    // Se il login fallisce, prova a registrarsi
    console.log(`[setup] Login fallito — provo registrazione...`)
    await page.goto(`${BASE_URL}/register`)

    try {
      await page.locator('input[type="email"]').fill(TEST_EMAIL)
      const usernameInput = page.getByPlaceholder(/username/i)
      if (await usernameInput.isVisible()) {
        await usernameInput.fill(process.env.TEST_USERNAME || 'e2e_testuser')
      }
      await page.locator('input[type="password"]').first().fill(TEST_PASSWORD)
      await page.getByRole('button', { name: /registr|crea/i }).click()
      await page.waitForURL(/\/(onboarding|feed|for-you)/, { timeout: 15_000 })
      console.log(`[setup] Registrazione riuscita`)
    } catch (regErr) {
      console.error('[setup] Impossibile creare utente di test:', regErr)
      console.warn('[setup] I test che richiedono auth potrebbero fallire')
    }
  }

  // Salva stato autenticazione
  await page.context().storageState({ path: AUTH_FILE })
  console.log(`[setup] Sessione salvata in ${AUTH_FILE}`)

  await browser.close()
}