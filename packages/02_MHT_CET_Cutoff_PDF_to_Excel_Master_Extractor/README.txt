=====================================================
CET CUTOFF DATA EXTRACTOR - ALL COLLEGES AT ONCE
PRAJWAL'S CREATION
=====================================================

WHAT THIS DOES
--------------
Reads the CET (CAP Round 1 & Round 2) cutoff PDFs and builds ONE master
Excel file with EVERY college -> EVERY branch -> EVERY category for
R1 and R2 (Stage-I only). No category is ever dropped:

  * EWS / ORPHAN / trailing categories that spill onto a continuation
    (second) page are captured for EVERY college and branch (COEP,
    PICT, VIT and all others).
  * A category found in R1 but not in R2 is kept (R2 shows "--").
  * A category found in R2 but not in R1 is kept (R1 shows "--").

FILES
-----
  cet_core.py      - extraction engine (single pass, fast)
  CET_ALLCLGS.py   - Console mode with live one-by-one progress
  web_server.py    - Localhost web server with LIVE progress
  PDFs/            - Put your R1 2026.pdf and R2 2026.pdf here
  CET DATA/        - Output Excel files are saved here

REQUIREMENTS
------------
  Python 3.10+ and:
    pip install pdfplumber pandas openpyxl flask colorama tqdm

  Or run:  pip install -r requirements.txt

HOW TO RUN (WEB - recommended, live progress)
----------------------------------------------
  Double-click  START_WEB.bat     (or run: python web_server.py)
  Then open  http://127.0.0.1:5000  in your browser.
  Click "START EXTRACTION" - you will see live progress one by one of
  every College -> Branch -> Category, then Download the Excel.

HOW TO RUN (CONSOLE)
--------------------
  Double-click  START_CLI.bat     (or run: python CET_ALLCLGS.py)
  At the menu: press Enter to run, W to open the web server, Q to quit.

OUTPUT
------
  CET DATA/ALL_COLLEGES_CONSOLIDATED_YYYYMMDD_HHMMSS.xlsx
  Columns: Institute CODE, INSTITUTE, CITY, Branch Code, BRANCH NAME,
           CATEGORY, R1 RANK, R1 PERCENTILE, R2 RANK, R2 PERCENTILE,
           R3 RANK, R3 PERCENTILE, R4 RANK, R4 PERCENTILE

  To add more rounds: drop R3/R4 PDFs (named "R3 2026.pdf", ...) into PDFs/.
=====================================================
