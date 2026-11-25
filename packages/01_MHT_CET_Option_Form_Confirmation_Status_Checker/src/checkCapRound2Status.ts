/**
 * checkCapRound2Status.ts
 *
 * Bulk-checks the "Option Form for CAP Round-X" status (Confirmed / Incomplete)
 * for every student listed in data/LOGIN_ID___PASSWORD.xlsx, by logging into the
 * MHT CET candidate portal for each student and reading the status banner on the
 * candidate dashboard Home page. The round (I / II / III / IV) is selected via an
 * interactive prompt, a CLI arg, or the CAP_ROUND env var (default: Round-III);
 * only the selected round is checked.
 *
 * Reuses the exact login + navigation flow already proven in src/automationEngine.ts
 * (Auth page -> CAP Registration -> Technical Education -> Bachelor of Engineering ->
 * Candidate Dashboard), then stops at the Home page instead of filling choices.
 *
 * Usage:
 *   npx tsx src/checkCapRound2Status.ts                (prompts for round)
 *   npx tsx src/checkCapRound2Status.ts --round=III    (skips prompt)
 *
 * Input:
 *   data/LOGIN_ID___PASSWORD.xlsx   (columns: REGNO, NAME, LOGIN ID, PASSWORD)
 *
 * Output:
 *   output/CAP_Round<ROUND>_Status_Report.xlsx   (written incrementally, safe to resume)
 *   output/status_checkpoint_round_<ROUND>.json  (progress checkpoint, used to resume)
 *   screenshots/status_Round<ROUND>_<REGNO>.png  (evidence screenshot per student)
 */

import { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import XLSX from 'xlsx';
import { launchVisibleBrowser } from './browserLauncher';

const AUTH_URL =
  'https://auth-2026.maharashtracet.org/realms/mh-cet/protocol/openid-connect/auth?client_id=central-launchpad&redirect_uri=https%3A%2F%2Fportal-2026.maharashtracet.org%2F&state=2ac5d55f-9bf4-4304-85f1-adab12fc3157&response_mode=fragment&response_type=code&scope=openid&nonce=870dfa35-13ca-4ec4-83a4-527df1a46295';

export type CapRound = 'I' | 'II' | 'III' | 'IV';

// Parse round from CLI args (e.g. `npx tsx src/checkCapRound2Status.ts III` or `--round=III` or env CAP_ROUND)
function parseTargetRound(): CapRound {
  const args = process.argv.slice(2);
  let raw = process.env.CAP_ROUND || '';
  for (const arg of args) {
    if (arg.startsWith('--round=')) {
      raw = arg.split('=')[1];
    } else if (arg === '--round' || arg === '-r') {
      const next = args[args.indexOf(arg) + 1];
      if (next) raw = next;
    } else if (['I', 'II', 'III', 'IV', '1', '2', '3', '4'].includes(arg.toUpperCase())) {
      raw = arg;
    }
  }

  const upper = raw.toUpperCase().trim();
  if (upper === 'I' || upper === '1') return 'I';
  if (upper === 'II' || upper === '2') return 'II';
  if (upper === 'IV' || upper === '4') return 'IV';
  return 'III'; // Default is Round-III
}

// If no round was passed via CLI args / env, ask the user to select one.
async function resolveTargetRound(): Promise<CapRound> {
  const args = process.argv.slice(2);
  const hasExplicitRound = args.some(
    (a) =>
      a.startsWith('--round=') ||
      a === '--round' ||
      a === '-r' ||
      ['I', 'II', 'III', 'IV', '1', '2', '3', '4'].includes(a.toUpperCase())
  );

  if (hasExplicitRound || process.env.CAP_ROUND) {
    return parseTargetRound();
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('Select CAP round to check status — [I] Round-I, [II] Round-II, [III] Round-III, [IV] Round-IV (default: III): ', resolve);
  });
  rl.close();

  const upper = answer.trim().toUpperCase();
  if (upper === 'I' || upper === '1') return 'I';
  if (upper === 'II' || upper === '2') return 'II';
  if (upper === 'IV' || upper === '4') return 'IV';
  return 'III';
}

const INPUT_XLSX = path.join(__dirname, '..', 'data', 'LOGIN_ID___PASSWORD.xlsx');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

function outputXlsx(round: CapRound): string {
  return path.join(OUTPUT_DIR, `CAP_Round${round}_Status_Report.xlsx`);
}

function checkpointJson(round: CapRound): string {
  return path.join(OUTPUT_DIR, `status_checkpoint_round_${round}.json`);
}

type StatusResult =
  | 'Confirmed'
  | 'Not Confirmed'
  | 'Login Failed'
  | 'Missing Credentials'
  | 'Error';

interface StudentRow {
  regNo: string;
  name: string;
  loginId: string;
  password: string;
}

interface ResultRow extends StudentRow {
  status: StatusResult;
  statusText: string;
  checkedAt: string;
}

