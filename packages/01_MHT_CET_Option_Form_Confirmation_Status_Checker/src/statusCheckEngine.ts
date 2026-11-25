/**
 * statusCheckEngine.ts
 *
 * Playwright runner that logs in as one student and reads the
 * "Option Form for CAP Round-III" status from the candidate dashboard.
 * Same login/navigation flow as automationEngine.ts, same callback shape
 * (onProgress/onLog), so the web portal's job queue can run either engine
 * interchangeably per student.
 *
 * Confirmed wording (green):     "Option Form for CAP Round-III is Confirmed"
 * Not-confirmed wording (red):   "Complete Option Form for CAP Round-III. Now confirm it"
 */

import { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { launchVisibleBrowser } from './browserLauncher';

export interface StatusCheckJobConfig {
  studentId: string;
  studentName: string;
  email: string;
  password: string;
  round: CapRound;
}

export type CapRound = 'I' | 'II' | 'III' | 'IV';

export interface StatusCheckCallbacks {
  onProgress: (percent: number, stepName: string) => void;
  onLog: (message: string) => void;
}

export type CapRoundStatus = 'Confirmed' | 'Not Confirmed' | 'Login Failed' | 'Error';

export interface StatusCheckResult {
  success: boolean;
  capStatus?: CapRoundStatus;
  statusText?: string;
  screenshotUrl?: string;
  error?: string;
}

const AUTH_URL =
  'https://auth-2026.maharashtracet.org/realms/mh-cet/protocol/openid-connect/auth?client_id=central-launchpad&redirect_uri=https%3A%2F%2Fportal-2026.maharashtracet.org%2F&state=2ac5d55f-9bf4-4304-85f1-adab12fc3157&response_mode=fragment&response_type=code&scope=openid&nonce=870dfa35-13ca-4ec4-83a4-527df1a46295';

export async function runStatusCheck(
  config: StatusCheckJobConfig,
  callbacks: StatusCheckCallbacks
): Promise<StatusCheckResult> {
  const { onProgress, onLog } = callbacks;

  onLog(`🚀 Initializing status-check worker for ${config.studentName} (${config.email})`);
  onProgress(5, 'Initializing Playwright Worker');

  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  let browser: any;
  try {
    onLog('🌐 Opening visible browser window on your screen (Google Chrome)...');
    const launched = await launchVisibleBrowser(onLog);
    browser = launched.browser;

    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    await page.bringToFront().catch(() => {});

    // Step 1: Login
    onLog('[Step 1] Navigating to MHT CET Auth Page...');
    onProgress(15, 'Navigating to Login Page');
    await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('input[name="username"], input#username, input[type="text"]').first();
    await emailInput.fill(config.email);

    const passwordInput = page.locator('input[name="password"], input#password, input[type="password"]').first();
    await passwordInput.fill(config.password);

    onLog('[Step 1] Submitting authentication credentials...');
    const signInBtn = page.locator('button:has-text("Sign In"), input[type="submit"]:has-text("Sign In")').first();
    await signInBtn.click();

    onLog('[Step 2] Authenticating credentials with MHT CET server...');
    onProgress(30, 'Authenticating Credentials');

    try {
      await page.waitForURL(/portal-2026\.maharashtracet\.org/i, { timeout: 15000 });
    } catch {}

    const isPortalHome = page.url().includes('portal-2026.maharashtracet.org');
    const loginErrorLoc = page
      .locator('text=Invalid username or password, .alert-danger, .alert-error')
      .first();
    const isErrorVisible = await loginErrorLoc.isVisible().catch(() => false);

    if (!isPortalHome || isErrorVisible) {
      const errorMsg = `Invalid Username or Password for ${config.email}. MHT CET Auth server rejected login.`;
      onLog(`❌ ${errorMsg}`);
      await browser.close();
      return { success: false, capStatus: 'Login Failed', error: errorMsg };
    }

    onLog('✅ Login Successful! Reached portal-2026 dashboard.');
    onProgress(45, 'Landed on Portal Dashboard');
    await page.waitForTimeout(2500);

    // Step 3: CAP Registration -> Technical Education -> Bachelor of Engineering
    onLog('[Step 3] Navigating to Centralized Admission Process (CAP)...');
    onProgress(55, 'Opening CAP Registration');
    const capContainer = page
      .locator('div')
      .filter({ hasText: /^Centralized Admission Process \(CAP\) Registration/ })
      .first();

    if (!(await capContainer.isVisible().catch(() => false))) {
      const errorMsg = 'CAP Registration card not visible on portal home.';
      onLog(`❌ ${errorMsg}`);
      await browser.close();
      return { success: false, capStatus: 'Error', error: errorMsg };
    }
    await capContainer.click({ force: true });
    await page.waitForTimeout(1000);

    onLog('[Step 4] Selecting Technical Education category...');
    onProgress(65, 'Selecting Technical Education');
    const techEdu = page.locator('text="Technical Education"').first();
    await techEdu.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await techEdu.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);

    onLog('[Step 5] Selecting Bachelor of Engineering & Opening Candidate Portal...');
    onProgress(70, 'Opening Candidate Portal Tab');
    const beCard = page.locator('text="Bachelor of Engineering"').first();
    await beCard.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    const [candidatePage] = await Promise.all([
      context.waitForEvent('page'),
      beCard.click({ force: true })
    ]);

    await candidatePage.waitForLoadState('domcontentloaded');
    await candidatePage.bringToFront().catch(() => {});
    onLog(`[Step 6] Candidate Dashboard attached! URL: ${candidatePage.url()}`);
    onProgress(80, `Reading CAP Round-${config.round} Status`);
    await candidatePage.waitForTimeout(2000);

    // Ensure we are on the Home page tab where status banners are displayed
    const homeLink = candidatePage.locator('a:has-text("Home"), button:has-text("Home"), li:has-text("Home") a').first();
    if (await homeLink.isVisible().catch(() => false)) {
      await homeLink.click().catch(() => {});
      await candidatePage.waitForTimeout(1000);
    }

    // Scroll so the status banner (further down the Home page) is in the DOM.
    await candidatePage.mouse.wheel(0, 3000).catch(() => {});
    await candidatePage.waitForTimeout(800);
    await candidatePage.mouse.wheel(0, 3000).catch(() => {});
    await candidatePage.waitForTimeout(800);

    const roundNumber = config.round === 'I'
      ? '(I|1)'
      : config.round === 'II'
        ? '(II|2)'
        : config.round === 'III'
          ? '(III|3)'
          : '(IV|4)';
    const roundLocator = candidatePage.locator(`text=/CAP\\s*Round\\s*[-–]?\\s*${roundNumber}\\b/i`);
    let count = await roundLocator.count().catch(() => 0);

    let combinedText = '';
    for (let i = 0; i < count; i++) {
      const text = (await roundLocator.nth(i).innerText().catch(() => '')) || '';
      combinedText += (combinedText ? ' | ' : '') + text.trim();
    }

    // Fallback: If not found, try searching for "Option Form" sections mentioning the round
    if (count === 0) {
      const fallbackLocator = candidatePage.locator(`text=/Round\\s*[-–]?\\s*${roundNumber}\\b/i`);
      const fbCount = await fallbackLocator.count().catch(() => 0);
      for (let i = 0; i < fbCount; i++) {
        const text = (await fallbackLocator.nth(i).innerText().catch(() => '')) || '';
        combinedText += (combinedText ? ' | ' : '') + text.trim();
      }
      count = fbCount;
    }

    const isConfirmed = count > 0 && /is\s+confirmed/i.test(combinedText);
    const capStatus: CapRoundStatus = isConfirmed ? 'Confirmed' : 'Not Confirmed';

    // Scroll the status element into view so it is clearly visible in the browser and screenshot
    if (count > 0) {
      await roundLocator.first().scrollIntoViewIfNeeded().catch(() => {});
      await candidatePage.waitForTimeout(600);
    }

    onLog(
      count === 0
        ? `⚠️ CAP Round-${config.round} section not found on dashboard — recorded as Not Confirmed.`
        : `✅ CAP Round-${config.round} status: ${capStatus}${combinedText ? ` ("${combinedText.slice(0, 70)}")` : ''}`
    );
    onProgress(95, `Status: ${capStatus}`);

    const screenshotFileName = `status_Round${config.round}_${config.studentId}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotFileName);
    await candidatePage.screenshot({ path: screenshotPath }).catch(() => {});

    // Brief pause so the candidate tab is visually observable on screen
    await candidatePage.waitForTimeout(1500);

    onProgress(100, 'Completed');
    await browser.close();

    return {
      success: true,
      capStatus,
      statusText: combinedText,
      screenshotUrl: `/screenshots/${screenshotFileName}`
    };
  } catch (err: any) {
    onLog(`❌ Worker Exception: ${err.message}`);
    if (browser) {
      await browser.close().catch(() => {});
    }
    return { success: false, capStatus: 'Error', error: err.message };
  }
}
