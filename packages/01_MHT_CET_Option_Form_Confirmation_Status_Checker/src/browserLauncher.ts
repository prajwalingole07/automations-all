import { chromium, Browser, LaunchOptions } from '@playwright/test';

export interface LaunchResult {
  browser: Browser;
  engine: string;
}

const BASE_ARGS = [
  '--window-position=0,0',
  '--window-size=1366,768',
  '--start-maximized',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled'
];

/**
 * Launches a VISIBLE browser window on the desktop so the user can watch the
 * automation live. Tries Google Chrome, then Microsoft Edge, then the bundled
 * Playwright Chromium, so a headed window always opens even if one channel is
 * missing or fails.
 */
export async function launchVisibleBrowser(
  onLog?: (message: string) => void
): Promise<LaunchResult> {
  const attempts: Array<{ engine: string; options: LaunchOptions }> = [
    { engine: 'Google Chrome', options: { headless: false, channel: 'chrome', args: BASE_ARGS } },
    { engine: 'Microsoft Edge', options: { headless: false, channel: 'msedge', args: BASE_ARGS } },
    { engine: 'Playwright Chromium', options: { headless: false, args: BASE_ARGS } }
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const browser = await chromium.launch(attempt.options);
      if (onLog) onLog(`✅ Visible browser window opened using ${attempt.engine}.`);
      return { browser, engine: attempt.engine };
    } catch (err: any) {
      lastError = err;
      if (onLog) onLog(`⚠️ Could not open ${attempt.engine} (${err.message}); trying next browser engine...`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No browser engine available to launch.');
}
