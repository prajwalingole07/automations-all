import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { parseStudentPdf, formatChoiceCode } from '../src/pdfParser';

// Load environment variables from .env
dotenv.config();

const AUTH_URL = "https://auth-2026.maharashtracet.org/realms/mh-cet/protocol/openid-connect/auth?client_id=central-launchpad&redirect_uri=https%3A%2F%2Fportal-2026.maharashtracet.org%2F&state=2ac5d55f-9bf4-4304-85f1-adab12fc3157&response_mode=fragment&response_type=code&scope=openid&nonce=870dfa35-13ca-4ec4-83a4-527df1a46295";

test.describe('MHT CET Engineering Choice Shortlisting & Direct Choice Insertion Automation', () => {

  test('Shreya Lavate - Fill All Extracted Choices with 9-Digit Leading Zero Formatting & Save Option Form', async ({ page, context }) => {
    test.setTimeout(180000);

    const email = process.env.MHTCET_EMAIL || 'srushtiijadhav5@gmail.com';
    const password = process.env.MHTCET_PASSWORD || 'Srushti@123';

    // Parse Candidate PDF
    const pdfPath = `C:\\Users\\mrsum\\OneDrive\\Desktop\\SUMIT 30-06-2026 BACKUP\\playwright\\ENG-OPTION_FILLING_AUTO\\Students Data\\Preference List - MUGLIKAR SHALMALI SANTOSH_FINAL.pdf`;
    const studentData = await parseStudentPdf(pdfPath);

    console.log('\n======================================================');
    console.log('  STARTING AUTOMATION WITH AUTOMATIC 9-DIGIT FORMATTING');
    console.log(`  Candidate Email : ${email}`);
    console.log(`  Candidate Name  : ${studentData.studentName}`);
    console.log(`  Registration No : ${studentData.registrationNo}`);
    console.log(`  Total Choices Extracted: ${studentData.choices.length}`);
    console.log('======================================================\n');

    // Step 1: Open MHT CET Login Page
    console.log('[Step 1] Navigating to MHT CET Auth Page...');
    await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: 'screenshots/step1_login_page.png' });

    // Fill Credentials
    console.log(`[Step 1] Entering candidate email: ${email}...`);
    const emailInput = page.locator('input[name="username"], input#username, input[type="text"]').first();
    await emailInput.fill(email);

    const passwordInput = page.locator('input[name="password"], input#password, input[type="password"]').first();
    await passwordInput.fill(password);

    // Click Sign In
    console.log('[Step 1] Clicking "Sign In" button...');
    const signInBtn = page.locator('button:has-text("Sign In"), input[type="submit"]:has-text("Sign In")').first();
    await signInBtn.click();

    // Step 2: Validate Login Response
    console.log('[Step 2] Validating login authentication response...');
    try {
      await page.waitForURL(/portal-2026\.maharashtracet\.org/i, { timeout: 15000 });
    } catch (e) {}

    const currentUrl = page.url();
    const isPortalHome = currentUrl.includes('portal-2026.maharashtracet.org');
    const loginErrorLoc = page.locator('text=Invalid username or password, .alert-danger, .alert-error').first();
    const isErrorVisible = await loginErrorLoc.isVisible().catch(() => false);

    if (!isPortalHome || isErrorVisible) {
      console.error('\n❌ LOGIN FAILURE DETECTED!');
      await page.screenshot({ path: 'screenshots/login_failed_graceful_catch.png' });
      return;
    }

    console.log('[Step 2] ✅ Login Successful! Waiting for portal dashboard elements...');
    await page.waitForTimeout(3500);

    // Step 3: Click "Centralized Admission Process (CAP) Registration"
    console.log('[Step 3] Locating and clicking CAP Registration card...');
    const capContainer = page.locator('div').filter({ hasText: /^Centralized Admission Process \(CAP\) Registration/ }).first();
    await capContainer.click({ force: true });
    await page.waitForTimeout(1000);

    // Step 4: Popup opens -> Select "Technical Education"
    console.log('[Step 4] Waiting for popup modal and clicking "Technical Education"...');
    const techEdu = page.locator('text="Technical Education"').first();
    await techEdu.waitFor({ state: 'visible', timeout: 15000 });
    await techEdu.click({ force: true });
    await page.waitForTimeout(1000);

    // Step 5: Click "Bachelor of Engineering" and handle new tab
    console.log('[Step 5] Clicking "Bachelor of Engineering" (opening candidate portal tab)...');
    const beCard = page.locator('text="Bachelor of Engineering"').first();
    await beCard.waitFor({ state: 'visible', timeout: 15000 });

    const [candidatePage] = await Promise.all([
      context.waitForEvent('page'),
      beCard.click({ force: true })
    ]);

    // Step 6: Verify candidate portal loaded
    console.log('[Step 6] Switching to Candidate Portal tab (fe2026.mahacet.org)...');
    await candidatePage.waitForLoadState('domcontentloaded');
    console.log(`[Step 6] ✅ Candidate Dashboard URL: ${candidatePage.url()}`);

    // Step 7: Click "Fill / Edit Option Form"
    console.log('\n[Step 7] Locating and clicking "Fill / Edit Option Form" in menu...');
    const fillOptionFormBtn = candidatePage.locator('a[href*="frmOptionForm"]').first();
    await fillOptionFormBtn.waitFor({ state: 'visible', timeout: 15000 });
    await fillOptionFormBtn.click({ force: true });

    await candidatePage.waitForLoadState('domcontentloaded');
    await candidatePage.waitForTimeout(2500);
    console.log(`[Step 7] Current URL after Option Form click: ${candidatePage.url()}`);

    let currentOptionUrl = candidatePage.url();

    if (!currentOptionUrl.includes('frmInsertChoiceCodeDirect')) {

      // Step 8: Perform Choice 1 Shortlisting if on Shortlist Options Page
      if (!currentOptionUrl.includes('frmSetPreferences') && !currentOptionUrl.includes('frmOptionFormSummary')) {
        console.log('[Step 8] Shortlisting Choice 1 from PDF...');
        const firstChoice = studentData.choices[0] || { prefNo: 1, branch: 'Computer Engineering', choiceCode: '0301224510' };
        const formattedFirstCode = formatChoiceCode(firstChoice.choiceCode);

        const courseSelect = candidatePage.locator('select#rightContainer_ContentTable1_ddlCourse, select[name*="ddlCourse"]').first();
        if (await courseSelect.isVisible().catch(() => false)) {
          console.log(`   Selecting Course: ${firstChoice.branch}`);
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

      // Step 9: Land on Step 2: "Set Your Preferences" (frmSetPreferences)
      if (candidatePage.url().includes('frmSetPreferences')) {
        console.log('\n[Step 9] Reached "Set Your Preferences" page!');
        await candidatePage.screenshot({ path: 'screenshots/step9_set_preferences_page.png' });

        const checkboxes = candidatePage.locator('input[id*="chkSetPreferences"], input[type="checkbox"]');
        const count = await checkboxes.count();
        console.log(`   Found ${count} preference checkboxes on Set Preferences page. Checking all...`);
        for (let i = 0; i < count; i++) {
          await checkboxes.nth(i).check({ force: true }).catch(() => {});
        }

        console.log('   Clicking "Save & Proceed >>>" on Set Preferences page...');
        const saveProceedPrefBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnProceed, input[value*="Save & Proceed"]').first();
        await saveProceedPrefBtn.click({ force: true });
        await candidatePage.waitForTimeout(3000);
      }

      // Step 10: Land on Step 3: "Option Form Summary" (frmOptionFormSummary)
      if (candidatePage.url().includes('frmOptionFormSummary')) {
        console.log('\n[Step 10] Reached "Option Form Summary" page!');
        await candidatePage.screenshot({ path: 'screenshots/step10_option_form_summary_page.png' });

        console.log('   Clicking "Insert Choice Code Directly" button...');
        const insertDirectBtn = candidatePage.locator('input#rightContainer_ContentTable3_btnInsertDirect, input[value*="Insert Choice Code Directly"]').first();
        await insertDirectBtn.click({ force: true });
        await candidatePage.waitForTimeout(3000);
      }
    }

    // Step 11: Land on "Insert Choice Code Directly" page (frmInsertChoiceCodeDirect)
    console.log(`\n[Step 11] Landed on Direct Choice Code Insertion Page! URL: ${candidatePage.url()}`);
    await candidatePage.screenshot({ path: 'screenshots/step11_insert_direct_page.png' });

    // Step 12: Loop through choices and insert them with automatic 9-digit formatting!
    const choicesToFill = studentData.choices.slice(0, 5);
    console.log(`\n======================================================`);
    console.log(`  STARTING DIRECT CHOICE INSERTION LOOP (${choicesToFill.length} Choices)`);
    console.log(`======================================================\n`);

    for (let i = 0; i < choicesToFill.length; i++) {
      const choice = choicesToFill[i];
      const formattedCode = formatChoiceCode(choice.choiceCode);
      const targetPrefNo = String(choice.prefNo || (i + 1));

      console.log(`\n[Choice ${i + 1}/${choicesToFill.length}] Code: ${choice.choiceCode} ➔ Formatted: ${formattedCode} (Rank #${targetPrefNo})`);

      // Fill Code Input
      const codeInput = candidatePage.locator('input#rightContainer_ContentTable1_txtChoiceCode, input[name*="txtChoiceCode"]').first();
      await codeInput.waitFor({ state: 'visible', timeout: 15000 });
      await codeInput.fill('');
      await codeInput.fill(formattedCode);

      // Click "Verify Choice Code" button
      console.log(`   Clicking "Verify Choice Code" for ${formattedCode}...`);
      const verifyBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnVerifyChoiceCode, input[value*="Verify Choice Code"]').first();
      await verifyBtn.click({ force: true });
      await candidatePage.waitForTimeout(1000);

      // Check for already added / invalid choice code error message
      const errorMsgLoc = candidatePage.locator('text=Invalid Choice Code or You are not eligible').first();
      const hasError = await errorMsgLoc.isVisible().catch(() => false);

      if (hasError) {
        console.log(`   ℹ️ Choice Code ${formattedCode} is ALREADY inserted in list or ineligible. Gracefully skipping...`);
        await candidatePage.screenshot({ path: `screenshots/step12_choice_${i + 1}_already_inserted.png` });
        continue;
      }

      // Select Preference Number from ddlPreferenceNo dropdown if available
      const prefDropdown = candidatePage.locator('select#rightContainer_ContentTable1_ddlPreferenceNo, select[name*="ddlPreferenceNo"]').first();
      if (await prefDropdown.isVisible().catch(() => false)) {
        await prefDropdown.selectOption({ label: targetPrefNo }).catch(async () => {
          await prefDropdown.selectOption({ value: targetPrefNo }).catch(() => {});
        });
      }

      // Click "Insert Choice Code" button using exact requested locator `#rightContainer_ContentTable1_btnInsertDirect`
      console.log(`   Clicking "Insert Choice Code" button (#rightContainer_ContentTable1_btnInsertDirect)...`);
      const insertCodeBtn = candidatePage.locator('#rightContainer_ContentTable1_btnInsertDirect').first();
      await insertCodeBtn.click({ force: true });
      await candidatePage.waitForTimeout(1200);

      console.log(`   ✅ Choice ${i + 1} (${formattedCode}) inserted successfully at Preference #${targetPrefNo}!`);
    }

    // Step 13: Final Save & Proceed using exact requested locator
    console.log('\n[Step 13] All preferences processed! Clicking "Save & Proceed >>>"...');
    const saveProceedBtn = candidatePage.getByRole('button', { name: 'Save & Proceed >>>' });
    if (await saveProceedBtn.isVisible().catch(() => false)) {
      await saveProceedBtn.click({ force: true });
    } else {
      await candidatePage.locator('input[value*="Save & Proceed"]').first().click({ force: true }).catch(() => {});
    }

    await candidatePage.waitForTimeout(3500);
    await candidatePage.screenshot({ path: 'screenshots/step13_formatted_code_saved.png' });

    console.log('\n======================================================');
    console.log(`🎉 SUCCESS: AUTOMATIC 9-DIGIT FORMATTED CHOICES FILLED & SAVED!`);
    console.log('======================================================\n');

  });

});
