"""
Main entry point for MHT-CET CAP All-Rounds Allotment Automation Tool.

Usage:
    python main.py              -> Desktop GUI app (round selector + dashboard)
    python main.py --web        -> Local web dashboard server (http://localhost:5000)
"""

import sys
import ctypes


def _enable_high_dpi():
    """Enable per-monitor DPI awareness on Windows for crisp rendering."""
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)  # PROCESS_SYSTEM_DPI_AWARE
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def main():
    if "--web" in sys.argv:
        from web_app import main as web_main
        web_main()
        return

    _enable_high_dpi()
    from gui import launch_desktop_app
    launch_desktop_app()


if __name__ == "__main__":
    main()