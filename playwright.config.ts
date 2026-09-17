import { defineConfig, devices } from '@playwright/test'

// Puerto propio y sin reutilizar servidores: un `next dev` local (3000) apunta a producción
// y las pruebas nunca deben correr contra él.
const PUERTO = 3100
const URL_BASE = `http://127.0.0.1:${PUERTO}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: URL_BASE,
    trace: 'retain-on-failure',
    locale: 'es-SV',
    timezoneId: 'America/El_Salvador',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${PUERTO}`,
    url: `${URL_BASE}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
