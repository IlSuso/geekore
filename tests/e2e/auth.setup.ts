// DESTINAZIONE: tests/e2e/auth.setup.ts
// Progetto "setup" di Playwright — viene eseguito prima di chromium e mobile-safari.
// Salva il cookie di sessione in tests/.auth/user.json.
// Tutti gli altri test lo riusano tramite storageState in playwright.config.ts.

import { test as setup, expect } from '@playwright/test'
import path from 'path'

const AUTH_FILE = path.resolve(__dirname, '../.auth/user.json')

const TEST_EMAIL = process.env.TEST_EMAIL || 'e2e@geekore.it'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'GeekoreE2E2024!'

setup('autenticazione utente di test', async ({ page }) => {
  await page.goto('/login')

  await page.locator('input[type="email"]').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: /accedi|login|entra/i }).click()

  // Aspetta che il login vada a buon fine
  await expect(page).toHaveURL(/\/(feed|for-you|discover|profile)/, { timeout: 15_000 })

  // Salva la sessione
  await page.context().storageState({ path: AUTH_FILE })
})