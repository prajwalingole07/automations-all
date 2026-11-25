import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ChoiceItem, formatChoiceCode } from './pdfParser';

export type CAPRound = 1 | 2 | 3 | 4;

export interface StudentAutomationJobConfig {
  studentId: string;
  studentName: string;
  email: string;
  password: string;
  choices: ChoiceItem[];
  round: CAPRound;
}

export interface AutomationCallbacks {
  onProgress: (percent: number, stepName: string) => void;
  onLog: (message: string) => void;
}

function generateAuthUrl(): string {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  return `https://auth-2026.maharashtracet.org/realms/mh-cet/protocol/openid-connect/auth?client_id=central-launchpad&redirect_uri=https%3A%2F%2Fportal-2026.maharashtracet.org%2F&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;
}

export async function runStudentAutomation(
  config: StudentAutomationJobConfig,
  callbacks: AutomationCallbacks
): Promise<{ success: boolean; screenshotUrl?: string; error?: string; failedChoices?: string[] }> {
  const { onProgress, onLog } = callbacks;
  const round = config.round || 1;

  onLog(`🚀 Initializing CAP Round ${round} automation for ${config.studentName} (${config.email})`);
  onProgress(5, `Initializing Playwright Worker [Round ${round}]`);

  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  let browser;
  let candidatePage: any;
  try {
    onLog('🌐 Opening Google Chrome browser on your screen...');
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars'
      ]
    }).catch(async (e) => {
      onLog(`⚠️ Native Chrome launch failed (${e.message}), trying bundled Chromium...`);
      return await chromium.launch({
        headless: false,
        args: [
          '--start-maximized',
          '--no-sandbox',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      });
    });

    const context = await browser.newContext({
      viewport: null
    });
    const page = await context.newPage();
    await page.bringToFront().catch(() => {});

    if (round === 2 || round === 3 || round === 4) {
      onLog(`[Round ${round}] ⚡ FAST MODE: You must be on the "Insert Choice Code Directly" page.`);
      onLog(`[Round ${round}] 🔐 Please log in manually → go to CAP Registration → Technical Education → Bachelor of Engineering → Fill/Edit Option Form → click "Insert Choice Code Directly".`);
      onLog(`[Round ${round}] 👆 The automation will detect that page and immediately start inserting ALL choices!`);
      onProgress(15, `Waiting for Insert Choice Code Directly Page (Round ${round})`);
      await page.goto('about:blank');
      let candPage: typeof page | null = null;
      const pollStart = Date.now();
      const MAX_WAIT_MS = 10 * 60 * 1000;
      onLog(`[Round ${round}] ⏳ Watching for "Insert Choice Code Directly" page to appear (timeout: 10 mins)...`);
      while (Date.now() - pollStart < MAX_WAIT_MS) {
        const allPages = context.pages();
        for (const p of allPages) {
          const url = p.url();
          if (url.includes('frmInsertChoiceCodeDirect')) {
            candPage = p;
            break;
          }
        }
        if (candPage) break;
        await page.waitForTimeout(2000);
      }
      if (!candPage) {
        await page.goto(generateAuthUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        const errorMsg = `[Round ${round}] Timed out waiting for "Insert Choice Code Directly" page. Please navigate there and restart.`;
        onLog(`❌ ${errorMsg}`);
        await browser.close();
        return { success: false, error: errorMsg };
      }
      candidatePage = candPage;
      onLog(`[Round ${round}] ✅ Detected! Now on Insert Choice Code Directly page. Starting rapid insertion...`);
      onProgress(55, `Round ${round}: Insert Page Detected`);
      const allChoicesR = config.choices && config.choices.length > 0 ? config.choices : [
        { prefNo: 1, branch: 'Computer Engineering', choiceCode: '0301224510', institute: '', city: '', rank: '', percentile: '', category: '' }
      ];
      const totalToFillR = allChoicesR.length;
      onLog(`[Round ${round}] Starting fast insertion loop for ALL ${totalToFillR} PDF choices...`);
      onProgress(60, `Round ${round}: Filling ${totalToFillR} PDF Choices`);
      let successfullyInsertedCountR = 0;
      const failedR: string[] = [];
      for (let i = 0; i < totalToFillR; i++) {
        const choice = allChoicesR[i];
        const formattedCode = formatChoiceCode(choice.choiceCode);
        const pdfPrefNo = choice.prefNo || (i + 1);
        const stepPct = 60 + Math.round(((i + 1) / totalToFillR) * 35);
        onProgress(stepPct, `Round ${round} Choice ${i + 1}/${totalToFillR}: ${formattedCode}`);
        const codeInput = candidatePage.locator('input#rightContainer_ContentTable1_txtChoiceCode, input[name*="txtChoiceCode"]').first();
        await codeInput.waitFor({ state: 'visible', timeout: 15000 });
        await codeInput.fill(formattedCode);
        const verifyBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnVerifyChoiceCode, input[value*="Verify Choice Code"]').first();
        const responsePromise = candidatePage.waitForResponse((r: any) => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
        await verifyBtn.click({ force: true });
        await responsePromise;
        await candidatePage.waitForTimeout(400);
        const errorTextLoc = candidatePage.locator('text=Invalid Choice Code or You are not eligible, text=Already Choice Code inserted, text=already inserted').first();
        const isErrorOrAdded = await errorTextLoc.isVisible().catch(() => false);
        if (isErrorOrAdded) {
          failedR.push(formattedCode);
          onLog(`⚠️ Round ${round} Choice ${i + 1}/${totalToFillR} [PDF #${pdfPrefNo}] (${formattedCode}): Unavailable / Already Added. Skipping...`);
          continue;
        }
        const insertCodeBtn = candidatePage.locator('#rightContainer_ContentTable1_btnInsertDirect').first();
        if (await insertCodeBtn.isVisible().catch(() => false)) {
          await insertCodeBtn.click({ force: true });
          await candidatePage.waitForTimeout(400);
          successfullyInsertedCountR++;
          onLog(`✅ Round ${round} Choice ${i + 1}/${totalToFillR} (${formattedCode}) [PDF #${pdfPrefNo}] ➔ Inserted as Portal Preference #${successfullyInsertedCountR}`);
        } else {
          failedR.push(formattedCode);
        }
      }
      onLog(`[Round ${round}] All choices processed! Finalizing and saving option form...`);
      onProgress(95, `Round ${round}: Saving Option Form`);
      const saveProceedBtnR = candidatePage.getByRole('button', { name: 'Save & Proceed >>>' });
      if (await saveProceedBtnR.isVisible().catch(() => false)) {
        await saveProceedBtnR.click({ force: true });
      } else {
        await candidatePage.locator('input[value*="Save & Proceed"]').first().click({ force: true }).catch(() => {});
      }
      await candidatePage.waitForTimeout(3500);
      await candidatePage.waitForLoadState('domcontentloaded').catch(() => {});
      const screenshotFileNameR = `screenshot_round${round}_${config.studentId}.png`;
      const screenshotPathR = path.join(screenshotsDir, screenshotFileNameR);
      await candidatePage.screenshot({ path: screenshotPathR });
      onLog(`🎉 Round ${round} — ALL ${totalToFillR} CHOICES PROCESSED (${successfullyInsertedCountR} NEWLY INSERTED) & OPTION FORM SAVED FOR ${config.studentName}!`);
      onProgress(100, `Round ${round} Completed`);
      await browser.close();
      return {
        success: true,
        screenshotUrl: `/screenshots/${screenshotFileNameR}`,
        failedChoices: failedR
      };
    }

    onLog(`[Round 1 - Step 1] Navigating to MHT CET Auth Page...`);
    onProgress(10, 'Navigating to Login Page');
    await page.goto(generateAuthUrl(), { waitUntil: 'networkidle', timeout: 30000 });

    onLog(`[Round 1 - Step 1] Entering email: ${config.email}`);
    const emailInput = page.locator('input#email, input[name="email"], input[name="username"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.click();
    await emailInput.fill(config.email);
    await page.locator('#password').click();
    await page.waitForTimeout(300);

    const passwordInput = page.locator('input#password, input[name="password"], input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(config.password);
    await page.waitForTimeout(300);

    const emailStillFilled = await emailInput.inputValue().catch(() => '');
    if (!emailStillFilled || !emailStillFilled.includes('@')) {
      onLog('⚠️ Keycloak cleared email after password fill — re-entering email...');
      await emailInput.click();
      await emailInput.fill(config.email);
      await page.waitForTimeout(200);
    }

    onLog('[Round 1 - Step 1] Submitting authentication credentials...');
    const signInBtn = page.locator('#kc-login, input[type="submit"][name="login"], button:has-text("Sign In"), input[value*="Sign In"]').first();
    await signInBtn.click();

    onLog('[Round 1 - Step 2] Authenticating credentials with MHT CET server...');
    onProgress(20, 'Authenticating Credentials');

    try {
      await page.waitForURL(/portal-2026\.maharashtracet\.org/i, { timeout: 20000 });
    } catch (e) {
      onLog('⚠️ Login redirect timeout — checking current page state...');
    }

    const currentUrl = page.url();
    const isPortalHome = currentUrl.includes('portal-2026.maharashtracet.org');
    const loginErrorLoc = page.locator('text=Invalid username or password, .alert-danger, .alert-error').first();
    const isErrorVisible = await loginErrorLoc.isVisible().catch(() => false);

    if (!isPortalHome || isErrorVisible) {
      const errorMsg = `Invalid Username or Password for ${config.email}. MHT CET Auth server rejected login.`;
      onLog(`❌ ${errorMsg}`);
      const errScreenshot = `screenshots/error_${config.studentId}_${Date.now()}.png`;
      await page.screenshot({ path: errScreenshot }).catch(() => {});
      await browser.close();
      return { success: false, error: errorMsg, screenshotUrl: errScreenshot };
    }

    onLog('✅ Login Successful! Reached portal-2026 dashboard.');
    onProgress(30, 'Landed on Portal Dashboard');
    await page.waitForTimeout(3000);

    onLog('[Step 3] Navigating to Centralized Admission Process (CAP)...');
    onProgress(35, 'Opening CAP Registration');
    const capContainer = page.locator('div').filter({ hasText: /^Centralized Admission Process \(CAP\) Registration/ }).first();
    await capContainer.click({ force: true });
    await page.waitForTimeout(1000);

    onLog('[Step 4] Selecting Technical Education category...');
    onProgress(40, 'Selecting Technical Education');
    const techEdu = page.locator('text="Technical Education"').first();
    await techEdu.waitFor({ state: 'visible', timeout: 15000 });
    await techEdu.click({ force: true });
    await page.waitForTimeout(1000);

    onLog('[Step 5] Selecting Bachelor of Engineering & Opening Candidate Portal...');
    onProgress(45, 'Opening Candidate Portal Tab');
    const beCard = page.locator('text="Bachelor of Engineering"').first();
    await beCard.waitFor({ state: 'visible', timeout: 15000 });

    const [cPage] = await Promise.all([
      context.waitForEvent('page'),
      beCard.click({ force: true })
    ]);
    candidatePage = cPage;

    await candidatePage.waitForLoadState('domcontentloaded');
    await candidatePage.bringToFront().catch(() => {});
    onLog(`[Step 6] Candidate Dashboard attached! URL: ${candidatePage.url()}`);
    onProgress(50, 'Candidate Dashboard Active');

    onLog('[Step 7] Locating and clicking "Fill / Edit Option Form"...');
    onProgress(55, 'Opening Option Form');
    const fillOptionFormBtn = candidatePage.locator('a[href*="frmOptionForm"]').first();
    await fillOptionFormBtn.waitFor({ state: 'visible', timeout: 15000 });
    await fillOptionFormBtn.click({ force: true });

    await candidatePage.waitForLoadState('domcontentloaded');
    await candidatePage.waitForTimeout(2500);

    if (!candidatePage.url().includes('frmInsertChoiceCodeDirect')) {
      if (!candidatePage.url().includes('frmSetPreferences') && !candidatePage.url().includes('frmOptionFormSummary')) {
        onLog('[Step 8] Shortlisting Choice 1 from PDF...');
        const firstChoice = config.choices[0] || { branch: 'Computer Engineering', choiceCode: '0301224510' };
        const formattedFirstCode = formatChoiceCode(firstChoice.choiceCode);
        const courseSelect = candidatePage.locator('select#rightContainer_ContentTable1_ddlCourse, select[name*="ddlCourse"]').first();
        if (await courseSelect.isVisible().catch(() => false)) {
          await courseSelect.selectOption({ label: firstChoice.branch }).catch(async () => {
            const options = await courseSelect.locator('option').allInnerTexts();
            const match = options.find((opt: string) => opt.toLowerCase().includes(firstChoice.branch.toLowerCase()));
            if (match) await courseSelect.selectOption({ label: match.trim() });
          });
          const searchInstBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnSearch, input[value*="Search"]').first();
          await searchInstBtn.click({ force: true });
          await candidatePage.waitForTimeout(3000);
          const targetRow = candidatePage.locator('tr').filter({ hasText: formattedFirstCode }).first();
          if (await targetRow.isVisible().catch(() => false)) {
            const checkbox = targetRow.locator('input[type="checkbox"]').first();
            await checkbox.check({ force: true });
            const addOptionsBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnAddOptions, input[value*="ADD"]').first();
            await addOptionsBtn.click({ force: true });
            await candidatePage.waitForTimeout(2500);
            const saveProceedBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnSaveProceed, input[value*="Save"]').first();
            await saveProceedBtn.click({ force: true });
            await candidatePage.waitForURL(/frmSetPreferences/i, { timeout: 15000 }).catch(() => {});
          }
        }
      }

      if (candidatePage.url().includes('frmSetPreferences')) {
        onLog('[Step 9] Setting Preferences on Set Preferences page...');
        const checkboxes = candidatePage.locator('input[id*="chkSetPreferences"], input[type="checkbox"]');
        const count = await checkboxes.count();
        for (let i = 0; i < count; i++) {
          await checkboxes.nth(i).check({ force: true }).catch(() => {});
        }
        const saveProceedPrefBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnProceed, input[value*="Save & Proceed"]').first();
        await saveProceedPrefBtn.click({ force: true });
        await candidatePage.waitForURL(/frmOptionFormSummary/i, { timeout: 15000 }).catch(() => {});
      }

      if (candidatePage.url().includes('frmOptionFormSummary')) {
        onLog('[Step 10] Clicking "Insert Choice Code Directly"...');
        const insertDirectBtn = candidatePage.locator('input#rightContainer_ContentTable3_btnInsertDirect, input[value*="Insert Choice Code Directly"]').first();
        await insertDirectBtn.click({ force: true });
        await candidatePage.waitForURL(/frmInsertChoiceCodeDirect/i, { timeout: 15000 }).catch(() => {});
      }
    }

    const allChoices = config.choices && config.choices.length > 0 ? config.choices : [
      { prefNo: 1, branch: 'Computer Engineering', choiceCode: '0301224510', institute: '', city: '', rank: '', percentile: '', category: '' }
    ];
    const totalToFill = allChoices.length;
    onLog(`[Step 11] Reached Direct Insertion Page! Starting fast insertion loop for ALL ${totalToFill} PDF choices...`);
    onProgress(60, `Filling ${totalToFill} PDF Choices`);

    let successfullyInsertedCount = 0;
    const failedChoices: string[] = [];

    for (let i = 0; i < totalToFill; i++) {
      const choice = allChoices[i];
      const formattedCode = formatChoiceCode(choice.choiceCode);
      const pdfPrefNo = choice.prefNo || (i + 1);
      const stepPct = 60 + Math.round(((i + 1) / totalToFill) * 35);
      onProgress(stepPct, `Choice ${i + 1}/${totalToFill}: ${formattedCode}`);
      const codeInput = candidatePage.locator('input#rightContainer_ContentTable1_txtChoiceCode, input[name*="txtChoiceCode"]').first();
      await codeInput.waitFor({ state: 'visible', timeout: 15000 });
      await codeInput.fill(formattedCode);
      const verifyBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnVerifyChoiceCode, input[value*="Verify Choice Code"]').first();
      const responsePromise = candidatePage.waitForResponse((r: any) => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
      await verifyBtn.click({ force: true });
      await responsePromise;
      await candidatePage.waitForTimeout(400);
      const errorTextLoc = candidatePage.locator('text=Invalid Choice Code or You are not eligible, text=Already Choice Code inserted, text=already inserted').first();
      const isErrorOrAdded = await errorTextLoc.isVisible().catch(() => false);
      if (isErrorOrAdded) {
        failedChoices.push(formattedCode);
        onLog(`⚠️ Choice ${i + 1}/${totalToFill} [PDF #${pdfPrefNo}] (${formattedCode}): Unavailable / Already Added. Skipping...`);
        continue;
      }
      const insertCodeBtn = candidatePage.locator('#rightContainer_ContentTable1_btnInsertDirect').first();
      if (await insertCodeBtn.isVisible().catch(() => false)) {
        await insertCodeBtn.click({ force: true });
        await candidatePage.waitForTimeout(400);
        successfullyInsertedCount++;
        onLog(`✅ Choice ${i + 1}/${totalToFill} (${formattedCode}) [PDF #${pdfPrefNo}] ➔ Inserted as Portal Preference #${successfullyInsertedCount}`);
      } else {
        failedChoices.push(formattedCode);
      }
    }

    onLog('[Step 11] All choices processed! Finalizing and saving option form with Save & Proceed >>>...');
    onProgress(95, 'Saving Option Form');
    const saveProceedBtn = candidatePage.getByRole('button', { name: 'Save & Proceed >>>' });
    if (await saveProceedBtn.isVisible().catch(() => false)) {
      await saveProceedBtn.click({ force: true });
    } else {
      await candidatePage.locator('input[value*="Save & Proceed"]').first().click({ force: true }).catch(() => {});
    }
    await candidatePage.waitForTimeout(3500);
    await candidatePage.waitForLoadState('domcontentloaded').catch(() => {});
    onLog('[Step 12] Verifying inserted choices on the final Summary Page...');
    onProgress(98, 'Verifying Choice Summary');
    try {
      const pageText = await candidatePage.locator('body').innerText().catch(() => '');
      const expectedCodes = config.choices ? config.choices.map(c => formatChoiceCode(c.choiceCode)) : [];
      for (const code of expectedCodes) {
        if (!pageText.includes(code) && !failedChoices.includes(code)) {
          failedChoices.push(code);
        }
      }
      if (failedChoices.length > 0) {
        onLog(`⚠️ Summary Verification: Detected ${failedChoices.length} missing/failed choice code(s).`);
      } else {
        onLog(`✅ Summary Verification: All ${expectedCodes.length} choices successfully verified on portal summary!`);
      }
    } catch (err: any) {
      onLog(`⚠️ Summary verification notice: ${err.message}`);
    }
    const screenshotFileName = `screenshot_${config.studentId}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotFileName);
    await candidatePage.screenshot({ path: screenshotPath });
    onLog(`🎉 ALL ${totalToFill} CHOICES PROCESSED (${successfullyInsertedCount} NEWLY INSERTED) & OPTION FORM SAVED FOR ${config.studentName}!`);
    onProgress(100, 'Completed');
    await browser.close();
    return {
      success: true,
      screenshotUrl: `/screenshots/${screenshotFileName}`,
      failedChoices
    };

  } catch (err: any) {
    onLog(`❌ Worker Exception: ${err.message}`);
    if (candidatePage) {
      const errScreenshotPath = path.join(screenshotsDir, `error_${config.studentId}.png`);
      await candidatePage.screenshot({ path: errScreenshotPath }).catch(() => {});
      if (browser) await browser.close().catch(() => {});
      return {
        success: false,
        error: err.message,
        screenshotUrl: `/screenshots/error_${config.studentId}.png`
      };
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    return {
      success: false,
      error: err.message
    };
  }
}
