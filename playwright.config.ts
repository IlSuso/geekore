// DESTINAZIONE: playwright.config.ts (root del progetto)
import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

// Carica .env.local dalla root (usato da Next.js in dev)
const rootEnv = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv })
}

// Carica tests/.env.test se esiste (variabili specifiche per i test)
const testEnv = path.resolve(process.cwd(), 'tests/.env.test')
if (fs.existsSync(testEnv)) {
  dotenv.config({ path: testEnv, override: true })
}

export default defineConfig({
  testDir: './tests/e2e',

  // Sequential: i test condividono lo stesso DB di test, non parallelizzare
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    // In CI aggiunge GitHub annotations
    ...(process.env.CI ? [['github'] as any] : []),
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // globalSetup: crea l'utente di test e salva lo stato di autenticazione
  // così ogni test non deve fare login da zero
  globalSetup: './tests/global-setup.ts',

  projects: [
    // Setup: crea storageState autenticato (eseguito prima di tutti gli altri)
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Test desktop Chrome — usa lo stato autenticato
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Riusa la sessione salvata da global-setup
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Test mobile Safari — usa lo stato autenticato
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 13'],
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Test API: non usa browser, non usa storageState
    {
      name: 'api',
      testMatch: /.*api.*\.spec\.ts/,
      use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
      },
    },
  ],

  // Avvia Next.js dev server automaticamente se non in CI
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
  },
})