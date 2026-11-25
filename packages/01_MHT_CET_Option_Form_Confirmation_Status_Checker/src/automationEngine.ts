import path from 'path';
import fs from 'fs';
import { ChoiceItem, formatChoiceCode } from './pdfParser';
import { launchVisibleBrowser } from './browserLauncher';

export interface StudentAutomationJobConfig {
  studentId: string;
  studentName: string;
  email: string;
  password: string;
  choices: ChoiceItem[];
}

export interface AutomationCallbacks {
  onProgress: (percent: number, stepName: string) => void;
  onLog: (message: string) => void;
}

const AUTH_URL = "https://auth-2026.maharashtracet.org/realms/mh-cet/protocol/openid-connect/auth?client_id=central-launchpad&redirect_uri=https%3A%2F%2Fportal-2026.maharashtracet.org%2F&state=2ac5d55f-9bf4-4304-85f1-adab12fc3157&response_mode=fragment&response_type=code&scope=openid&nonce=870dfa35-13ca-4ec4-83a4-527df1a46295";

/**
 * Programmatic Playwright runner for MHT CET Choice Shortlisting & Direct Choice Insertion Loop.
 * Opens Google Chrome maximized on the foreground desktop so the user can see live choice filling.
 */
export async function runStudentAutomation(
  config: StudentAutomationJobConfig,
  callbacks: AutomationCallbacks
): Promise<{ success: boolean; screenshotUrl?: string; error?: string }> {
  const { onProgress, onLog } = callbacks;

  onLog(`🚀 Initializing live automation worker for ${config.studentName} (${config.email})`);
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

    const context = await browser.newContext({
      viewport: null // null viewport allows window to take full screen bounds
    });
    const page = await context.newPage();
    await page.bringToFront().catch(() => {});

    // Step 1: Open Login Page
    onLog(`[Step 1] Navigating to MHT CET Auth Page...`);
    onProgress(10, 'Navigating to Login Page');
    await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded' });

    // Fill Credentials
    onLog(`[Step 1] Entering email: ${config.email}`);
    const emailInput = page.locator('input[name="username"], input#username, input[type="text"]').first();
    await emailInput.fill(config.email);

    const passwordInput = page.locator('input[name="password"], input#password, input[type="password"]').first();
    await passwordInput.fill(config.password);

    onLog('[Step 1] Submitting authentication credentials...');
    const signInBtn = page.locator('button:has-text("Sign In"), input[type="submit"]:has-text("Sign In")').first();
    await signInBtn.click();

    // Step 2: Validate Login Response
    onLog('[Step 2] Authenticating credentials with MHT CET server...');
    onProgress(20, 'Authenticating Credentials');

    try {
      await page.waitForURL(/portal-2026\.maharashtracet\.org/i, { timeout: 15000 });
    } catch (e) {}

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

    // Step 3: Click CAP Registration card
    onLog('[Step 3] Navigating to Centralized Admission Process (CAP)...');
    onProgress(35, 'Opening CAP Registration');
    const capContainer = page.locator('div').filter({ hasText: /^Centralized Admission Process \(CAP\) Registration/ }).first();
    await capContainer.click({ force: true });
    await page.waitForTimeout(1000);

    // Step 4: Popup modal -> Click Technical Education
    onLog('[Step 4] Selecting Technical Education category...');
    onProgress(40, 'Selecting Technical Education');
    const techEdu = page.locator('text="Technical Education"').first();
    await techEdu.waitFor({ state: 'visible', timeout: 15000 });
    await techEdu.click({ force: true });
    await page.waitForTimeout(1000);

    // Step 5: Click Bachelor of Engineering & Attach New Tab
    onLog('[Step 5] Selecting Bachelor of Engineering & Opening Candidate Portal...');
    onProgress(45, 'Opening Candidate Portal Tab');
    const beCard = page.locator('text="Bachelor of Engineering"').first();
    await beCard.waitFor({ state: 'visible', timeout: 15000 });

    const [candidatePage] = await Promise.all([
      context.waitForEvent('page'),
      beCard.click({ force: true })
    ]);

    await candidatePage.waitForLoadState('domcontentloaded');
    await candidatePage.bringToFront().catch(() => {});
    onLog(`[Step 6] Candidate Dashboard attached! URL: ${candidatePage.url()}`);
    onProgress(50, 'Candidate Dashboard Active');

    // Step 6: Click "Fill / Edit Option Form"
    onLog('[Step 7] Locating and clicking "Fill / Edit Option Form"...');
    onProgress(55, 'Opening Option Form');
    const fillOptionFormBtn = candidatePage.locator('a[href*="frmOptionForm"]').first();
    await fillOptionFormBtn.waitFor({ state: 'visible', timeout: 15000 });
    await fillOptionFormBtn.click({ force: true });

    await candidatePage.waitForLoadState('domcontentloaded');
    await candidatePage.waitForTimeout(2500);

    // Navigate to Direct Choice Insertion Page if not already there
    if (!candidatePage.url().includes('frmInsertChoiceCodeDirect')) {
      
      // Step 7: Handle Shortlist Options if needed (frmShortListOptions)
      if (!candidatePage.url().includes('frmSetPreferences') && !candidatePage.url().includes('frmOptionFormSummary')) {
        onLog('[Step 8] Shortlisting Choice 1 from PDF...');
        const firstChoice = config.choices[0] || { branch: 'Computer Engineering', choiceCode: '0301224510' };
        const formattedFirstCode = formatChoiceCode(firstChoice.choiceCode);
        
        const courseSelect = candidatePage.locator('select#rightContainer_ContentTable1_ddlCourse, select[name*="ddlCourse"]').first();
        if (await courseSelect.isVisible().catch(() => false)) {
          await courseSelect.selectOption({ label: firstChoice.branch }).catch(async () => {
            const options = await courseSelect.locator('option').allInnerTexts();
            const match = options.find(opt => opt.toLowerCase().includes(firstChoice.branch.toLowerCase()));
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
            await candidatePage.waitForTimeout(3000);
          }
        }
      }

      // Step 8: Handle Set Preferences if on frmSetPreferences
      if (candidatePage.url().includes('frmSetPreferences')) {
        onLog('[Step 9] Setting Preferences on Set Preferences page...');
        const checkboxes = candidatePage.locator('input[id*="chkSetPreferences"], input[type="checkbox"]');
        const count = await checkboxes.count();
        for (let i = 0; i < count; i++) {
          await checkboxes.nth(i).check({ force: true }).catch(() => {});
        }
        const saveProceedPrefBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnProceed, input[value*="Save & Proceed"]').first();
        await saveProceedPrefBtn.click({ force: true });
        await candidatePage.waitForTimeout(3000);
      }

      // Step 9: Click Insert Choice Code Directly on Option Form Summary
      if (candidatePage.url().includes('frmOptionFormSummary')) {
        onLog('[Step 10] Clicking "Insert Choice Code Directly"...');
        const insertDirectBtn = candidatePage.locator('input#rightContainer_ContentTable3_btnInsertDirect, input[value*="Insert Choice Code Directly"]').first();
        await insertDirectBtn.click({ force: true });
        await candidatePage.waitForTimeout(3000);
      }
    }

    // Step 10: Direct Choice Code Insertion Loop for ALL Extracted Choices in PDF
    const allChoices = config.choices && config.choices.length > 0 ? config.choices : [
      { prefNo: 1, branch: 'Computer Engineering', choiceCode: '0301224510', institute: '', city: '', rank: '', percentile: '', category: '' }
    ];
    const totalToFill = allChoices.length;
    onLog(`[Step 11] Reached Direct Insertion Page! Starting fast insertion loop for ALL ${totalToFill} PDF choices...`);
    onProgress(60, `Filling ${totalToFill} PDF Choices`);

    let successfullyInsertedCount = 0;

    for (let i = 0; i < totalToFill; i++) {
      const choice = allChoices[i];
      const formattedCode = formatChoiceCode(choice.choiceCode);
      const pdfPrefNo = choice.prefNo || (i + 1);

      const stepPct = 60 + Math.round(((i + 1) / totalToFill) * 35);
      onProgress(stepPct, `Choice ${i + 1}/${totalToFill}: ${formattedCode}`);

      // Fill Code Input directly
      const codeInput = candidatePage.locator('input#rightContainer_ContentTable1_txtChoiceCode, input[name*="txtChoiceCode"]').first();
      await codeInput.waitFor({ state: 'visible', timeout: 15000 });
      await codeInput.fill(formattedCode);

      // Click Verify Choice Code
      const verifyBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnVerifyChoiceCode, input[value*="Verify Choice Code"]').first();
      await verifyBtn.click({ force: true });
      await candidatePage.waitForTimeout(300);

      // Check if choice code is already inserted, invalid, or ineligible
      const errorTextLoc = candidatePage.locator('text=Invalid Choice Code or You are not eligible, text=Already Choice Code inserted, text=already inserted').first();
      const isErrorOrAdded = await errorTextLoc.isVisible().catch(() => false);

      if (isErrorOrAdded) {
        onLog(`⚠️ Choice ${i + 1}/${totalToFill} [PDF #${pdfPrefNo}] (${formattedCode}): Unavailable / Already Added. Skipping...`);
        continue;
      }

      // Click Insert Choice Code (Portal automatically assigns next sequential preference number)
      const insertCodeBtn = candidatePage.locator('#rightContainer_ContentTable1_btnInsertDirect').first();
      if (await insertCodeBtn.isVisible().catch(() => false)) {
        await insertCodeBtn.click({ force: true });
        await candidatePage.waitForTimeout(400);

        successfullyInsertedCount++;
        onLog(`✅ Choice ${i + 1}/${totalToFill} (${formattedCode}) [PDF #${pdfPrefNo}] ➔ Inserted as Portal Preference #${successfullyInsertedCount}`);
      }
    }

    // Step 11: Final Save & Proceed using exact requested locator
    onLog('[Step 12] All choices processed! Finalizing and saving option form with Save & Proceed >>>...');
    onProgress(95, 'Saving Option Form');

    const saveProceedBtn = candidatePage.getByRole('button', { name: 'Save & Proceed >>>' });
    if (await saveProceedBtn.isVisible().catch(() => false)) {
      await saveProceedBtn.click({ force: true });
    } else {
      await candidatePage.locator('input[value*="Save & Proceed"]').first().click({ force: true }).catch(() => {});
    }

    await candidatePage.waitForTimeout(3500);

    // Capture Verification Screenshot
    const screenshotFileName = `screenshot_${config.studentId}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotFileName);
    await candidatePage.screenshot({ path: screenshotPath });

    onLog(`🎉 ALL ${totalToFill} CHOICES PROCESSED (${successfullyInsertedCount} NEWLY INSERTED) & OPTION FORM SAVED FOR ${config.studentName}!`);
    onProgress(100, 'Completed');

    await browser.close();
    return {
      success: true,
      screenshotUrl: `/screenshots/${screenshotFileName}`
    };

  } catch (err: any) {
    onLog(`❌ Worker Exception: ${err.message}`);
    if (browser) {
      await browser.close().catch(() => {});
    }
    return {
      success: false,
      error: err.message
    };
  }
}
