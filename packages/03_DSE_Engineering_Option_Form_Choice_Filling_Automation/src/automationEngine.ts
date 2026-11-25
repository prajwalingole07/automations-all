import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ChoiceItem, formatChoiceCode } from './pdfParser';

export interface StudentAutomationJobConfig {
  studentId: string;
  studentName: string;
  email: string;
  password: string;
  choices: ChoiceItem[];
  courseType?: 'Bachelor of Engineering' | 'Direct Second Year Degree in Engineering';
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

  let browser;
  let candidatePage: any;
  try {
    onLog('🌐 Opening Google Chrome browser on your screen...');
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
    }).catch(async (e) => {
      onLog(`⚠️ Native Chrome launch retry: ${e.message}`);
      return await chromium.launch({
        headless: false,
        args: ['--start-maximized']
      });
    });

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
    
    const isDSE = config.courseType === 'Direct Second Year Degree in Engineering';

    // candidatePage already declared outer scope
    let screenshotFileName = `screenshot_${config.studentId}.png`;
    let screenshotPath = path.join(screenshotsDir, screenshotFileName);

    if (isDSE) {
      // Step 5: Click Direct Second Year Degree in Engineering & Attach New Tab
      onLog('[Step 5] Selecting Direct Second Year Degree in Engineering & Opening Candidate Portal...');
      onProgress(45, 'Opening DSE Candidate Portal Tab');
      const dseCard = page.locator('h4').filter({ hasText: /^Direct Second Year Degree in Engineering$/ }).first();
      await dseCard.waitFor({ state: 'visible', timeout: 15000 });

      const [cPage] = await Promise.all([
        context.waitForEvent('page'),
        dseCard.click({ force: true })
      ]);
      candidatePage = cPage;

      await candidatePage.waitForLoadState('domcontentloaded');
      await candidatePage.bringToFront().catch(() => {});
      onLog(`[Step 6] Candidate Dashboard attached! URL: ${candidatePage.url()}`);
      onProgress(50, 'Candidate Dashboard Active');

      // Wait for DSE Dashboard elements to load
      const appFormMenu = candidatePage.locator('text="Application Form"').first();
      await appFormMenu.waitFor({ state: 'visible', timeout: 30000 });

      // Step 6: Click "Option Form" menu item
      onLog('[Step 7] Locating and expanding "Option Form" in sidebar...');
      onProgress(55, 'Expanding Option Form');
      
      const selectPreferenceBtn = candidatePage.locator('[aria-label*="Pref"]').first();
      if (!await selectPreferenceBtn.isVisible().catch(() => false)) {
        const optionFormMenu = candidatePage.locator('[aria-label="Option Form"]').first();
        await optionFormMenu.click({ force: true });
        await candidatePage.waitForTimeout(1000);
      }

      // Step 7: Click "Select Preference"
      onLog('[Step 8] Clicking "Select Preference" option...');
      onProgress(60, 'Navigating to Select Preference');
      await selectPreferenceBtn.click({ force: true });
      await candidatePage.waitForLoadState('domcontentloaded');
      await candidatePage.waitForTimeout(1500);

      // Step 8: Click "Insert Choice Code"
      onLog('[Step 9] Clicking "Insert Choice Code" button...');
      onProgress(65, 'Entering Choice Code Page');
      const insertChoiceCodeBtn = candidatePage.locator('button:has-text("Insert Choice Code"), button:has-text("Insert Choice"), a:has-text("Insert Choice Code")').first();
      await insertChoiceCodeBtn.waitFor({ state: 'visible', timeout: 15000 });
      await insertChoiceCodeBtn.click({ force: true });
      await candidatePage.waitForLoadState('domcontentloaded');
      await candidatePage.waitForTimeout(1500);

      // Step 9: Search and Select Choice Codes
      const allChoices = config.choices && config.choices.length > 0 ? config.choices : [];
      const totalToFill = allChoices.length;
      onLog(`[Step 10] Reached Direct Selection Page! Starting search & check loop for ${totalToFill} choices...`);
      onProgress(70, `Selecting ${totalToFill} Choices`);

      const searchInput = candidatePage.locator('input[type="search"], input[placeholder*="Search"]').first();
      await searchInput.waitFor({ state: 'visible', timeout: 20000 });

      let successfullySelectedCount = 0;
      const failedChoices: string[] = [];

      for (let i = 0; i < totalToFill; i++) {
        const choice = allChoices[i];
        const formattedCode = formatChoiceCode(choice.choiceCode);
        const pdfPrefNo = choice.prefNo || (i + 1);

        const stepPct = 70 + Math.round(((i + 1) / totalToFill) * 20);
        onProgress(stepPct, `Choice ${i + 1}/${totalToFill}: ${formattedCode}`);
        onLog(`[Choice ${i + 1}/${totalToFill}] Searching Choice Code: ${formattedCode}`);

        // Clear existing input
        await searchInput.fill('');
        await searchInput.fill(formattedCode);
        await searchInput.press('Enter');
        await candidatePage.waitForTimeout(1200);

        // Find Grid Row
        const row = candidatePage.locator('[role="row"], .MuiDataGrid-row').filter({ hasText: formattedCode }).first();
        if (await row.isVisible().catch(() => false)) {
          const checkbox = row.locator('input[type="checkbox"]').first();
          if (await checkbox.isVisible().catch(() => false)) {
            const isChecked = await checkbox.isChecked().catch(() => false);
            if (!isChecked) {
              await checkbox.check({ force: true });
              successfullySelectedCount++;
              onLog(`✅ Choice ${i + 1}/${totalToFill} (${formattedCode}) [PDF #${pdfPrefNo}] selected.`);
            } else {
              onLog(`ℹ️ Choice ${i + 1}/${totalToFill} (${formattedCode}) [PDF #${pdfPrefNo}] is already selected.`);
            }
          } else {
            onLog(`⚠️ Warning: Checkbox not visible for Choice Code ${formattedCode}`);
            failedChoices.push(formattedCode);
          }
        } else {
          onLog(`⚠️ Warning: Choice Code ${formattedCode} not found in search grid.`);
          failedChoices.push(formattedCode);
        }

        // Clear search input using 'x' button or manually to revert filter
        const clearBtn = candidatePage.locator('button[aria-label="Clear"]').first();
        if (await clearBtn.isVisible().catch(() => false)) {
          await clearBtn.click({ force: true });
          await candidatePage.waitForTimeout(400);
        }
      }

      // Step 10: Click Save and Proceed at the bottom
      onLog('[Step 11] All choices selected! Saving option form...');
      onProgress(95, 'Saving Option Form');
      const saveProceedBtn = candidatePage.locator('button:has-text("Save and Proceed"), input[value*="Save and Proceed"]').first();
      await saveProceedBtn.click({ force: true });
      await candidatePage.waitForTimeout(3000);

      // Save proof screenshot
      await candidatePage.screenshot({ path: screenshotPath });

      onLog(`🎉 ALL ${successfullySelectedCount}/${totalToFill} CHOICE CODES PROCESSED FOR DSE CANDIDATE ${config.studentName}!`);
      onProgress(100, 'Completed');
      await browser.close();
      return {
        success: true,
        screenshotUrl: `/screenshots/${screenshotFileName}`,
        failedChoices
      };

    } else {
      // Step 5: Click Bachelor of Engineering & Attach New Tab
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
              await candidatePage.waitForURL(/frmSetPreferences/i, { timeout: 15000 }).catch(() => {});
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
          await candidatePage.waitForURL(/frmOptionFormSummary/i, { timeout: 15000 }).catch(() => {});
        }

        // Step 9: Click Insert Choice Code Directly on Option Form Summary
        if (candidatePage.url().includes('frmOptionFormSummary')) {
          onLog('[Step 10] Clicking "Insert Choice Code Directly"...');
          const insertDirectBtn = candidatePage.locator('input#rightContainer_ContentTable3_btnInsertDirect, input[value*="Insert Choice Code Directly"]').first();
          await insertDirectBtn.click({ force: true });
          await candidatePage.waitForURL(/frmInsertChoiceCodeDirect/i, { timeout: 15000 }).catch(() => {});
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
      const failedChoices: string[] = [];

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
        
        // Dynamic Wait: Watch for the POST response from the MHT CET server
        const responsePromise = candidatePage.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
        await verifyBtn.click({ force: true });
        await responsePromise; // Wait until the server actually replies
        await candidatePage.waitForTimeout(400); // Small buffer for DOM to render the new details or error message

        // Check if choice code is already inserted, invalid, or ineligible
        const errorTextLoc = candidatePage.locator('text=Invalid Choice Code or You are not eligible, text=Already Choice Code inserted, text=already inserted').first();
        const isErrorOrAdded = await errorTextLoc.isVisible().catch(() => false);

        if (isErrorOrAdded) {
          failedChoices.push(formattedCode);
          onLog(`⚠️ Choice ${i + 1}/${totalToFill} [PDF #${pdfPrefNo}] (${formattedCode}): Unavailable / Already Added. Skipping...`);
          continue;
        }

        // Click Insert Choice Code
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

      // Step 11: Final Save & Proceed using exact requested locator
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

      // Step 12: Verify Inserted Choices on Summary Page
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

      // Capture Verification Screenshot
      await candidatePage.screenshot({ path: screenshotPath });

      onLog(`🎉 ALL ${totalToFill} CHOICES PROCESSED (${successfullyInsertedCount} NEWLY INSERTED) & OPTION FORM SAVED FOR ${config.studentName}!`);
      onProgress(100, 'Completed');

      await browser.close();
      return {
        success: true,
        screenshotUrl: `/screenshots/${screenshotFileName}`,
        failedChoices
      };
    }

  } catch (err: any) {
    onLog(`❌ Worker Exception: ${err.message}`);
    if (candidatePage) {
      const errScreenshot = `screenshots/error_${config.studentId}.png`;
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
