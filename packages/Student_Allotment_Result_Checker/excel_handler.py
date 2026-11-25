"""
Excel Handler module for MHT-CET CAP All-Rounds Allotment Automation Tool.
Handles reading input Excel files, column auto-detection, dataset cleaning,
resume state loading, duplicate caching, and OpenPyXL report generation with styling.
"""

import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Any
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

import config
from logger import app_logger


class ExcelHandler:
    """Class to handle Excel operations, column auto-detection, incremental saving, and styling."""

    def __init__(
        self,
        input_path: Optional[Path] = None,
        output_path: Optional[Path] = None,
        round_no: int = None,
    ):
        self.input_path = Path(input_path) if input_path else config.DEFAULT_INPUT_FILE
        self.round_no = round_no or config.DEFAULT_ROUND_NO
        self.output_path = (
            Path(output_path)
            if output_path
            else config.output_file_for_round(self.round_no)
        )
        self.data_df: pd.DataFrame = pd.DataFrame()
        self.result_cache: Dict[str, Dict[str, str]] = {}

    def auto_detect_columns(self, df: pd.DataFrame) -> Dict[str, str]:
        """
        Auto-detects mapping from standard column names to input file column names.

        Returns:
            Dictionary mapping standard column names (e.g. APPLICATION NO) to raw Excel column names.
        """
        raw_columns = list(df.columns)
        col_mapping = {}

        for std_col, aliases in config.COLUMN_ALIASES.items():
            found_col = None
            # Check exact match first (case-insensitive)
            for raw_col in raw_columns:
                raw_clean = str(raw_col).strip().upper()
                if raw_clean == std_col:
                    found_col = raw_col
                    break

            # Check aliases if exact match not found
            if not found_col:
                for raw_col in raw_columns:
                    raw_clean = str(raw_col).strip().lower()
                    if raw_clean in aliases:
                        found_col = raw_col
                        break

            if found_col:
                col_mapping[std_col] = found_col
            else:
                app_logger.warning("Could not auto-detect column for: {}", std_col)

        return col_mapping

    def clean_dob(self, val: Any) -> str:
        """Standardizes Date of Birth string into DD/MM/YYYY format."""
        if pd.isna(val) or val is None:
            return ""

        val_str = str(val).strip()

        # If already formatted as DD/MM/YYYY
        if len(val_str) == 10 and val_str[2] == "/" and val_str[5] == "/":
            return val_str

        # Try parsing via pandas to datetime
        try:
            dt = pd.to_datetime(val_str, dayfirst=True)
            return dt.strftime("%d/%m/%Y")
        except Exception:
            return val_str

    def clean_app_no(self, val: Any) -> str:
        """Standardizes Application Number string."""
        if pd.isna(val) or val is None:
            return ""
        val_str = str(val).strip().upper()
        # Remove trailing .0 if read as float from excel
        if val_str.endswith(".0"):
            val_str = val_str[:-2]
        return val_str

    def load_input_data(self) -> pd.DataFrame:
        """
        Reads input Excel file, normalizes column names, and sets up output schema.

        Returns:
            Pandas DataFrame ready for processing.
        """
        if not self.input_path.exists():
            raise FileNotFoundError(f"Input Excel file not found at: {self.input_path}")

        app_logger.info("Loading input Excel from: {}", self.input_path)

        # Read Excel using openpyxl engine
        df_raw = pd.read_excel(self.input_path, dtype=str)

        col_mapping = self.auto_detect_columns(df_raw)

        missing_cols = [col for col in config.REQUIRED_INPUT_COLUMNS if col not in col_mapping]
        if missing_cols:
            raise ValueError(
                f"Required column(s) {missing_cols} could not be detected in input Excel. "
                f"Available columns: {list(df_raw.columns)}"
            )

        # Build clean standardized DataFrame
        clean_df = pd.DataFrame()
        clean_df[config.COL_SRNO] = df_raw[col_mapping[config.COL_SRNO]].fillna("").astype(str).str.strip()
        clean_df[config.COL_NAME] = df_raw[col_mapping[config.COL_NAME]].fillna("").astype(str).str.strip()
        clean_df[config.COL_APP_NO] = df_raw[col_mapping[config.COL_APP_NO]].apply(self.clean_app_no)
        clean_df[config.COL_DOB] = df_raw[col_mapping[config.COL_DOB]].apply(self.clean_dob)

        # Add result columns if not present
        for col in [config.COL_LOGIN_STATUS, config.COL_ALLOTMENT_STATUS, config.COL_COLLEGE_NAME, config.COL_BRANCH]:
            clean_df[col] = ""

        # Load existing results for resume capability
        clean_df = self.load_resume_state(clean_df)

        self.data_df = clean_df
        return self.data_df

    def load_resume_state(self, current_df: pd.DataFrame) -> pd.DataFrame:
        """
        Checks if output report file for the selected round already exists. If yes,
        populates existing results to resume processing seamlessly.

        Returns:
            DataFrame with preserved completed status rows.
        """
        if not self.output_path.exists():
            app_logger.info("No existing output file found for {}. Starting fresh automation run.", self.output_path.name)
            return current_df

        try:
            app_logger.info("Existing report {} found. Loading state to resume...", self.output_path.name)
            existing_df = pd.read_excel(self.output_path, dtype=str).fillna("")

            completed_count = 0
            for idx, row in current_df.iterrows():
                app_no = row[config.COL_APP_NO]
                srno = row[config.COL_SRNO]

                match = existing_df[existing_df[config.COL_APP_NO] == app_no]
                if match.empty and srno:
                    match = existing_df[existing_df[config.COL_SRNO] == srno]

                if not match.empty:
                    match_row = match.iloc[0]
                    login_status = str(match_row.get(config.COL_LOGIN_STATUS, "")).strip()

                    if login_status:
                        current_df.at[idx, config.COL_LOGIN_STATUS] = login_status
                        current_df.at[idx, config.COL_ALLOTMENT_STATUS] = str(match_row.get(config.COL_ALLOTMENT_STATUS, "")).strip()
                        current_df.at[idx, config.COL_COLLEGE_NAME] = str(match_row.get(config.COL_COLLEGE_NAME, "")).strip()
                        current_df.at[idx, config.COL_BRANCH] = str(match_row.get(config.COL_BRANCH, "")).strip()

                        if app_no:
                            self.result_cache[app_no] = {
                                config.COL_LOGIN_STATUS: current_df.at[idx, config.COL_LOGIN_STATUS],
                                config.COL_ALLOTMENT_STATUS: current_df.at[idx, config.COL_ALLOTMENT_STATUS],
                                config.COL_COLLEGE_NAME: current_df.at[idx, config.COL_COLLEGE_NAME],
                                config.COL_BRANCH: current_df.at[idx, config.COL_BRANCH],
                            }
                        completed_count += 1

            app_logger.info("Resumed state successfully: {} / {} rows already completed.", completed_count, len(current_df))

        except Exception as e:
            app_logger.warning("Could not read existing report file for resume ({}) - starting fresh.", e)

        return current_df

    def update_student_result(
        self,
        index: int,
        login_status: str,
        allotment_status: str,
        college_name: str = "-",
        branch: str = "-",
        preference_no: str = "-",
    ):
        """
        Updates a specific student row in the DataFrame and caches the result for duplicates.

        Args:
            index: Row index in DataFrame.
            login_status: SUCCESS or FAILED.
            allotment_status: ALLOTTED, NOT ALLOTTED, INVALID APPLICATION ID OR DOB, SERVER ERROR.
            college_name: Full institute name or '-'.
            branch: Full branch name or '-'.
            preference_no: Preference No. Allotted or '-'.
        """
        self.data_df.at[index, config.COL_LOGIN_STATUS] = login_status
        self.data_df.at[index, config.COL_ALLOTMENT_STATUS] = allotment_status
        self.data_df.at[index, config.COL_COLLEGE_NAME] = college_name
        self.data_df.at[index, config.COL_BRANCH] = branch
        self.data_df.at[index, config.COL_PREF_NO] = preference_no

        app_no = self.data_df.at[index, config.COL_APP_NO]
        if app_no:
            self.result_cache[app_no] = {
                config.COL_LOGIN_STATUS: login_status,
                config.COL_ALLOTMENT_STATUS: allotment_status,
                config.COL_COLLEGE_NAME: college_name,
                config.COL_BRANCH: branch,
                config.COL_PREF_NO: preference_no,
            }

    def get_cached_result(self, app_no: str) -> Optional[Dict[str, str]]:
        """Returns cached result for duplicate Application Number if present."""
        return self.result_cache.get(app_no.strip().upper())

    def save_report(self, target_filepath: Optional[Path] = None):
        """
        Writes current DataFrame to Excel file with professional OpenPyXL styling.

        Styling details:
        - Red header fill (#DC2626 / #C00000)
        - White bold text
        - Freeze top row
        - Auto column width calculation
        - Thin gray borders
        - Text wrapping & proper alignment
        """
        save_path = Path(target_filepath) if target_filepath else self.output_path
        save_path.parent.mkdir(parents=True, exist_ok=True)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Allotment Status Report"

        headers = config.OUTPUT_COLUMNS
        ws.append(headers)

        header_fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        data_font = Font(name="Calibri", size=10, color="000000")

        thin_side = Side(border_style="thin", color="D3D3D3")
        cell_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

        center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        left_align = Alignment(horizontal="left", vertical="center", wrap_text=True)

        # Format Header Row
        ws.row_dimensions[1].height = 28
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
            cell.border = cell_border

        # Write Data Rows
        center_cols = {config.COL_SRNO, config.COL_APP_NO, config.COL_DOB, config.COL_LOGIN_STATUS, config.COL_ALLOTMENT_STATUS}

        for row_idx, row_data in self.data_df[config.OUTPUT_COLUMNS].iterrows():
            current_row = row_idx + 2
            ws.row_dimensions[current_row].height = 24

            for col_idx, col_name in enumerate(headers, 1):
                val = str(row_data[col_name]) if pd.notna(row_data[col_name]) else ""
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.font = data_font
                cell.border = cell_border

                if col_name in center_cols:
                    cell.alignment = center_align
                else:
                    cell.alignment = left_align

        # Freeze Top Header Row
        ws.freeze_panes = "A2"

        # Calculate Auto Column Widths
        for col_idx, col_name in enumerate(headers, 1):
            col_letter = get_column_letter(col_idx)
            max_len = len(col_name)

            for cell in ws[col_letter]:
                if cell.row == 1:
                    continue
                val_len = len(str(cell.value or ""))
                if val_len > max_len:
                    max_len = min(val_len, 50)

            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        # Save Workbook
        wb.save(save_path)
        app_logger.debug("Report saved successfully to {}", save_path)

    def create_zip_archive(self, zip_path: Optional[Path] = None) -> Path:
        """
        Creates a zip archive of the output Excel report and saves it to the Downloads folder.

        Args:
            zip_path: Optional custom path for the zip file. If not provided, saves to Downloads folder
                  with name based on the output report filename.

        Returns:
            Path to the created zip file.
        """
        import os

        downloads_dir = Path(os.path.join(os.environ.get('USERPROFILE', ''), 'Downloads'))
        downloads_dir.mkdir(parents=True, exist_ok=True)

        if zip_path is None:
            zip_name = f"Allotment_Report_R{int(self.round_no)}_.zip"
            zip_path = downloads_dir / zip_name

        report_path = self.output_path

        if not report_path.exists():
            app_logger.warning("Output report {} does not exist, creating empty zip.", report_path)
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Allotment Status Report"
            wb.save(zip_path)
            return zip_path

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.write(report_path, arcname=report_path.name)

        app_logger.info("Zip archive created at {}", zip_path)
        return zip_path