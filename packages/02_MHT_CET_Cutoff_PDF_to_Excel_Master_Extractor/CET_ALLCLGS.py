"""
CET CUTOFF DATA EXTRACTOR - ALL COLLEGES AT ONCE  (FIXED)
PRAJWAL'S CREATION

Fixes:
  * Continuation pages (EWS / ORPHAN / trailing categories spilled on the next
    page) are now captured for EVERY college and branch (COEP, PICT, VIT, ...).
  * No category is ever dropped. A category present in R1 but not in R2 is kept
    (R2 shows "--").
  * Stage-I data only. Multi-row R2 tables handled correctly.

Usage:
  python CET_ALLCLGS.py              -> CLI mode
  python web_server.py               -> localhost web server with live progress
"""

import os
import sys
import time
import random
import threading
from colorama import Fore, Style, init
from tqdm import tqdm

import cet_core

init(autoreset=True)

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

C_ORANGE = "\033[38;5;208m"
C_GOLD = "\033[38;5;220m"
C_CORAL = "\033[38;5;209m"
C_SALMON = "\033[38;5;210m"
C_HOT_PINK = "\033[38;5;199m"
C_DEEP_PINK = "\033[38;5;198m"
C_PURPLE = "\033[38;5;93m"
C_VIOLET = "\033[38;5;129m"
C_SLATE_BLUE = "\033[38;5;99m"
C_DODGER_BLUE = "\033[38;5;33m"
C_DEEP_SKY_BLUE = "\033[38;5;39m"
C_TURQUOISE = "\033[38;5;45m"
C_AQUA = "\033[38;5;51m"
C_SPRING_GREEN = "\033[38;5;48m"
C_LIME = "\033[38;5;154m"
C_CHARTREUSE = "\033[38;5;118m"
C_BRIGHT_GREEN = "\033[38;5;46m"
C_NEON_GREEN = "\033[38;5;82m"
C_TEAL = "\033[38;5;37m"
C_STEEL_BLUE = "\033[38;5;67m"
C_KHAKI = "\033[38;5;179m"
C_ORCHID = "\033[38;5;170m"
C_DARK_ORANGE = "\033[38;5;202m"

PROGRESS_COLORS = [
    Fore.GREEN, Fore.YELLOW, Fore.BLUE, Fore.MAGENTA, Fore.CYAN,
    Fore.WHITE, Fore.LIGHTMAGENTA_EX, Fore.LIGHTRED_EX,
    Fore.LIGHTGREEN_EX, Fore.LIGHTBLUE_EX, Fore.RED,
    Fore.LIGHTYELLOW_EX, Fore.LIGHTCYAN_EX, Fore.LIGHTWHITE_EX,
    C_ORANGE, C_GOLD, C_CORAL, C_SALMON, C_DARK_ORANGE, C_KHAKI,
    C_HOT_PINK, C_DEEP_PINK, C_PURPLE, C_VIOLET, C_SLATE_BLUE, C_ORCHID,
    C_DODGER_BLUE, C_DEEP_SKY_BLUE, C_TURQUOISE, C_TEAL, C_STEEL_BLUE, C_AQUA,
    C_LIME, C_CHARTREUSE, C_BRIGHT_GREEN, C_NEON_GREEN, C_SPRING_GREEN
]


def print_banner():
    width = 156
    os.system('cls' if os.name == 'nt' else 'clear')
    print(Fore.CYAN + "=" * width)
    print(Fore.CYAN + "CET CUTOFF DATA EXTRACTOR - ALL COLLEGES AT ONCE".center(width))
    print(Fore.YELLOW + "PRAJWAL'S CREATION".center(width))
    print(Fore.CYAN + "=" * width)
    print(Fore.YELLOW + "FEATURES:")
    print("  1. Auto-Detect ALL Colleges from PDFs (No manual input needed)")
    print("  2. Auto-Detect ALL Branches for Each College")
    print("  3. Process All Rounds (R1, R2, R3, R4) for All Colleges")
    print("  4. Extract ONLY Stage-I Data")
    print("  5. Extract: Home-Home, Other-Other, & State Level ONLY")
    print("  6. Continuation pages (EWS & trailing categories) now captured for EVERY branch")
    print("  7. ONE SINGLE EXCEL FILE with ALL Colleges Listed Below Each Other")
    print("-" * width + "\n")


