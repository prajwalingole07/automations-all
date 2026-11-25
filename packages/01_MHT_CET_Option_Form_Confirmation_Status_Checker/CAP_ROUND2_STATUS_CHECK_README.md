# CAP Round Status Checker (Rounds I, II, III, IV)

This provides bulk status checking of candidate option forms across all CAP rounds (Round-I, Round-II, Round-III, Round-IV), with default active support for **CAP Round-III**.

It reuses the exact login/navigation flow already proven in `src/automationEngine.ts`, logs in as each student from `data/LOGIN_ID___PASSWORD.xlsx` (or uploaded Excel), stops at the candidate dashboard Home page, and reads the option-form confirmation status for the selected round.

## Running via CLI

When you run the checker without any round argument, it will **prompt you to select the round** (`I / II / III / IV`, default is **Round-III**):

```bash
npm run check-status
```

You can also skip the prompt and pass the round directly:

```bash
# Shortcut scripts
npm run check-status:round1
npm run check-status:round2
npm run check-status:round3   # default / Round-III
npm run check-status:round4

# Or explicit flags
npx tsx src/checkCapRound2Status.ts --round=I
npx tsx src/checkCapRound2Status.ts --round=II
npx tsx src/checkCapRound2Status.ts --round=III
npx tsx src/checkCapRound2Status.ts --round=IV
```

Whichever round is selected, **only that round's status is checked** for every student (one-by-one), and a separate report/checkpoint is written per round.

Outputs generated:
- `output/CAP_Round<ROUND>_Status_Report.xlsx` — Excel report with REGNO, Name, Login ID, Status, Raw Text, Timestamp.
- `output/status_checkpoint_round_<ROUND>.json` — Safe checkpoint to resume if interrupted.
- `screenshots/status_Round<ROUND>_<REGNO>.png` — Verification proof screenshot per student.

## Running via Web Portal

1. Start the web portal:
   ```bash
   npm start
   ```
2. Open `http://localhost:3000` in your browser.
3. Select your desired round in the **CAP Round** dropdown (`Round-I`, `Round-II`, `Round-III`, `Round-IV`).
4. Click **Check CAP Round-III Status (All)** (or whichever round is selected) to run status checks for all students in sequence.
5. Click **Export Status Report** to download `CAP_Round_<ROUND>_Status_Report.xlsx`.


`data/LOGIN_ID___PASSWORD.xlsx`, `.env`, `students_db.json`, and `screenshots/` all
contain real student login credentials or personal admission data. I've added these
to `.gitignore` so they're never accidentally committed. Treat this machine/folder as
sensitive, and delete the credentials file once the status check is complete if it's
not needed long-term.
