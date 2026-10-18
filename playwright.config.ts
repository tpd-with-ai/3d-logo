import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Uses PLAYWRIGHT_CHROMIUM_PATH if set, else the Chrome bundled with agent-browser (preinstalled
 * in Amp orbs), else Playwright's own browser (`pnpm exec playwright install chromium`).
 */
function chromiumPath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const dir = join(homedir(), '.agent-browser', 'browsers');
  if (!existsSync(dir)) return undefined;
  const chrome = readdirSync(dir)
    .filter((name) => name.startsWith('chrome-'))
    .map((name) => join(dir, name, 'chrome'))
    .find((path) => existsSync(path));
  return chrome;
}

const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: chromiumPath(),
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