def print_completion_box(start_time):
    width = 156
    pattern = "====    "
    long_pattern = pattern * 40
    neon_colors = [Fore.LIGHTRED_EX, Fore.LIGHTMAGENTA_EX]

    final_elapsed = time.time() - start_time
    mins = int(final_elapsed) // 60
    secs = int(final_elapsed) % 60
    time_text = f"Time Taken: {mins} min {secs} sec"

    print("\n" * 4)
    try:
        import msvcrt
        is_windows = True
    except ImportError:
        is_windows = False

    stop_loop = False
    start_loop_time = time.time()
    offset = 0
    color_idx = 0

    while not stop_loop:
        if time.time() - start_loop_time > 5:
            break
        current_neon = neon_colors[color_idx % len(neon_colors)]
        border = long_pattern[offset:offset + width]
        line1 = "ALL COLLEGES EXTRACTED SUCCESSFULLY".center(width)
        line2 = time_text.center(width)
        sys.stdout.write("\033[F" * 4)
        sys.stdout.write("\r" + Style.BRIGHT + current_neon + border + Style.RESET_ALL + "\n")
        sys.stdout.write("\r" + Style.BRIGHT + Fore.LIGHTCYAN_EX + line1 + Style.RESET_ALL + "\n")
        sys.stdout.write("\r" + Style.BRIGHT + Fore.LIGHTCYAN_EX + line2 + Style.RESET_ALL + "\n")
        sys.stdout.write("\r" + Style.BRIGHT + current_neon + border + Style.RESET_ALL + "\n")
        sys.stdout.flush()
        for _ in range(8):
            if is_windows and msvcrt.kbhit():
                key = msvcrt.getch()
                if key == b'\r':
                    stop_loop = True
                    break
            time.sleep(0.01)
        if not stop_loop:
            offset = (offset + 1) % len(pattern)
            color_idx += 1

    sys.stdout.write("\033[F" * 4)
    print(Style.BRIGHT + Fore.LIGHTRED_EX + "=" * width)
    print(Style.BRIGHT + Fore.LIGHTCYAN_EX + "ALL COLLEGES EXTRACTED SUCCESSFULLY".center(width))
    print(Style.BRIGHT + Fore.LIGHTCYAN_EX + time_text.center(width))
    print(Style.BRIGHT + Fore.LIGHTRED_EX + "=" * width)


class ConsoleProgress:
    def __init__(self):
        self.bars = {}
        self.inst_list = []

    def __call__(self, event):
        etype = event.get('type')
        if etype == 'progress':
            phase = event['phase']
            if phase not in self.bars:
                color = random.choice(PROGRESS_COLORS)
                fmt = color + "{desc}: {percentage:3.0f}%|{bar:40}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]"
                self.bars[phase] = tqdm(total=event['total'], desc=phase, bar_format=fmt)
            bar = self.bars[phase]
            bar.n = event['page']
            bar.refresh()
        elif etype == 'discovered':
            self.inst_list = event['institute_list']
            width = 156
            print(Fore.GREEN + f"\n{'=' * width}")
            print(Fore.GREEN + Style.BRIGHT + f"TOTAL INSTITUTES FOUND: {event['institutes']}".center(width))
            print(Fore.GREEN + Style.BRIGHT + f"TOTAL BRANCHES FOUND: {event['branches']}".center(width))
            print(Fore.WHITE + "\n" + "Institute List:".center(width))
            print("-" * width)
            for idx, inst in enumerate(self.inst_list, 1):
                city = inst['city']
                city_str = f" [{Fore.CYAN}{city}{Fore.WHITE}]" if city else ""
                print(f"  {Fore.YELLOW}{idx:3d}.{Fore.WHITE} {inst['code']}  ->  {inst['name'][:55]}{city_str}  ({Fore.GREEN}{inst['branches']} branches{Fore.WHITE})")
            print(Fore.GREEN + f"{'=' * width}\n")
            print(Fore.CYAN + "Extracting... (one college / branch / category at a time)")
        elif etype == 'item':
            inst_name = event.get('inst_name') or ""
            branch_name = event.get('branch_name') or ""
            r = event['round']
            color = PROGRESS_COLORS[(r - 1) % len(PROGRESS_COLORS)]
            print(f"  {color}R{r}{Fore.WHITE} | {event['inst']} - {inst_name} | {event['branch']} - {branch_name} | {Fore.YELLOW}{event['category']}{Fore.WHITE} = {event['rank']} ({event['perc']}%)")
        elif etype == 'phase':
            phase = event['phase']
            if phase == 'discover':
                print(Fore.CYAN + "\n" + "=" * 80)
                print(Fore.YELLOW + "[PHASE 1] Scanning for ALL Institutes and Branches...")
                print(Fore.CYAN + "=" * 80)
            elif phase == 'excel':
                print(Fore.CYAN + "\n" + "=" * 80)
                print(Fore.YELLOW + "[PHASE 3] Generating Master Excel File...")
                print(Fore.CYAN + "=" * 80)
        elif etype == 'round_start':
            print(Fore.GREEN + Style.BRIGHT + f"\n  >> EXTRACTING R{event['round']} FROM {event.get('file', '')} ...")
        elif etype == 'done':
            print(Fore.GREEN + Style.BRIGHT + f"\n  SUCCESS: {event['file']}")
        elif etype == 'error':
            print(Fore.RED + f"\nERROR: {event['msg']}")


def main():
    while True:
        start_time = time.time()
        print_banner()
        try:
            progress = ConsoleProgress()
            saved_file = cet_core.run_workflow(pdf_folder="PDFs", output_dir="CET DATA", on_event=progress)
        except Exception as e:
            print(Fore.RED + f"\n  ERROR: {e}")
            saved_file = None

        print_completion_box(start_time)

        width = 156
        print("\n" + Fore.YELLOW + "=" * width)
        if saved_file:
            print(Fore.WHITE + Style.BRIGHT + f"  OUTPUT FILE: {saved_file}".center(width))
        print(Fore.YELLOW + "=" * width)
        print(Fore.CYAN + "\n  Press 'Enter' to Run Again.")
        print(Fore.CYAN + "  Type 'W' to Open the Localhost Web Server (live progress).")
        print(Fore.RED + "  Type 'Q' or 'Exit' to Quit.\n")

        user_choice = input(Fore.WHITE + "  Choice: ").strip().lower()
        if user_choice in ['q', 'exit', 'quit']:
            print(Fore.RED + "\nExiting Program. Goodbye!")
            break
        if user_choice in ['w', 'web']:
            import web_server
            web_server.main()


if __name__ == "__main__":
    main()