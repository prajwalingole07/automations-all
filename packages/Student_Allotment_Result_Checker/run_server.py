"""
Server / Headless CLI Batch Runner for MHT-CET CAP All-Rounds Allotment Automation Tool.
Runs the full automation directly from terminal / server environment.

Usage:
    python run_server.py --round 2 --input "E:\\Students.xlsx" [--url "https://..."] [--headless]
"""

import time
import sys
import argparse
from pathlib import Path

import config
from logger import setup_logger, app_logger
from excel_handler import ExcelHandler
from automation import AllotmentAutomation, InterruptedException


def run_batch_automation(
    input_file: Path,
    output_file: Path,
    round_no: int,
    target_url: str,
    headless: bool = True,
    retry_count: int = config.DEFAULT_RETRY_COUNT,
    delay: float = config.DEFAULT_DELAY_BETWEEN_REQUESTS,
):
    """Executes batch allotment status checks for all students in input_file for a given round."""
    setup_logger()
    app_logger.info("=" * 70)
    app_logger.info("MHT-CET All-Rounds Allotment Automation Batch Engine")
    app_logger.info("Round       : {}", config.ROUNDS[round_no]["name"])
    app_logger.info("Input File  : {}", input_file)
    app_logger.info("Output File : {}", output_file)
    app_logger.info("Check URL   : {}", target_url)
    app_logger.info("Headless    : {}", headless)
    app_logger.info("=" * 70)

    if not target_url.startswith("http"):
        app_logger.error("Invalid check URL: '{}'. Must start with http(s).", target_url)
        return

    # Load Excel Handler
    handler = ExcelHandler(input_file, output_file, round_no=round_no)
    df = handler.load_input_data()
    total_students = len(df)

    if total_students == 0:
        app_logger.error("Input file contains no data rows.")
        return

    # Start Playwright Engine
    engine = AllotmentAutomation(
        headless=headless,
        retry_count=retry_count,
        request_delay=delay,
        target_url=target_url,
        round_no=round_no,
    )
    engine.start_browser()

    start_time = time.time()

    try:
        for idx, row in df.iterrows():
            app_no = str(row[config.COL_APP_NO]).strip()
            name = str(row[config.COL_NAME]).strip()
            dob = str(row[config.COL_DOB]).strip()
            existing_login = str(row[config.COL_LOGIN_STATUS]).strip()

            completed_count = len(df[df[config.COL_LOGIN_STATUS] != ""])
            pct = (completed_count / total_students) * 100

            # Skip if already completed (Resume Feature)
            if existing_login:
                app_logger.info("[{}/{}] ({:.1f}%) Already processed {} ({}) - Skipping.", idx + 1, total_students, pct, app_no, name)
                continue

            # Handle missing or invalid application number
            if not app_no or app_no == "NAN" or not app_no.startswith("EN"):
                app_logger.warning("[{}/{}] ({:.1f}%) Row {} ({}) has invalid App No: '{}'", idx + 1, total_students, pct, idx + 1, name, app_no)
                handler.update_student_result(idx, config.STATUS_FAILED, config.ALLOTMENT_INVALID, "-", "-", "-")
                handler.save_report()
                continue

            # Duplicate Cache Check
            cached = handler.get_cached_result(app_no)
            if cached:
                app_logger.info("[{}/{}] ({:.1f}%) Duplicate EN {} ({}) - Reusing cached result.", idx + 1, total_students, pct, app_no, name)
                handler.update_student_result(
                    idx,
                    cached[config.COL_LOGIN_STATUS],
                    cached[config.COL_ALLOTMENT_STATUS],
                    cached[config.COL_COLLEGE_NAME],
                    cached[config.COL_BRANCH],
                    cached.get(config.COL_PREF_NO, "-"),
                )
            else:
                app_logger.info("[{}/{}] ({:.1f}%) Checking App: {} | Name: {} | DOB: {}", idx + 1, total_students, pct, app_no, name, dob)
                res = engine.process_student(app_no, dob)
                app_logger.info("   -> Status: {} | Allotment: {} | College: {} | Branch: {}",
                                res[config.COL_LOGIN_STATUS], res[config.COL_ALLOTMENT_STATUS],
                                res[config.COL_COLLEGE_NAME], res[config.COL_BRANCH])
                handler.update_student_result(idx, res[config.COL_LOGIN_STATUS], res[config.COL_ALLOTMENT_STATUS], res[config.COL_COLLEGE_NAME], res[config.COL_BRANCH], res.get(config.COL_PREF_NO, "-"))

            # Auto-save after every student
            handler.save_report()

        total_elapsed = time.time() - start_time
        app_logger.info("=" * 70)
        app_logger.info("BATCH AUTOMATION COMPLETED SUCCESSFULLY!")
        app_logger.info("Total Students Processed: {}", total_students)
        app_logger.info("Total Time Elapsed     : {:.1f} seconds", total_elapsed)
        app_logger.info("Final Report Saved To  : {}", output_file)
        app_logger.info("=" * 70)

    except InterruptedException:
        app_logger.warning("Batch automation interrupted by user.")
    except Exception as e:
        app_logger.error("Fatal error during batch execution: {}", e)
    finally:
        engine.close_browser()


def main():
    parser = argparse.ArgumentParser(description="MHT-CET All-Rounds Allotment Batch Checker (server mode)")
    parser.add_argument("--round", type=int, default=config.DEFAULT_ROUND_NO,
                        help="CAP round number: 1, 2, 3 or 4 (default: %(default)s)")
    parser.add_argument("--input", type=str, default=str(config.DEFAULT_INPUT_FILE),
                        help="Path to students Excel file")
    parser.add_argument("--output", type=str, default=None,
                        help="Output Excel report path (default: per-round file in Output/)")
    parser.add_argument("--url", type=str, default=None,
                        help="Allotment check link. Defaults to official per-round link (edit if link changed)")
    parser.add_argument("--headless", action="store_true", default=True,
                        help="Run with hidden browser (default: True)")
    parser.add_argument("--visible", action="store_true",
                        help="Run with visible browser window")
    parser.add_argument("--retry", type=int, default=config.DEFAULT_RETRY_COUNT,
                        help="Retry count per student (default: %(default)s)")
    parser.add_argument("--delay", type=float, default=config.DEFAULT_DELAY_BETWEEN_REQUESTS,
                        help="Delay in seconds between students (default: %(default)s)")
    args = parser.parse_args()

    if args.round not in config.ROUNDS:
        print(f"Invalid round: {args.round}. Allowed: 1, 2, 3, 4")
        sys.exit(1)

    target_url = args.url or config.ROUNDS[args.round]["url"]
    input_file = Path(args.input)
    output_file = (
        Path(args.output)
        if args.output
        else config.output_file_for_round(args.round)
    )

    run_batch_automation(
        input_file=input_file,
        output_file=output_file,
        round_no=args.round,
        target_url=target_url,
        headless=not args.visible,
        retry_count=args.retry,
        delay=args.delay,
    )


if __name__ == "__main__":
    main()