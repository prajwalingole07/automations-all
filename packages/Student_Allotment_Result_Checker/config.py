"""
Configuration module for MHT-CET CAP All-Rounds Allotment Automation Tool.
Centralizes per-round URLs, release status notes, DOM selectors, file paths,
operational defaults, and UI styling.
"""

from pathlib import Path

# Base Directory
BASE_DIR = Path(__file__).resolve().parent

# --------------------------------------------------------------------------
# Round Information (Official fe2026.mahacet.org pattern)
# --------------------------------------------------------------------------
# NOTE: When the official Round 2/3/4 result links go live, they usually
# follow the pattern below. If the link differs, the user can paste the
# exact official link in the GUI / web dashboard / CLI flag instead.
_ROUND_URL_PATTERN = "https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound{round_no}?did=1250"

ROUNDS = {
    1: {
        "name": "CAP Round 1",
        "url": _ROUND_URL_PATTERN.format(round_no=1),
        "status": "Result released",
        "note": "Result link is live. You can check Round 1 allotment now.",
        "accent": "#16A34A",
    },
    2: {
        "name": "CAP Round 2",
        "url": _ROUND_URL_PATTERN.format(round_no=2),
        "status": "Result not released yet",
        "note": "Round 2 result is NOT released yet. Once the official link goes live, "
                "paste it in the URL box below (edit if needed) and run. Until then, "
                "the site will reject every Application Number.",
        "accent": "#D97706",
    },
    3: {
        "name": "CAP Round 3",
        "url": _ROUND_URL_PATTERN.format(round_no=3),
        "status": "Result not released yet",
        "note": "Round 3 happens only after Round 2 counselling completes. "
                "When the official link goes live, paste it below and run.",
        "accent": "#D97706",
    },
    4: {
        "name": "CAP Round 4",
        "url": _ROUND_URL_PATTERN.format(round_no=4),
        "status": "Result not released yet",
        "note": "Final CAP round. When the official link goes live, "
                "paste it below and run.",
        "accent": "#D97706",
    },
}

DEFAULT_ROUND_NO = 2

# Active Target Website URL (updated at runtime by GUI / server / CLI)
TARGET_URL = ROUNDS[DEFAULT_ROUND_NO]["url"]

# DOM Element Selectors (ASP.NET WebForms IDs and Fallbacks)
SELECTOR_APP_ID = "#rightContainer_cbCheckResult_txtApplicationID"
SELECTOR_DOB = "#rightContainer_cbCheckResult_txtDOB"
SELECTOR_SUBMIT = "#rightContainer_cbCheckResult_btnProceed"

# Text Markers for Page Parsing
TEXT_PROVISIONAL_DETAILS = "Provisional Allotment Details"
TEXT_INSTITUTE_ALLOTTED = "Institute Allotted"
TEXT_COURSE_ALLOTTED = "Course Allotted"
TEXT_NOT_ALLOTTED = "Not Allotted"
TEXT_INVALID_ID_OR_DOB = "Invalid Application ID or DOB"

# Folder & File Paths
DEFAULT_INPUT_DIR = BASE_DIR / "Input"
DEFAULT_OUTPUT_DIR = BASE_DIR / "Output"
DEFAULT_INPUT_FILE = DEFAULT_INPUT_DIR / "Students.xlsx"
DEFAULT_LOG_FILE = DEFAULT_OUTPUT_DIR / "automation.log"


def output_file_for_round(round_no: int, output_dir: Path = None) -> Path:
    """Returns round-specific output report path, e.g. Allotment_Report_R2.xlsx."""
    directory = Path(output_dir) if output_dir else DEFAULT_OUTPUT_DIR
    return directory / f"Allotment_Report_R{int(round_no)}.xlsx"


# Default Operational Parameters
DEFAULT_RETRY_COUNT = 3
DEFAULT_DELAY_BETWEEN_REQUESTS = 0.5  # Seconds
DEFAULT_HEADLESS = False  # False = Visible browser window so user can watch live automation
PAGE_TIMEOUT_MS = 20000  # 20 seconds timeout for page actions
NAVIGATION_TIMEOUT_MS = 30000  # 30 seconds for initial navigation

# Column Names Standard
COL_SRNO = "SRNO"
COL_NAME = "NAME"
COL_APP_NO = "APPLICATION NO"
COL_DOB = "DOB"

COL_LOGIN_STATUS = "LOGIN STATUS"
COL_ALLOTMENT_STATUS = "ALLOTMENT STATUS"
COL_COLLEGE_NAME = "COLLEGE NAME"
COL_BRANCH = "BRANCH"
COL_PREF_NO = "PREFERENCE NO ALLOTTED"

REQUIRED_INPUT_COLUMNS = [COL_SRNO, COL_NAME, COL_APP_NO, COL_DOB]
OUTPUT_COLUMNS = [
    COL_SRNO,
    COL_NAME,
    COL_APP_NO,
    COL_DOB,
    COL_LOGIN_STATUS,
    COL_ALLOTMENT_STATUS,
    COL_COLLEGE_NAME,
    COL_BRANCH,
    COL_PREF_NO,
]

# Possible Input Column Aliases for Auto-Detection
COLUMN_ALIASES = {
    COL_SRNO: ["srno", "sr.no", "sr_no", "sno", "serial no", "serial number", "id"],
    COL_NAME: ["name", "student name", "candidate name", "full name", "student_name"],
    COL_APP_NO: ["application no", "application_no", "application id", "app no", "app_no", "en number", "en_no", "en no", "applicationno"],
    COL_DOB: ["dob", "date of birth", "birth date", "date_of_birth", "birthdate"]
}

# Login & Allotment Status Constants
STATUS_SUCCESS = "SUCCESS"
STATUS_FAILED = "FAILED"

ALLOTMENT_ALLOTTED = "ALLOTTED"
ALLOTMENT_NOT_ALLOTTED = "NOT ALLOTTED"
ALLOTMENT_INVALID = "INVALID APPLICATION ID OR DOB"
ALLOTMENT_SERVER_ERROR = "SERVER ERROR"

# UI Theme Colors
COLOR_PRIMARY = "#1E3A8A"       # Deep Navy Blue
COLOR_SECONDARY = "#0284C7"     # Sky Blue
COLOR_ACCENT = "#DC2626"        # Header Red
COLOR_BG = "#F8FAFC"            # Light Gray-Blue
COLOR_CARD_BG = "#FFFFFF"       # White
COLOR_TEXT = "#0F172A"          # Dark Slate
COLOR_TEXT_MUTED = "#64748B"    # Muted Gray
COLOR_SUCCESS = "#16A34A"       # Green
COLOR_WARNING = "#D97706"       # Amber
COLOR_DANGER = "#DC2626"        # Red