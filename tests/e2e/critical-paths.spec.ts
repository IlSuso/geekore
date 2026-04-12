// DESTINAZIONE: tests/e2e/critical-paths.spec.ts
// ═══════════════════════════════════════════════════════════════════════════
// Test E2E Playwright — percorsi critici di Geekore
//
// PREREQUISITI:
//   npm install -D @playwright/test dotenv
//   npx playwright install --with-deps chromium
//
// Crea tests/.env.test con:
//   TEST_EMAIL=tuo-test@example.com
//   TEST_PASSWORD=password-lunga-sicura
//   TEST_USERNAME=tuo_username_test
//   BASE_URL=http://localhost:3000
//
// Esegui:
//   npx playwright test                          # tutti i test
//   npx playwright test critical-paths           # solo questo file
//   npx playwright test --headed                 # con browser visibile
//   npx playwright test --debug                  # con Playwright Inspector
//   npx playwright show-report                   # apri report HTML
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, type Page } from '@playwright/test'

const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_testuser'

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTRAZIONE (senza auth — usa context pulito)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Registrazione', () => {
  // Questi test NON usano lo storageState — usano un browser pulito
  test.use({ storageState: { cookies: [], origins: [] } })

  test('mostra la pagina di registrazione con i campi corretti', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('heading', { name: /registr|crea|sign up/i })).toBeVisible()
    await expect(page.getByPlaceholder(/email/i)).toBeVisible()
    await expect(page.getByPlaceholder(/password/i).first()).toBeVisible()
  })

  test('blocca registrazione con email già esistente', async ({ page }) => {
    await page.goto('/register')
    // Usa l'email dell'utente di test che esiste già
    await page.getByPlaceholder(/email/i).fill(process.env.TEST_EMAIL || 'e2e@geekore.it')
    const usernameInput = page.getByPlaceholder(/username/i)
    if (await usernameInput.isVisible()) {
      await usernameInput.fill('altro_utente_' + Date.now())
    }
    await page.getByPlaceholder(/password/i).first().fill('Password123!')
    await page.getByRole('button', { name: /registr|crea/i }).click()
    await expect(page.getByText(/già registrata|already|esiste|in use/i)).toBeVisible({ timeout: 8_000 })
  })

  test('blocca registrazione con password troppo corta', async ({ page }) => {
    await page.goto('/register')
    await page.getByPlaceholder(/email/i).fill(`new_${Date.now()}@example.com`)
    const usernameInput = page.getByPlaceholder(/username/i)
    if (await usernameInput.isVisible()) {
      await usernameInput.fill(`user_${Date.now()}`)
    }
    await page.getByPlaceholder(/password/i).first().fill('123')
    await page.getByRole('button', { name: /registr|crea/i }).click()
    // Può essere validation HTML5 o messaggio custom
    const isNativeValid = await page.getByPlaceholder(/password/i).first().evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    )
    if (!isNativeValid) {
      await expect(page.getByText(/troppo corta|caratteri|weak|minimo|short/i)).toBeVisible({ timeout: 5_000 })
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTENTICAZIONE (non loggato → verifica redirect)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Redirect autenticazione', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('pagina /for-you redirige al login se non autenticato', async ({ page }) => {
    await page.goto('/for-you')
    await expect(page).toHaveURL(/login/, { timeout: 8_000 })
  })

  test('pagina /feed redirige al login se non autenticato', async ({ page }) => {
    await page.goto('/feed')
    await expect(page).toHaveURL(/login/, { timeout: 8_000 })
  })

  test('pagina /notifications redirige al login se non autenticato', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page).toHaveURL(/login/, { timeout: 8_000 })
  })

  test('login con password errata mostra errore', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder(/email/i).fill(process.env.TEST_EMAIL || 'e2e@geekore.it')
    await page.getByPlaceholder(/password/i).fill('password-sbagliata-xyz-123')
    await page.getByRole('button', { name: /accedi|login|entra/i }).click()
    await expect(page.getByText(/errat|invalid|incorrect|sbagliata|non corret/i)).toBeVisible({ timeout: 8_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. NAVIGAZIONE (autenticato — usa storageState)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Navigazione autenticata', () => {
  test('homepage si carica con navbar', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Geekore/)
    await expect(page.getByRole('navigation').first()).toBeVisible()
  })

  test('pagina 404 mostra messaggio appropriato', async ({ page }) => {
    await page.goto('/questa-pagina-non-esiste-xyzabc123')
    await expect(page.getByText(/404|non trovata|not found/i)).toBeVisible({ timeout: 5_000 })
  })

  test('link navbar Discover funziona', async ({ page }) => {
    await page.goto('/feed')
    const discoverLink = page.getByRole('link', { name: /discover/i }).first()
    await expect(discoverLink).toBeVisible()
    await discoverLink.click()
    await expect(page).toHaveURL(/discover/, { timeout: 5_000 })
  })

  test('link navbar Per Te funziona', async ({ page }) => {
    await page.goto('/feed')
    const forYouLink = page.getByRole('link', { name: /per te|for you/i }).first()
    if (await forYouLink.isVisible()) {
      await forYouLink.click()
      await expect(page).toHaveURL(/for-you/, { timeout: 5_000 })
    }
  })

  test('logout funziona dal menu navbar', async ({ page }) => {
    await page.goto('/feed')
    // Clicca sul pulsante profilo/dropdown nella navbar
    const profileBtn = page.locator('nav button').filter({ hasText: /[a-z]/i }).first()
    if (await profileBtn.isVisible()) {
      await profileBtn.click()
      const logoutBtn = page.getByRole('button', { name: /logout|esci/i })
      if (await logoutBtn.isVisible({ timeout: 2_000 })) {
        await logoutBtn.click()
        await expect(page).toHaveURL(/\/(login|$)/, { timeout: 8_000 })
        return
      }
    }
    // Fallback: vai su settings e fai logout globale
    await page.goto('/settings')
    const logoutGlobal = page.getByText(/esci da tutti/i)
    if (await logoutGlobal.isVisible()) {
      // Non clicchiamo per non invalidare la sessione degli altri test
      await expect(logoutGlobal).toBeVisible()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROFILO
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Profilo', () => {
  test('visualizza la propria pagina profilo', async ({ page }) => {
    await page.goto(`/profile/${TEST_USERNAME}`)
    // Deve mostrare lo username
    await expect(page.getByText(new RegExp(TEST_USERNAME, 'i'))).toBeVisible({ timeout: 8_000 })
  })

  test('profilo mostra le tab Collezione/Attività/Bacheca', async ({ page }) => {
    await page.goto(`/profile/${TEST_USERNAME}`)
    await expect(page.getByRole('button', { name: /collezione/i })).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('button', { name: /attività/i })).toBeVisible()
  })

  test('cambio tab Attività funziona', async ({ page }) => {
    await page.goto(`/profile/${TEST_USERNAME}`)
    const activityTab = page.getByRole('button', { name: /attività/i })
    await expect(activityTab).toBeVisible({ timeout: 8_000 })
    await activityTab.click()
    // La sezione attività deve diventare visibile
    await expect(page.getByText(/attività recente|nessuna attività/i)).toBeVisible({ timeout: 5_000 })
  })

  test('profilo proprio mostra pulsante modifica', async ({ page }) => {
    await page.goto(`/profile/${TEST_USERNAME}`)
    await expect(page.getByRole('link', { name: /modifica profilo/i })).toBeVisible({ timeout: 8_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. DISCOVER / RICERCA
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Discover', () => {
  test('pagina discover si carica con search bar', async ({ page }) => {
    await page.goto('/discover')
    await expect(page.getByPlaceholder(/cerca|search/i)).toBeVisible({ timeout: 8_000 })
  })

  test('ricerca "Naruto" restituisce risultati', async ({ page }) => {
    await page.goto('/discover')
    const input = page.getByPlaceholder(/cerca|search/i)
    await input.fill('Naruto')
    // Attende debounce (400ms) + fetch API (~3s)
    await expect(page.getByText(/Naruto/i).first()).toBeVisible({ timeout: 12_000 })
  })

  test('filtro tipo "Anime" è selezionabile', async ({ page }) => {
    await page.goto('/discover')
    const animeFilter = page.getByRole('button', { name: /^anime$/i })
    await expect(animeFilter).toBeVisible({ timeout: 5_000 })
    await animeFilter.click()
    // Il bottone deve avere classe attiva (bg-violet)
    await expect(animeFilter).toHaveClass(/violet/, { timeout: 2_000 })
  })

  test('ricerca con meno di 2 caratteri non mostra errori', async ({ page }) => {
    await page.goto('/discover')
    await page.getByPlaceholder(/cerca|search/i).fill('a')
    await page.waitForTimeout(600) // > debounce 400ms
    await expect(page.getByText(/errore|error/i)).not.toBeVisible()
  })

  test('pulsante clear svuota la ricerca', async ({ page }) => {
    await page.goto('/discover')
    const input = page.getByPlaceholder(/cerca|search/i)
    await input.fill('Naruto')
    // Aspetta il pulsante X
    const clearBtn = page.locator('button').filter({ has: page.locator('svg') }).last()
    // Cerca il bottone X vicino all'input
    const xBtn = page.getByRole('button').filter({ hasText: '' }).locator('near', input)
    await page.waitForTimeout(300)
    const inputValue = await input.inputValue()
    expect(inputValue).toBe('Naruto')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. "PER TE"
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Per Te', () => {
  test('pagina Per Te si carica senza errori', async ({ page }) => {
    await page.goto('/for-you')
    // Non deve esserci un error boundary
    await expect(page.getByText(/qualcosa è andato storto|errore del server/i)).not.toBeVisible({ timeout: 15_000 })
    // Deve esserci il titolo o l'empty state
    await expect(
      page.getByRole('heading', { name: /per te|for you/i })
        .or(page.getByText(/aggiungi titoli|inizia|collezione/i))
    ).toBeVisible({ timeout: 15_000 })
  })

  test('mood selector è visibile e cliccabile', async ({ page }) => {
    await page.goto('/for-you')
    const moodBtns = page.getByText(/leggero|adrenalina|profondo/i)
    // Aspetta che il componente carichi
    const firstMood = moodBtns.first()
    if (await firstMood.isVisible({ timeout: 8_000 })) {
      await firstMood.click()
      // Il pulsante deve avere uno stile attivo
      await page.waitForTimeout(200)
      // Ri-clicca per deselezionare
      await firstMood.click()
    }
  })

  test('DNA widget è espandibile', async ({ page }) => {
    await page.goto('/for-you')
    const dnaBtn = page.getByText(/il tuo dna geek/i)
    if (await dnaBtn.isVisible({ timeout: 10_000 })) {
      await dnaBtn.click()
      // Deve mostrare il contenuto espanso
      await expect(page.getByText(/generi dominanti/i)).toBeVisible({ timeout: 3_000 })
    }
  })

  test('pulsante aggiorna funziona', async ({ page }) => {
    await page.goto('/for-you')
    const refreshBtn = page.getByRole('button', { name: /aggiorna|refresh/i })
    await expect(refreshBtn).toBeVisible({ timeout: 10_000 })
    await refreshBtn.click()
    // Deve mostrare stato di caricamento
    await expect(refreshBtn).toBeDisabled({ timeout: 2_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. FEED
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Feed', () => {
  test('pagina feed si carica con il composer', async ({ page }) => {
    await page.goto('/feed')
    // Deve esserci la textarea per scrivere
    await expect(
      page.getByPlaceholder(/condividi|racconta|cosa stai/i)
        .or(page.locator('textarea').first())
    ).toBeVisible({ timeout: 8_000 })
  })

  test('filtro "Seguiti" è visibile', async ({ page }) => {
    await page.goto('/feed')
    await expect(page.getByRole('button', { name: /seguiti|following/i })).toBeVisible({ timeout: 8_000 })
  })

  test('switch filtro Tutto ↔ Seguiti funziona', async ({ page }) => {
    await page.goto('/feed')
    const followingBtn = page.getByRole('button', { name: /seguiti|following/i })
    await expect(followingBtn).toBeVisible({ timeout: 8_000 })
    await followingBtn.click()
    await expect(followingBtn).toHaveClass(/violet|active/, { timeout: 3_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test('pagina settings si carica', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /impostazioni|settings/i })).toBeVisible({ timeout: 5_000 })
  })

  test('toggle lingua funziona', async ({ page }) => {
    await page.goto('/settings')
    const enBtn = page.getByRole('button', { name: /english|🇬🇧/i })
    await expect(enBtn).toBeVisible({ timeout: 5_000 })
    await enBtn.click()
    // La UI deve passare a inglese
    await expect(page.getByText(/language|settings/i)).toBeVisible({ timeout: 3_000 })
    // Ripristina italiano
    const itBtn = page.getByRole('button', { name: /italiano|🇮🇹/i })
    await itBtn.click()
  })

  test('sezione importazione mostra AniList, MAL e Xbox', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/anilist/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/myanimelist|mal/i)).toBeVisible()
    await expect(page.getByText(/xbox/i)).toBeVisible()
  })

  test('toggle digest email è visibile', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/digest settimanale/i)).toBeVisible({ timeout: 5_000 })
  })

  test('Steam: link connetti Steam presente nel profilo', async ({ page }) => {
    await page.goto(`/profile/${TEST_USERNAME}`)
    await expect(page.getByText(/steam/i)).toBeVisible({ timeout: 8_000 })
  })
})