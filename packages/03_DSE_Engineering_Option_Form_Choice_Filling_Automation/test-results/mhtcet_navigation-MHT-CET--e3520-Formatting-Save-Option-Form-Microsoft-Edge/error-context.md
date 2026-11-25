# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mhtcet_navigation.spec.ts >> MHT CET Engineering Choice Shortlisting & Direct Choice Insertion Automation >> Shreya Lavate - Fill All Extracted Choices with 9-Digit Leading Zero Formatting & Save Option Form
- Location: tests\mhtcet_navigation.spec.ts:14:7

# Error details

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import dotenv from 'dotenv';
  3   | import path from 'path';
  4   | import fs from 'fs';
  5   | import { parseStudentPdf, formatChoiceCode } from '../src/pdfParser';
  6   | 
  7   | // Load environment variables from .env
  8   | dotenv.config();
  9   | 
  10  | const AUTH_URL = "https://auth-2026.maharashtracet.org/realms/mh-cet/protocol/openid-connect/auth?client_id=central-launchpad&redirect_uri=https%3A%2F%2Fportal-2026.maharashtracet.org%2F&state=2ac5d55f-9bf4-4304-85f1-adab12fc3157&response_mode=fragment&response_type=code&scope=openid&nonce=870dfa35-13ca-4ec4-83a4-527df1a46295";
  11  | 
  12  | test.describe('MHT CET Engineering Choice Shortlisting & Direct Choice Insertion Automation', () => {
  13  | 
  14  |   test('Shreya Lavate - Fill All Extracted Choices with 9-Digit Leading Zero Formatting & Save Option Form', async ({ page, context }) => {
  15  |     test.setTimeout(180000);
  16  | 
  17  |     const email = process.env.MHTCET_EMAIL || 'shreyappatil7@gmail.com';
  18  |     const password = process.env.MHTCET_PASSWORD || 'Pass@123';
  19  | 
  20  |     // Parse Candidate PDF
  21  |     let pdfPath = `C:\\Users\\mrsum\\OneDrive\\Desktop\\SUMIT 30-06-2026 BACKUP\\playwright\\ENG-OPTION_FILLING_AUTO\\Students Data\\Preference List - MUGLIKAR SHALMALI SANTOSH_FINAL.pdf`;
  22  |     if (!fs.existsSync(pdfPath)) {
  23  |       const localFolder = path.join(__dirname, '..', 'STUDENTS PREFERENCE LIST');
  24  |       if (fs.existsSync(localFolder)) {
  25  |         const files = fs.readdirSync(localFolder).filter(f => f.endsWith('.pdf'));
  26  |         if (files.length > 0) {
  27  |           pdfPath = path.join(localFolder, files[0]);
  28  |         }
  29  |       }
  30  |     }
  31  |     const studentData = await parseStudentPdf(pdfPath);
  32  | 
  33  |     console.log('\n======================================================');
  34  |     console.log('  STARTING AUTOMATION WITH AUTOMATIC 9-DIGIT FORMATTING');
  35  |     console.log(`  Candidate Email : ${email}`);
  36  |     console.log(`  Candidate Name  : ${studentData.studentName}`);
  37  |     console.log(`  Registration No : ${studentData.registrationNo}`);
  38  |     console.log(`  Total Choices Extracted: ${studentData.choices.length}`);
  39  |     console.log('======================================================\n');
  40  | 
  41  |     // Step 1: Open MHT CET Login Page
  42  |     console.log('[Step 1] Navigating to MHT CET Auth Page...');
  43  |     await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded' });
  44  |     await page.screenshot({ path: 'screenshots/step1_login_page.png' });
  45  | 
  46  |     // Fill Credentials
  47  |     console.log(`[Step 1] Entering candidate email: ${email}...`);
  48  |     const emailInput = page.locator('input[name="username"], input#username, input[type="text"]').first();
  49  |     await emailInput.fill(email);
  50  | 
  51  |     const passwordInput = page.locator('input[name="password"], input#password, input[type="password"]').first();
  52  |     await passwordInput.fill(password);
  53  | 
  54  |     // Click Sign In
  55  |     console.log('[Step 1] Clicking "Sign In" button...');
  56  |     const signInBtn = page.locator('button:has-text("Sign In"), input[type="submit"]:has-text("Sign In")').first();
  57  |     await signInBtn.click();
  58  | 
  59  |     // Step 2: Validate Login Response
  60  |     console.log('[Step 2] Validating login authentication response...');
  61  |     try {
  62  |       await page.waitForURL(/portal-2026\.maharashtracet\.org/i, { timeout: 150000 });
  63  |     } catch (e) { }
  64  | 
  65  |     const currentUrl = page.url();
  66  |     const isPortalHome = currentUrl.includes('portal-2026.maharashtracet.org');
  67  |     const loginErrorLoc = page.locator('text=Invalid username or password, .alert-danger, .alert-error').first();
  68  |     const isErrorVisible = await loginErrorLoc.isVisible().catch(() => false);
  69  | 
  70  |     if (!isPortalHome || isErrorVisible) {
  71  |       console.error('\n❌ LOGIN FAILURE DETECTED!');
  72  |       await page.screenshot({ path: 'screenshots/login_failed_graceful_catch.png' });
  73  |       return;
  74  |     }
  75  | 
  76  |     console.log('[Step 2] ✅ Login Successful! Waiting for portal dashboard elements...');
> 77  |     await page.waitForTimeout(3500);
      |                ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  78  | 
  79  |     // Step 3: Click "Centralized Admission Process (CAP) Registration"
  80  |     console.log('[Step 3] Locating and clicking CAP Registration card...');
  81  |     const capContainer = page.locator('div').filter({ hasText: /^Centralized Admission Process \(CAP\) Registration/ }).first();
  82  |     await capContainer.click({ force: true });
  83  |     await page.waitForTimeout(1000);
  84  | 
  85  |     // Step 4: Popup opens -> Select "Technical Education"
  86  |     console.log('[Step 4] Waiting for popup modal and clicking "Technical Education"...');
  87  |     const techEdu = page.locator('text="Technical Education"').first();
  88  |     await techEdu.waitFor({ state: 'visible', timeout: 150000 });
  89  |     await techEdu.click({ force: true });
  90  |     await page.waitForTimeout(1000);
  91  | 
  92  |     // Step 5: Click "Bachelor of Engineering" and handle new tab
  93  |     console.log('[Step 5] Clicking "Bachelor of Engineering" (opening candidate portal tab)...');
  94  |     const beCard = page.locator('text="Bachelor of Engineering"').first();
  95  |     await beCard.waitFor({ state: 'visible', timeout: 150000 });
  96  | 
  97  |     const [candidatePage] = await Promise.all([
  98  |       context.waitForEvent('page'),
  99  |       beCard.click({ force: true })
  100 |     ]);
  101 | 
  102 |     // Step 6: Verify candidate portal loaded
  103 |     console.log('[Step 6] Switching to Candidate Portal tab (fe2026.mahacet.org)...');
  104 |     await candidatePage.waitForLoadState('domcontentloaded');
  105 |     console.log(`[Step 6] ✅ Candidate Dashboard URL: ${candidatePage.url()}`);
  106 | 
  107 |     // Step 7: Click "Fill / Edit Option Form"
  108 |     console.log('\n[Step 7] Locating and clicking "Fill / Edit Option Form" in menu...');
  109 |     const fillOptionFormBtn = candidatePage.locator('a[href*="frmOptionForm"]').first();
  110 |     await fillOptionFormBtn.waitFor({ state: 'visible', timeout: 1500000 });
  111 |     await fillOptionFormBtn.click({ force: true });
  112 | 
  113 |     await candidatePage.waitForLoadState('domcontentloaded');
  114 |     await candidatePage.waitForTimeout(2500);
  115 |     console.log(`[Step 7] Current URL after Option Form click: ${candidatePage.url()}`);
  116 | 
  117 |     let currentOptionUrl = candidatePage.url();
  118 | 
  119 |     if (!currentOptionUrl.includes('frmInsertChoiceCodeDirect')) {
  120 | 
  121 |       // Step 8: Perform Choice 1 Shortlisting if on Shortlist Options Page
  122 |       if (!currentOptionUrl.includes('frmSetPreferences') && !currentOptionUrl.includes('frmOptionFormSummary')) {
  123 |         console.log('[Step 8] Shortlisting Choice 1 from PDF...');
  124 |         const firstChoice = studentData.choices[0] || { prefNo: 1, branch: 'Computer Engineering', choiceCode: '0301224510' };
  125 |         const formattedFirstCode = formatChoiceCode(firstChoice.choiceCode);
  126 | 
  127 |         const courseSelect = candidatePage.locator('select#rightContainer_ContentTable1_ddlCourse, select[name*="ddlCourse"]').first();
  128 |         if (await courseSelect.isVisible().catch(() => false)) {
  129 |           console.log(`   Selecting Course: ${firstChoice.branch}`);
  130 |           await courseSelect.selectOption({ label: firstChoice.branch }).catch(async () => {
  131 |             const options = await courseSelect.locator('option').allInnerTexts();
  132 |             const match = options.find(opt => opt.toLowerCase().includes(firstChoice.branch.toLowerCase()));
  133 |             if (match) await courseSelect.selectOption({ label: match.trim() });
  134 |           });
  135 | 
  136 |           const searchInstBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnSearch, input[value*="Search"]').first();
  137 |           await searchInstBtn.click({ force: true });
  138 |           await candidatePage.waitForTimeout(3000);
  139 | 
  140 |           const targetRow = candidatePage.locator('tr').filter({ hasText: formattedFirstCode }).first();
  141 |           if (await targetRow.isVisible().catch(() => false)) {
  142 |             const checkbox = targetRow.locator('input[type="checkbox"]').first();
  143 |             await checkbox.check({ force: true });
  144 | 
  145 |             const addOptionsBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnAddOptions, input[value*="ADD"]').first();
  146 |             await addOptionsBtn.click({ force: true });
  147 |             await candidatePage.waitForTimeout(2500);
  148 | 
  149 |             const saveProceedBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnSaveProceed, input[value*="Save"]').first();
  150 |             await saveProceedBtn.click({ force: true });
  151 |             await candidatePage.waitForTimeout(3000);
  152 |           }
  153 |         }
  154 |       }
  155 | 
  156 |       // Step 9: Land on Step 2: "Set Your Preferences" (frmSetPreferences)
  157 |       if (candidatePage.url().includes('frmSetPreferences')) {
  158 |         console.log('\n[Step 9] Reached "Set Your Preferences" page!');
  159 |         await candidatePage.screenshot({ path: 'screenshots/step9_set_preferences_page.png' });
  160 | 
  161 |         const checkboxes = candidatePage.locator('input[id*="chkSetPreferences"], input[type="checkbox"]');
  162 |         const count = await checkboxes.count();
  163 |         console.log(`   Found ${count} preference checkboxes on Set Preferences page. Checking all...`);
  164 |         for (let i = 0; i < count; i++) {
  165 |           await checkboxes.nth(i).check({ force: true }).catch(() => { });
  166 |         }
  167 | 
  168 |         console.log('   Clicking "Save & Proceed >>>" on Set Preferences page...');
  169 |         const saveProceedPrefBtn = candidatePage.locator('input#rightContainer_ContentTable1_btnProceed, input[value*="Save & Proceed"]').first();
  170 |         await saveProceedPrefBtn.click({ force: true });
  171 |         await candidatePage.waitForTimeout(3000);
  172 |       }
  173 | 
  174 |       // Step 10: Land on Step 3: "Option Form Summary" (frmOptionFormSummary)
  175 |       if (candidatePage.url().includes('frmOptionFormSummary')) {
  176 |         console.log('\n[Step 10] Reached "Option Form Summary" page!');
  177 |         await candidatePage.screenshot({ path: 'screenshots/step10_option_form_summary_page.png' });
```