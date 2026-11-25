"""
Logger module for MHT-CET CAP All-Rounds Allotment Automation Tool.
Configures Loguru logging to log to file, console, and optional GUI/Web callbacks.
"""

import sys
from pathlib import Path
from typing import Callable, Optional
from loguru import logger

import config

_gui_log_callback: Optional[Callable[[str], None]] = None


def _gui_sink(message):
    """Sink wrapper to forward log messages to GUI callback if registered."""
    if _gui_log_callback:
        try:
            _gui_log_callback(message)
        except Exception:
            pass


def setup_logger(log_file_path: Optional[Path] = None, gui_callback: Optional[Callable[[str], None]] = None):
    """
    Initializes and configures the logger.

    Args:
        log_file_path: Optional path to the log file. Defaults to Output/automation.log.
        gui_callback: Optional callback function receiving log string lines for UI updates.
    """
    global _gui_log_callback
    _gui_log_callback = gui_callback

    target_log_file = log_file_path or config.DEFAULT_LOG_FILE
    target_log_file.parent.mkdir(parents=True, exist_ok=True)

    logger.remove()

    # Console Handler (Stderr)
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | "
               "<cyan>{module}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="INFO",
    )

    # File Handler
    logger.add(
        str(target_log_file),
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {module}:{line} - {message}",
        level="DEBUG",
        rotation="10 MB",
        retention="30 days",
        encoding="utf-8",
    )

    # GUI Sink Handler
    if gui_callback:
        logger.add(
            _gui_sink,
            format="{time:HH:mm:ss} | {level: <7} | {message}",
            level="INFO",
        )

    logger.info("Logger initialized successfully. Logging to {}", target_log_file)
    return logger


def register_gui_callback(callback: Callable[[str], None]):
    """Registers or updates the callback function for GUI/Web log streaming."""
    global _gui_log_callback
    _gui_log_callback = callback


# Default setup initialization
app_logger = logger