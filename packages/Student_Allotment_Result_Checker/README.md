# MHT-CET CAP All-Rounds Allotment Automation Tool

Automatically checks the **MHT-CET CAP allotment status (Round 1 / 2 / 3 / 4)** for every student in an Excel file, one-by-one, and generates a styled Excel report.

- **Desktop App** (Tkinter GUI with round selector + animations)
- **Web Dashboard Server** (works on any machine / server, reachable from other PCs)
- **CLI Batch Runner** (headless server mode)

Official allotment status portal: `https://fe2026.mahacet.org`

---

## 1. Install & Setup (Visual Studio Code)

```bash
cd E:\MHT_CAP_AllRounds_Allotment_Checker
pip install -r requirements.txt
playwright install chromium
```

> VS Code: press **F5** with the "Run GUI App (all rounds)" configuration (`.vscode/launch.json` is already included).

---

## 2. How the App Works

1. **Select Round (1 / 2 / 3 / 4)** — animated round cards on the welcome screen.
   - Round 1 → result is live.
   - Rounds 2/3/4 → flagged as **"Result not released yet"** (same as now for Round 2).
2. **Paste the check link** — the official per-round link is pre-filled automatically
   (`.../frmCheckAllotmentStatusCAPRound2?did=1250` for Round 2). When the official
   result goes live, just paste the exact link into the URL box (or click "Open in Browser" to verify).
3. **Select the students Excel** — auto-detects columns: `SRNO | NAME | APPLICATION NO (EN…) | DOB (DD/MM/YYYY)`.
4. Click **START ALLOTMENT CHECKING** — a Chrome browser opens and checks every
   student one-by-one (2–4 s each) with automatic retries.
5. Live dashboard shows Total / Completed / Remaining / Current Student / Speed / Elapsed / ETA,
   animated progress bar, and a color-coded live log.
6. **Report is saved after EVERY student** → `Output/Allotment_Report_R{round}.xlsx`
   (e.g. `Allotment_Report_R2.xlsx`). Re-running resumes from where it stopped.
7. Buttons: **Pause ⏸ / Resume ⏯ / Stop ⏹ / Open Output Folder / Open Log**, plus **⬅ Setup** to change round.

---

## 3. Run Modes

### A. Desktop App
```bash
python main.py
```

### B. Web Dashboard Server (use from any browser, or on a server PC)
```bash
python main.py --web
# or
python web_app.py
# reachable from other machines on the network:
python web_app.py --host 0.0.0.0 --port 5000
```
Open `http://localhost:5000` (or `http://<server-ip>:5000`). The web UI has the same
round selector, URL box, Excel upload, live metrics, animated progress and terminal.

### C. CLI Batch Runner (headless server / task scheduler)
```bash
python run_server.py --round 2 --input "E:\Students.xlsx"
python run_server.py --round 2 --input "E:\Students.xlsx" --url "https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound2?did=1250"
python run_server.py --round 1 --input "E:\Students.xlsx" --visible
```

---

## 4. Round Links (auto-filled, editable)

| Round | Official link (pre-filled)                                      |
|-------|-----------------------------------------------------------------|
| 1     | https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound1?did=1250 |
| 2     | https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound2?did=1250 |
| 3     | https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound3?did=1250 |
| 4     | https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound4?did=1250 |

**Note:** If the result for a round is not released yet, every Application Number will be
rejected by the site (shown as `INVALID APPLICATION ID OR DOB`). Wait for the official
declaration, then simply run again — completed rows are skipped automatically.

---

## 5. Input Excel Format

| SRNO     | NAME                     | APPLICATION NO | DOB        |
|----------|--------------------------|----------------|------------|
| ENGG001  | SONTE PRATIK VIJAYKUMAR  | EN26333267     | 23/07/2009 |
| ENGG002  | PQR ABC                  | EN26333268     | 18/11/2008 |

## 6. Output Report Columns

`SRNO | NAME | APPLICATION NO | DOB | LOGIN STATUS | ALLOTMENT STATUS | COLLEGE NAME | BRANCH`

- `LOGIN STATUS`: `SUCCESS` / `FAILED`
- `ALLOTMENT STATUS`: `ALLOTTED` / `NOT ALLOTTED` / `INVALID APPLICATION ID OR DOB` / `SERVER ERROR`

---

## Troubleshooting

- `playwright install chromium` missing → run it once.
- Output Excel open in MS Excel → close it so incremental saves can write.
- Link changed by the board → paste the new link in GUI / web UI / `--url` flag.
- Duplicate Application Numbers are queried only once (cached result reused).