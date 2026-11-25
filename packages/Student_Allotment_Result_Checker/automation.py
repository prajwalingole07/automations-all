"""
Automation module for MHT-CET CAP All-Rounds Allotment Automation Tool.
Uses Playwright Sync API to automate allotment checking, extract college/branch details,
and handle explicit waits, auto-retries, pause/resume/stop signals.
"""

import time
import re
import threading
from typing import Dict, Optional
from playwright.sync_api import sync_playwright, Playwright, Browser, BrowserContext, Page

import config
from logger import app_logger


class AllotmentAutomation:
    """Class orchestrating Playwright browser automation for allotment status retrieval."""

    def __init__(
        self,
        headless: bool = config.DEFAULT_HEADLESS,
        retry_count: int = config.DEFAULT_RETRY_COUNT,
        request_delay: float = config.DEFAULT_DELAY_BETWEEN_REQUESTS,
        target_url: str = None,
        round_no: int = None,
    ):
        self.headless = headless
        self.retry_count = retry_count
        self.request_delay = request_delay
        self.target_url = target_url or config.TARGET_URL
        self.round_no = round_no or config.DEFAULT_ROUND_NO

        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None

        self._stop_requested = False
        self._pause_requested = False
        self._pause_cond = threading.Condition()

    def start_browser(self):
        """Launches single Chromium browser instance and context."""
        app_logger.info("Initializing Playwright browser (Headless={})...", self.headless)
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(
            headless=self.headless,
            slow_mo=300 if not self.headless else 0,
            args=[
                "--start-maximized",
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        self._context = self._browser.new_context(viewport=None)
        self.page = self._context.new_page()
        self.page.set_default_timeout(config.PAGE_TIMEOUT_MS)

        app_logger.info("Navigating to target URL ({}): {}", config.ROUNDS[self.round_no]["name"], self.target_url)
        self.page.goto(self.target_url, timeout=config.NAVIGATION_TIMEOUT_MS, wait_until="domcontentloaded")
        app_logger.info("Initial page loaded successfully.")

    def close_browser(self):
        """Gracefully closes browser context and Playwright instance."""
        app_logger.info("Closing Playwright browser session...")
        try:
            if self.page:
                self.page.close()
            if self._context:
                self._context.close()
            if self._browser:
                self._browser.close()
            if self._playwright:
                self._playwright.stop()
        except Exception as e:
            app_logger.warning("Error while closing browser: {}", e)
        finally:
            self.page = None
            self._context = None
            self._browser = None
            self._playwright = None

    def request_stop(self):
        """Signals worker loop to stop execution."""
        app_logger.info("Stop requested by user.")
        self._stop_requested = True
        self.resume_execution()  # Unblock if paused

    def request_pause(self):
        """Signals worker loop to pause execution."""
        app_logger.info("Pause requested by user.")
        with self._pause_cond:
            self._pause_requested = True

    def resume_execution(self):
        """Resumes execution if worker loop was paused."""
        app_logger.info("Resuming execution...")
        with self._pause_cond:
            self._pause_requested = False
            self._pause_cond.notify_all()

    def check_pause_or_stop(self):
        """Blocks execution if paused, or raises Exception if stopped."""
        if self._stop_requested:
            raise InterruptedException("Automation stopped by user.")

        with self._pause_cond:
            while self._pause_requested:
                app_logger.info("Worker thread paused. Waiting for resume signal...")
                self._pause_cond.wait(timeout=1.0)
                if self._stop_requested:
                    raise InterruptedException("Automation stopped by user.")

    def process_student(self, app_no: str, dob: str) -> Dict[str, str]:
        """
        Processes a single student query with auto-retry logic.

        Args:
            app_no: Student Application Number (e.g., EN26333267).
            dob: Student Date of Birth (DD/MM/YYYY).

        Returns:
            Dictionary containing LOGIN STATUS, ALLOTMENT STATUS, COLLEGE NAME, BRANCH.
        """
        last_error = ""

        for attempt in range(1, self.retry_count + 1):
            self.check_pause_or_stop()

            try:
                if attempt > 1:
                    app_logger.warning("Retry attempt {}/{} for App No: {}", attempt, self.retry_count, app_no)
                    # Reload page on retry to clear stuck state
                    self.page.goto(self.target_url, timeout=config.NAVIGATION_TIMEOUT_MS, wait_until="domcontentloaded")

                result = self._execute_search_single_attempt(app_no, dob)

                # Optional delay between successful requests
                if self.request_delay > 0:
                    time.sleep(self.request_delay)

                return result

            except InterruptedException:
                raise
            except Exception as e:
                last_error = str(e)
                app_logger.error("Attempt {}/{} failed for {}: {}", attempt, self.retry_count, app_no, e)

        # All retries failed
        app_logger.error("All {} attempts failed for App No: {}. Error: {}", self.retry_count, app_no, last_error)
        return {
            config.COL_LOGIN_STATUS: config.STATUS_FAILED,
            config.COL_ALLOTMENT_STATUS: config.ALLOTMENT_SERVER_ERROR,
            config.COL_COLLEGE_NAME: "-",
            config.COL_BRANCH: "-",
            config.COL_PREF_NO: "-",
        }

    def _execute_search_single_attempt(self, app_no: str, dob: str) -> Dict[str, str]:
        """
        Executes single search attempt on Playwright page.

        Steps:
        1. Fill Application ID & DOB fields.
        2. Click Submit.
        3. Wait for result element or alert.
        4. Extract Institute Allotted & Course Allotted.
        """
        if not self.page:
            raise RuntimeError("Browser page is not initialized.")

        # Handle dialogs/alerts (e.g., "Invalid Application ID or DOB")
        dialog_message = []

        def handle_dialog(dialog):
            msg = dialog.message
            app_logger.info("Browser alert dialog detected: '{}'", msg)
            dialog_message.append(msg)
            dialog.accept()

        self.page.once("dialog", handle_dialog)

        # Fill Application ID field
        app_id_selector = config.SELECTOR_APP_ID
        dob_selector = config.SELECTOR_DOB
        submit_selector = config.SELECTOR_SUBMIT

        # Ensure input form is loaded on page before attempting fill
        if not self.page.query_selector(app_id_selector):
            self.page.goto(self.target_url, timeout=config.NAVIGATION_TIMEOUT_MS, wait_until="domcontentloaded")

        self.page.wait_for_selector(app_id_selector, state="visible", timeout=10000)
        self.page.fill(app_id_selector, "")
        self.page.fill(app_id_selector, app_no)

        # Fill DOB field
        self.page.wait_for_selector(dob_selector, state="visible", timeout=10000)
        self.page.fill(dob_selector, "")
        self.page.fill(dob_selector, dob)

        # Click Submit
        self.page.click(submit_selector)

        # Explicit Wait: Wait for page load state and result containers
        try:
            self.page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass  # Continue to check page selectors even if networkidle times out

        # Check if dialog appeared
        if dialog_message:
            msg_str = " ".join(dialog_message).lower()
            if "invalid" in msg_str or "correct" in msg_str or "not found" in msg_str:
                return {
                    config.COL_LOGIN_STATUS: config.STATUS_FAILED,
                    config.COL_ALLOTMENT_STATUS: config.ALLOTMENT_INVALID,
                    config.COL_COLLEGE_NAME: "-",
                    config.COL_BRANCH: "-",
                }

        # Inspect Page HTML / Text Content
        content_text = self.page.content()

        # Check for invalid message text directly on page
        if "Invalid Application ID" in content_text or "Incorrect Application ID" in content_text or "Details Not Found" in content_text:
            return {
                config.COL_LOGIN_STATUS: config.STATUS_FAILED,
                config.COL_ALLOTMENT_STATUS: config.ALLOTMENT_INVALID,
                config.COL_COLLEGE_NAME: "-",
                config.COL_BRANCH: "-",
            }

        # Check for "Not Allotted"
        if "Not Allotted" in content_text or "No Seat Allotted" in content_text:
            return {
                config.COL_LOGIN_STATUS: config.STATUS_SUCCESS,
                config.COL_ALLOTMENT_STATUS: config.ALLOTMENT_NOT_ALLOTTED,
                config.COL_COLLEGE_NAME: "-",
                config.COL_BRANCH: "-",
                config.COL_PREF_NO: "-",
            }

        # Extract Allotted Details from Tables/Elements
        extracted = self._extract_allotment_details()

        if extracted["college_name"] != "-" or extracted["branch"] != "-":
            return {
                config.COL_LOGIN_STATUS: config.STATUS_SUCCESS,
                config.COL_ALLOTMENT_STATUS: config.ALLOTMENT_ALLOTTED,
                config.COL_COLLEGE_NAME: extracted["college_name"],
                config.COL_BRANCH: extracted["branch"],
                config.COL_PREF_NO: extracted.get("preference_no", "-"),
            }

        # Check if provisional allotment details header exists
        provisional_header = self.page.query_selector("text=Provisional Allotment Details")
        if provisional_header:
            return {
                config.COL_LOGIN_STATUS: config.STATUS_SUCCESS,
                config.COL_ALLOTMENT_STATUS: config.ALLOTMENT_ALLOTTED if extracted["college_name"] != "-" else config.ALLOTMENT_NOT_ALLOTTED,
                config.COL_COLLEGE_NAME: extracted["college_name"],
                config.COL_BRANCH: extracted["branch"],
            }

        # If page state is ambiguous, raise exception to trigger retry
        raise RuntimeError("Result container 'Provisional Allotment Details' not found on page.")

    def _extract_allotment_details(self) -> Dict[str, str]:
        """
        Parses DOM tables to extract exact Institute Allotted and Course Allotted strings.
        Cleans newlines into single comma/space while keeping exact spelling and commas intact.
        """
        college_name = "-"
        branch = "-"

        try:
            # Table cell extraction strategy
            rows = self.page.query_selector_all("tr")
            for row in rows:
                row_text = row.inner_text().strip()

                # Extract Institute Allotted
                if "Institute Allotted" in row_text or "Institute Name" in row_text:
                    cells = row.query_selector_all("td, th")
                    if len(cells) >= 2:
                        raw_col = cells[1].inner_text().strip()
                        college_name = self._clean_extracted_text(raw_col)
                    elif ":" in row_text:
                        parts = row_text.split(":", 1)
                        if len(parts) > 1:
                            college_name = self._clean_extracted_text(parts[1])

                # Extract Course Allotted (explicitly exclude Choice Code or Seat Type)
                if ("Course Allotted" in row_text or "Branch Allotted" in row_text) and "Choice Code" not in row_text and "Seat Type" not in row_text:
                    cells = row.query_selector_all("td, th")
                    if len(cells) >= 2:
                        raw_branch = cells[1].inner_text().strip()
                        branch = self._clean_extracted_text(raw_branch)
                    elif ":" in row_text:
                        parts = row_text.split(":", 1)
                        if len(parts) > 1:
                            branch = self._clean_extracted_text(parts[1])

                # Extract Preference No. Allotted
                if "Preference Allotted" in row_text or "Preference No" in row_text:
                    cells = row.query_selector_all("td, th")
                    if len(cells) >= 2:
                        raw_pref = cells[1].inner_text().strip()
                        preference_no = self._clean_extracted_text(raw_pref)
                    elif ":" in row_text:
                        parts = row_text.split(":", 1)
                        if len(parts) > 1:
                            preference_no = self._clean_extracted_text(parts[1])

            # Fallback: Scrape span / div labels if tables were not used
            if college_name == "-":
                college_elem = self.page.query_selector("span[id*='lblInstitute'], td[id*='Institute']")
                if college_elem:
                    college_name = self._clean_extracted_text(college_elem.inner_text())

            if branch == "-":
                branch_elem = self.page.query_selector("span[id*='lblCourse'], td[id*='Course']")
                if branch_elem:
                    branch = self._clean_extracted_text(branch_elem.inner_text())

        except Exception as e:
            app_logger.warning("Error during text extraction: {}", e)

        return {"college_name": college_name, "branch": branch, "preference_no": preference_no}

    @staticmethod
    def _clean_extracted_text(text: str) -> str:
        """
        Cleans extracted text:
        - Trims leading/trailing whitespace.
        - Replaces newlines with comma and space ', '.
        - Collapses multiple spaces.
        - Preserves exact spelling, casing, and existing commas.
        """
        if not text:
            return "-"

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        cleaned = ", ".join(lines)
        # Collapse multi spaces
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned if cleaned else "-"


class InterruptedException(Exception):
    """Custom exception raised when user manually stops execution."""
    pass