function ensureDirs() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function readStudents(): StudentRow[] {
  const wb = XLSX.readFile(INPUT_XLSX);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows.map((r) => ({
    regNo: String(r['REGNO'] ?? '').trim(),
    name: String(r['NAME'] ?? '').trim(),
    // Header in the source file has a trailing space: "LOGIN ID "
    loginId: String(r['LOGIN ID '] ?? r['LOGIN ID'] ?? '').trim(),
    password: String(r['PASSWORD'] ?? '').trim()
  }));
}

function loadCheckpoint(round: CapRound): Record<string, ResultRow> {
  const file = checkpointJson(round);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveCheckpoint(results: Record<string, ResultRow>, round: CapRound) {
  fs.writeFileSync(checkpointJson(round), JSON.stringify(results, null, 2));
}

function writeExcel(results: Record<string, ResultRow>, round: CapRound) {
  // Keep original REGNO order from the input file, not insertion/completion order.
  const order = readStudents().map((s) => s.regNo);
  const rows = order.map((regNo) => results[regNo]).filter(Boolean) as ResultRow[];

  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      REGNO: r.regNo,
      NAME: r.name,
      'LOGIN ID': r.loginId,
      [`CAP ROUND-${round} STATUS`]: r.status, // Confirmed / Not Confirmed / Login Failed / Missing Credentials / Error
      'RAW STATUS TEXT': r.statusText,
      'CHECKED AT': r.checkedAt
    }))
  );
  ws['!cols'] = [
    { wch: 12 },
    { wch: 32 },
    { wch: 30 },
    { wch: 20 },
    { wch: 50 },
    { wch: 22 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `CAP Round-${round} Status`);
  XLSX.writeFile(wb, outputXlsx(round));
}

/**
 * Logs in and navigates to the candidate dashboard Home page.
 * Returns the candidate dashboard page, or null if login failed.
 */
async function loginAndReachDashboard(
  page: Page,
  context: any,
  loginId: string,
  password: string
): Promise<{ dashboard: Page | null; error?: string }> {
  await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded' });

  const emailInput = page.locator('input[name="username"], input#username, input[type="text"]').first();
  await emailInput.fill(loginId);

  const passwordInput = page.locator('input[name="password"], input#password, input[type="password"]').first();
  await passwordInput.fill(password);

  const signInBtn = page.locator('button:has-text("Sign In"), input[type="submit"]:has-text("Sign In")').first();
  await signInBtn.click();

  try {
    await page.waitForURL(/portal-2026\.maharashtracet\.org/i, { timeout: 15000 });
  } catch {
    // fall through; checked below
  }

  const isPortalHome = page.url().includes('portal-2026.maharashtracet.org');
  const loginErrorLoc = page
    .locator('text=Invalid username or password, .alert-danger, .alert-error')
    .first();
  const isErrorVisible = await loginErrorLoc.isVisible().catch(() => false);

  if (!isPortalHome || isErrorVisible) {
    return { dashboard: null, error: 'Invalid username or password, or auth server rejected login.' };
  }

  await page.waitForTimeout(2500);

  // Click CAP Registration card
  const capContainer = page
    .locator('div')
    .filter({ hasText: /^Centralized Admission Process \(CAP\) Registration/ })
    .first();
  if (!(await capContainer.isVisible().catch(() => false))) {
    return { dashboard: null, error: 'CAP Registration card not visible on portal home.' };
  }
  await capContainer.click({ force: true });
  await page.waitForTimeout(1000);

  // Technical Education
  const techEdu = page.locator('text="Technical Education"').first();
  await techEdu.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await techEdu.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);

  // Bachelor of Engineering -> opens candidate dashboard in a new tab
  const beCard = page.locator('text="Bachelor of Engineering"').first();
  await beCard.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

  const [candidatePage] = await Promise.all([
    context.waitForEvent('page'),
    beCard.click({ force: true })
  ]);

  await candidatePage.waitForLoadState('domcontentloaded');
  await candidatePage.waitForTimeout(2000);

  return { dashboard: candidatePage };
}

/**
 * Reads the "Status of Option Form Submission and Confirmation for CAP Round – [Round]"
 * section on the candidate dashboard Home page and classifies it as Confirmed / Not Confirmed.
 *
 * Confirmed wording (green):     "Option Form for CAP Round-X is Confirmed"
 * Not-confirmed wording (red):   "Complete Option Form for CAP Round-X. Now confirm it"
 */
