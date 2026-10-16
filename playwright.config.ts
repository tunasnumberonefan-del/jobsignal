import { defineConfig, devices } from '@playwright/test';

// Uses the Microsoft Edge already installed on Windows (channel 'msedge'), so no browser
// download is needed. On CI or Linux, set PW_CHANNEL=chromium after `npx playwright install chromium`.
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', channel, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