async function readRoundStatus(dashboard: Page, round: CapRound = 'III'): Promise<{ status: StatusResult; statusText: string }> {
  // Ensure we are on the Home page tab where status banners are displayed
  const homeLink = dashboard.locator('a:has-text("Home"), button:has-text("Home"), li:has-text("Home") a').first();
  if (await homeLink.isVisible().catch(() => false)) {
    await homeLink.click().catch(() => {});
    await dashboard.waitForTimeout(1000);
  }

  // Scroll through the page so lazily-rendered sections are present in the DOM.
  await dashboard.mouse.wheel(0, 3000).catch(() => {});
  await dashboard.waitForTimeout(800);
  await dashboard.mouse.wheel(0, 3000).catch(() => {});
  await dashboard.waitForTimeout(800);

  const roundNumber = round === 'I'
    ? '(I|1)'
    : round === 'II'
      ? '(II|2)'
      : round === 'III'
        ? '(III|3)'
        : '(IV|4)';

  const roundLocator = dashboard.locator(
    `text=/CAP\\s*Round\\s*[-–]?\\s*${roundNumber}\\b/i`
  );

  let count = await roundLocator.count().catch(() => 0);
  let combinedText = '';
  for (let i = 0; i < count; i++) {
    const text = (await roundLocator.nth(i).innerText().catch(() => '')) || '';
    combinedText += (combinedText ? ' | ' : '') + text.trim();
  }

  if (count === 0) {
    const fallbackLocator = dashboard.locator(`text=/Round\\s*[-–]?\\s*${roundNumber}\\b/i`);
    const fbCount = await fallbackLocator.count().catch(() => 0);
    for (let i = 0; i < fbCount; i++) {
      const text = (await fallbackLocator.nth(i).innerText().catch(() => '')) || '';
      combinedText += (combinedText ? ' | ' : '') + text.trim();
    }
    count = fbCount;
  }

  if (count === 0) {
    return { status: 'Not Confirmed', statusText: `(CAP Round-${round} section not found on dashboard)` };
  }

  const isConfirmed = /is\s+confirmed/i.test(combinedText);

  // Scroll the status element directly into view
  if (count > 0) {
    await roundLocator.first().scrollIntoViewIfNeeded().catch(() => {});
    await dashboard.waitForTimeout(600);
  }

  return {
    status: isConfirmed ? 'Confirmed' : 'Not Confirmed',
    statusText: combinedText
  };
}

async function main() {
  const TARGET_ROUND = await resolveTargetRound();
  ensureDirs();

  const students = readStudents();
  const results = loadCheckpoint(TARGET_ROUND);

  console.log(`======================================================`);
  console.log(`🎯 CHECKING CAP ROUND-${TARGET_ROUND} STATUS FOR STUDENTS`);
  console.log(`📂 Input: ${INPUT_XLSX}`);
  console.log(`📊 Output: ${outputXlsx(TARGET_ROUND)}`);
  console.log(`📋 Checkpoint: ${checkpointJson(TARGET_ROUND)}`);
  console.log(`Loaded ${students.length} students. Already checked: ${Object.keys(results).length}`);
  console.log(`======================================================\n`);

  const { browser } = await launchVisibleBrowser((msg) => console.log(msg));

  let processed = 0;

  for (const student of students) {
    if (results[student.regNo]) {
      continue; // already checked in a previous run
    }

    if (!student.loginId || !student.password) {
      results[student.regNo] = {
        ...student,
        status: 'Missing Credentials',
        statusText: '',
        checkedAt: new Date().toISOString()
      };
      console.log(`[SKIP] ${student.regNo} ${student.name}: missing credentials`);
      continue;
    }

    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    console.log(`[CHECK ROUND-${TARGET_ROUND}] ${student.regNo} ${student.name} (${student.loginId})`);

    try {
      const { dashboard, error } = await loginAndReachDashboard(
        page,
        context,
        student.loginId,
        student.password
      );

      if (!dashboard) {
        results[student.regNo] = {
          ...student,
          status: 'Login Failed',
          statusText: error || '',
          checkedAt: new Date().toISOString()
        };
        console.log(`  -> Login Failed: ${error}`);
      } else {
        const { status, statusText } = await readRoundStatus(dashboard, TARGET_ROUND);
        results[student.regNo] = {
          ...student,
          status,
          statusText,
          checkedAt: new Date().toISOString()
        };
        console.log(`  -> ${status}${statusText ? ` (${statusText.slice(0, 80)})` : ''}`);

        const shotPath = path.join(SCREENSHOTS_DIR, `status_Round${TARGET_ROUND}_${student.regNo}.png`);
        await dashboard.screenshot({ path: shotPath }).catch(() => {});
      }
    } catch (err: any) {
      results[student.regNo] = {
        ...student,
        status: 'Error',
        statusText: err?.message || String(err),
        checkedAt: new Date().toISOString()
      };
      console.log(`  -> Error: ${err?.message}`);
    } finally {
      await context.close().catch(() => {});
    }

    processed++;
    // Persist progress every student so a crash never loses more than one record.
    saveCheckpoint(results, TARGET_ROUND);
    writeExcel(results, TARGET_ROUND);

    // Small delay to avoid hammering the government server.
    await new Promise((r) => setTimeout(r, 1500));
  }

  await browser.close().catch(() => {});

  console.log(`\nDone. Checked ${processed} new students this run.`);
  console.log(`Report: ${outputXlsx(TARGET_ROUND)}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
