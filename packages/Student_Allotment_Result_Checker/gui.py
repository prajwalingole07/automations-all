"""
GUI module for MHT-CET CAP All-Rounds Allotment Automation Tool.  (v2 — full redesign)

Dark modern dashboard with:
- Round Selector screen with CLEAR selected-round feedback:
  highlighted card ring + check badge + "SELECTED: CAP ROUND X" bar + CONTINUE button
- Setup screen (check link, Excel file, automation settings) with step badges
- Live dashboard: metric cards, smooth animated progress bar, scanning dots,
  color-coded log console, Pause/Resume/Stop/Open Output/Open Log/Change Round.
"""

import os
import time
import queue
import threading
import subprocess
import webbrowser
from pathlib import Path
from typing import Optional
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

import config
from logger import setup_logger, register_gui_callback, app_logger
from excel_handler import ExcelHandler
from automation import AllotmentAutomation, InterruptedException


class AllotmentAppGUI:
    """Tkinter Desktop GUI for MHT-CET All-Rounds Allotment Automation Tool (v2)."""

    # ---- Theme (dark modern) ----------------------------------------- #
    T = {
        "bg": "#0F172A",            # page background (dark navy)
        "card": "#1E293B",          # card background
        "card2": "#273449",         # nested card / hover
        "border": "#334155",        # card border
        "text": "#F8FAFC",          # main text
        "muted": "#94A3B8",         # secondary text
        "header_from": "#1E3A8A",   # header gradient start
        "header_to": "#0284C7",     # header gradient end
        "green": "#22C55E",
        "amber": "#F59E0B",
        "red": "#EF4444",
        "sky": "#38BDF8",
        "input_bg": "#0B1120",
    }

    # ------------------------------------------------------------------ #
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("MHT-CET CAP All-Rounds Allotment Automation Tool")
        self.root.geometry("1100x800")
        self.root.minsize(980, 720)
        self.root.configure(bg=self.T["bg"])

        # ---- State ----
        self.selected_round: Optional[int] = None
        self.current_round = config.DEFAULT_ROUND_NO
        self.url_var = tk.StringVar(value=config.ROUNDS[self.current_round]["url"])
        self.input_file_var = tk.StringVar(value=str(config.DEFAULT_INPUT_FILE))
        self.output_dir_var = tk.StringVar(value=str(config.DEFAULT_OUTPUT_DIR))
        self.headless_var = tk.BooleanVar(value=config.DEFAULT_HEADLESS)
        self.retry_count_var = tk.IntVar(value=config.DEFAULT_RETRY_COUNT)
        self.delay_var = tk.DoubleVar(value=config.DEFAULT_DELAY_BETWEEN_REQUESTS)

        # ---- Metric vars ----
        self.stat_total_var = tk.StringVar(value="0")
        self.stat_completed_var = tk.StringVar(value="0")
        self.stat_remaining_var = tk.StringVar(value="0")
        self.stat_current_en_var = tk.StringVar(value="-")
        self.stat_current_name_var = tk.StringVar(value="-")
        self.stat_elapsed_var = tk.StringVar(value="00:00:00")
        self.stat_eta_var = tk.StringVar(value="00:00:00")
        self.stat_speed_var = tk.StringVar(value="0.0 s/student")
        self.stat_percent_var = tk.StringVar(value="0%")

        # ---- Selection bar label ----
        self.sel_label_var = tk.StringVar(value="SELECTED:  —  (click a round card above)")

        # ---- Control flags & threads ----
        self.is_running = False
        self.is_paused = False
        self.worker_thread: Optional[threading.Thread] = None
        self.msg_queue = queue.Queue()
        self.automation_engine: Optional[AllotmentAutomation] = None
        self.excel_handler: Optional[ExcelHandler] = None

        # ---- Animation state ----
        self._pulse_state = 0
        self._dot_state = 0
        self._anim_pct = 0.0
        self._target_pct = 0.0

        # ---- Fonts ----
        self.f_title = ("Segoe UI", 20, "bold")
        self.f_sub = ("Segoe UI", 10)
        self.f_h = ("Segoe UI", 10, "bold")
        self.f_b = ("Segoe UI", 9)
        self.f_val = ("Segoe UI", 15, "bold")
        self.f_small = ("Segoe UI", 8)
        self.f_big = ("Segoe UI", 26, "bold")

        self._setup_styles()

        # ---- Screens ----
        self.f_welcome = tk.Frame(root, bg=self.T["bg"])
        self.f_config = tk.Frame(root, bg=self.T["bg"])
        self.f_dash = tk.Frame(root, bg=self.T["bg"])
        self._build_welcome_screen()
        self._build_config_screen()
        self._build_dashboard_screen()
        self._show_screen(self.f_welcome)

        register_gui_callback(self._log_callback)

        self.root.after(600, self._animate_pulse)
        self.root.after(280, self._animate_scan_dots)
        self.root.after(50, self._animate_progress)
        self.root.after(100, self._process_queue)

    # ------------------------------------------------------------------ #
    #  Styles
    # ------------------------------------------------------------------ #
    def _setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure(".", font=self.f_b, background=self.T["bg"], foreground=self.T["text"])
        style.configure("TFrame", background=self.T["bg"])
        style.configure("TLabel", background=self.T["bg"], foreground=self.T["text"])
        style.configure("TEntry", fieldbackground=self.T["input_bg"], foreground=self.T["text"],
                        bordercolor=self.T["border"], insertcolor=self.T["text"])

        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"),
                        background=self.T["header_to"], foreground="white", padding=(18, 10))
        style.map("Primary.TButton", background=[("active", "#0369A1"), ("disabled", "#334155")])
        style.configure("Go.TButton", font=("Segoe UI", 11, "bold"),
                        background=self.T["green"], foreground="#04180B", padding=(20, 12))
        style.map("Go.TButton", background=[("active", "#16A34A"), ("disabled", "#1B2A22")])
        style.configure("Stop.TButton", font=("Segoe UI", 10, "bold"),
                        background=self.T["red"], foreground="white", padding=(14, 8))
        style.map("Stop.TButton", background=[("active", "#B91C1C"), ("disabled", "#3A2226")])
        style.configure("Pause.TButton", font=("Segoe UI", 10, "bold"),
                        background=self.T["amber"], foreground="#231402", padding=(14, 8))
        style.map("Pause.TButton", background=[("active", "#D97706"), ("disabled", "#3A3122")])
        style.configure("Ghost.TButton", font=("Segoe UI", 9, "bold"),
                        background=self.T["card2"], foreground=self.T["sky"], padding=(10, 6))
        style.map("Ghost.TButton", background=[("active", "#334155")])
        style.configure("GhostW.TButton", font=("Segoe UI", 9, "bold"),
                        background=self.T["card2"], foreground=self.T["text"], padding=(10, 6))
        style.map("GhostW.TButton", background=[("active", "#334155")])

        style.configure("Bar.Horizontal.TProgressbar", troughcolor=self.T["card2"],
                        background=self.T["green"], thickness=22)

    # ------------------------------------------------------------------ #
    #  Screen management
    # ------------------------------------------------------------------ #
    def _show_screen(self, frame):
        for f in (self.f_welcome, self.f_config, self.f_dash):
            f.pack_forget()
        frame.pack(fill="both", expand=True)

    # ================================================================== #
    #  SCREEN 1 — ROUND SELECTOR
    # ================================================================== #
    def _build_welcome_screen(self):
        f = self.f_welcome

        # ----- Header (gradient look) -----
        header = tk.Frame(f, bg=self.T["header_from"], height=120)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)
        tk.Frame(header, bg=self.T["header_to"], height=5).pack(side="bottom", fill="x")

        inner = tk.Frame(header, bg=self.T["header_from"])
        inner.pack(fill="both", expand=True, padx=30)

        top_row = tk.Frame(inner, bg=self.T["header_from"])
        top_row.pack(fill="x", pady=(14, 0))
        tk.Label(top_row, text="🎓 MHT-CET CAP ALLOTMENT AUTOMATION", font=self.f_title,
                 bg=self.T["header_from"], fg="white").pack(side="left")
        pulse_badge = tk.Frame(top_row, bg="#0B2347", padx=12, pady=5)
        pulse_badge.pack(side="right")
        self.pulse_dot = tk.Label(pulse_badge, text="●", font=("Segoe UI", 11, "bold"),
                                  bg="#0B2347", fg=self.T["green"])
        self.pulse_dot.pack(side="left")
        tk.Label(pulse_badge, text=" READY ", font=("Segoe UI", 9, "bold"),
                 bg="#0B2347", fg="white").pack(side="left")

        tk.Label(inner, text="Bulk-check ALLOTMENT STATUS for every student from your Excel file — "
                             "Rounds 1 • 2 • 3 • 4",
                 font=self.f_sub, bg=self.T["header_from"], fg="#BFDBFE", anchor="w").pack(fill="x")

        # ----- Cards -----
        grid = tk.Frame(f, bg=self.T["bg"])
        grid.pack(fill="both", expand=True, padx=34, pady=(18, 8))
        for c in range(2):
            grid.columnconfigure(c, weight=1, uniform="g")
        for r in range(2):
            grid.rowconfigure(r, weight=1, uniform="g")

        self._round_widgets = {}
        for rno, rinfo in config.ROUNDS.items():
            card_widgets = self._make_round_card(grid, rno, rinfo)
            self._round_widgets[rno] = card_widgets
            card_widgets["card"].grid(row=(rno - 1) // 2, column=(rno - 1) % 2,
                                      padx=10, pady=10, sticky="nsew")

        # ----- Selection bar + continue -----
        bar = tk.Frame(f, bg=self.T["card"], highlightbackground=self.T["border"], highlightthickness=1)
        bar.pack(fill="x", side="bottom", padx=34, pady=(0, 26))

        self.sel_label = tk.Label(bar, textvariable=self.sel_label_var, font=("Segoe UI", 11, "bold"),
                                  bg=self.T["card"], fg=self.T["sky"], anchor="w")
        self.sel_label.pack(side="left", fill="x", expand=True, padx=20, pady=12)

        self.btn_continue = ttk.Button(bar, text="CONTINUE  ▶", style="Go.TButton",
                                       command=self._on_continue, state="disabled")
        self.btn_continue.pack(side="right", padx=16, pady=8)

    def _make_round_card(self, parent, rno, rinfo):
        accent = rinfo["accent"]
        released = rinfo["status"] == "Result released"

        card = tk.Frame(parent, bg=self.T["card"], bd=0,
                        highlightbackground=self.T["border"], highlightthickness=1)
        card.grid_propagate(False)

        accent_bar = tk.Frame(card, bg=accent, width=7)
        accent_bar.pack(fill="y", side="left")
        accent_bar.pack_propagate(False)

        body = tk.Frame(card, bg=self.T["card"])
        body.pack(fill="both", expand=True, side="left", padx=16, pady=12)

        top = tk.Frame(body, bg=self.T["card"])
        top.pack(fill="x")
        tk.Label(top, text=f"ROUND", font=("Segoe UI", 9, "bold"), bg=self.T["card"],
                 fg=self.T["muted"]).pack(side="top", anchor="w")
        tk.Label(top, text=str(rno), font=self.f_big, bg=self.T["card"], fg=accent).pack(anchor="w")
        tk.Label(top, text=rinfo["name"], font=("Segoe UI", 11, "bold"), bg=self.T["card"],
                 fg=self.T["text"]).pack(anchor="w")

        pill_bg = "#DCFCE7" if released else "#FEF3C7"
        pill_fg = "#166534" if released else "#92400E"
        tk.Label(body, text=("✔ " if released else "⏳ ") + rinfo["status"],
                 font=("Segoe UI", 8, "bold"), bg=pill_bg, fg=pill_fg,
                 padx=10, pady=3).pack(anchor="w", pady=(8, 6))

        note = rinfo["note"]
        tk.Label(body, text=note, font=("Segoe UI", 8), bg=self.T["card"],
                 fg=self.T["muted"], wraplength=380, justify="left", anchor="w").pack(fill="x")

        check = tk.Label(body, text="", font=("Segoe UI", 10, "bold"),
                         bg=self.T["card"], fg=accent, anchor="w")
        check.pack(fill="x", pady=(8, 0))

        # ---- interactions ----
        def on_enter(_):
            if self.selected_round != rno:
                card.configure(bg=self.T["card2"], highlightbackground=accent, highlightthickness=1)
                for w in (body, top):
                    w.configure(bg=self.T["card2"])
                for child in top.winfo_children():
                    try:
                        child.configure(bg=self.T["card2"])
                    except tk.TclError:
                        pass

        def on_leave(_):
            if self.selected_round == rno:
                self._apply_selected_style(rno, True)
            else:
                card.configure(bg=self.T["card"], highlightbackground=self.T["border"], highlightthickness=1)
                for w in (body, top):
                    w.configure(bg=self.T["card"])
                for child in top.winfo_children():
                    try:
                        child.configure(bg=self.T["card"])
                    except tk.TclError:
                        pass

        def on_click(_=None):
            self._select_round(rno)

        for w in (card, accent_bar, body, top):
            w.bind("<Enter>", on_enter)
            w.bind("<Leave>", on_leave)
            w.bind("<Button-1>", on_click)
        for child in body.winfo_children():
            child.bind("<Button-1>", on_click)
            child.bind("<Enter>", on_enter)
            child.bind("<Leave>", on_leave)

        widgets = {"card": card, "body": body, "top": top, "accent": accent, "check": check}
        return widgets

    def _apply_selected_style(self, rno, selected):
        w = self._round_widgets[rno]
        card, accent = w["card"], w["accent"]
        if selected:
            card.configure(highlightbackground=accent, highlightthickness=3)
            w["check"].config(text="✓  SELECTED — click CONTINUE to proceed")
        else:
            card.configure(highlightbackground=self.T["border"], highlightthickness=1)
            w["check"].config(text="")

    def _select_round(self, rno):
        """Highlights the clicked round card (with ring + check badge) and updates the bar."""
        if self.selected_round is not None and self.selected_round != rno:
            self._apply_selected_style(self.selected_round, False)
        self.selected_round = rno
        self._apply_selected_style(rno, True)
        rinfo = config.ROUNDS[rno]
        self.sel_label_var.set(f"SELECTED:  {rinfo['name']}  (Round {rno})")
        self.sel_label.config(fg=rinfo["accent"])
        self.btn_continue.config(state="normal")
        app_logger.info("Round {} selected on welcome screen.", rno)

    def _on_continue(self):
        if self.selected_round is None:
            return
        self.current_round = self.selected_round
        rinfo = config.ROUNDS[self.current_round]
        self.url_var.set(rinfo["url"])
        self._update_round_banner()
        self._show_screen(self.f_config)

    # ================================================================== #
    #  SCREEN 2 — SETUP
    # ================================================================== #
    def _build_config_screen(self):
        f = self.f_config

        header = tk.Frame(f, bg=self.T["header_from"], height=84)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)
        tk.Frame(header, bg=self.T["header_to"], height=5).pack(side="bottom", fill="x")
        inner = tk.Frame(header, bg=self.T["header_from"])
        inner.pack(fill="both", expand=True, padx=22)

        tk.Button(inner, text="◀  ROUND SELECTOR", font=("Segoe UI", 9, "bold"),
                  bg="#0B2347", fg="white", bd=0, padx=12, pady=6, cursor="hand2",
                  activebackground="#0B2347", activeforeground=self.T["sky"],
                  command=self._back_to_selector).pack(side="left")

        self.config_title = tk.Label(inner, text="", font=("Segoe UI", 15, "bold"),
                                     bg=self.T["header_from"], fg="white")
        self.config_title.pack(side="left", padx=16)

        self.config_round_badge = tk.Label(inner, text="", font=("Segoe UI", 10, "bold"),
                                           bg="#0B2347", fg=self.T["green"], padx=12, pady=4)
        self.config_round_badge.pack(side="right")

        # Release banner
        self.round_banner = tk.Label(f, text="", font=("Segoe UI", 9, "bold"),
                                     wraplength=1010, justify="left", anchor="w", padx=14, pady=8)
        self.round_banner.pack(fill="x", padx=30, pady=(18, 4))

        # STEP 1 — Link
        self._step_card(f, 1, "ALLOTMENT CHECK LINK", "Paste the official link (pre-filled per round — edit if needed)",
                        self._build_link_row)

        # STEP 2 — Excel
        self._step_card(f, 2, "STUDENTS EXCEL FILE", "Columns SRNO / NAME / APPLICATION NO / DOB are auto-detected",
                        self._build_excel_row)

        # STEP 3 — Settings
        self._step_card(f, 3, "AUTOMATION SETTINGS", "Tune the checker behaviour", self._build_settings_row)

        # Launch button
        btn_row = tk.Frame(f, bg=self.T["bg"])
        btn_row.pack(fill="x", padx=30, pady=(16, 24))
        self.btn_launch = ttk.Button(btn_row, text="🚀  START ALLOTMENT CHECKING", style="Go.TButton",
                                     command=self.start_automation)
        self.btn_launch.pack(fill="x", ipady=8)

    def _step_card(self, parent, num, title, hint, build_fn):
        card = tk.Frame(parent, bg=self.T["card"], highlightbackground=self.T["border"], highlightthickness=1)
        card.pack(fill="x", padx=30, pady=6)

        head = tk.Frame(card, bg=self.T["card"])
        head.pack(fill="x", padx=14, pady=(10, 0))
        tk.Label(head, text=str(num), font=("Segoe UI", 13, "bold"), bg=self.T["card"], fg=self.T["sky"],
                 padx=8, pady=1).pack(side="left")
        texts = tk.Frame(head, bg=self.T["card"])
        texts.pack(side="left", fill="x", expand=True, padx=(8, 0))
        tk.Label(texts, text=title, font=("Segoe UI", 10, "bold"), bg=self.T["card"],
                 fg=self.T["text"], anchor="w").pack(fill="x")
        tk.Label(texts, text=hint, font=("Segoe UI", 8), bg=self.T["card"],
                 fg=self.T["muted"], anchor="w").pack(fill="x")

        body = tk.Frame(card, bg=self.T["card"])
        body.pack(fill="x", padx=14, pady=10)
        build_fn(body)

    def _make_entry(self, parent):
        e = tk.Entry(parent, textvariable=None, font=("Consolas", 10),
                     bg=self.T["input_bg"], fg=self.T["text"], relief="flat",
                     highlightbackground=self.T["border"], highlightthickness=1,
                     insertbackground=self.T["text"])
        return e

    def _build_link_row(self, body):
        row = tk.Frame(body, bg=self.T["card"])
        row.pack(fill="x")
        self.url_entry = self._make_entry(row)
        self.url_entry.config(textvariable=self.url_var)
        self.url_entry.pack(side="left", fill="x", expand=True, ipady=6)
        ttk.Button(row, text="↺ RESET", style="GhostW.TButton", command=self._reset_url).pack(side="left", padx=(8, 0))
        ttk.Button(row, text="🔗 VERIFY IN BROWSER", style="Ghost.TButton", command=self._open_url_in_browser).pack(side="left", padx=(8, 0))

    def _build_excel_row(self, body):
        row = tk.Frame(body, bg=self.T["card"])
        row.pack(fill="x")
        self.excel_entry = self._make_entry(row)
        self.excel_entry.config(textvariable=self.input_file_var)
        self.excel_entry.pack(side="left", fill="x", expand=True, ipady=6)
        ttk.Button(row, text="📁 BROWSE", style="Primary.TButton", command=self._browse_excel).pack(side="left", padx=(8, 0))
        ttk.Button(row, text="👁 PREVIEW", style="Ghost.TButton", command=self._preview_excel).pack(side="left", padx=(8, 0))

    def _build_settings_row(self, body):
        row = tk.Frame(body, bg=self.T["card"])
        row.pack(fill="x")
        cb = tk.Checkbutton(row, text="Headless Mode (hide browser)", variable=self.headless_var,
                            bg=self.T["card"], fg=self.T["text"], selectcolor=self.T["input_bg"],
                            activebackground=self.T["card"], activeforeground=self.T["text"])
        cb.pack(side="left", padx=(0, 20))
        tk.Label(row, text="Retry Count:", bg=self.T["card"], fg=self.T["text"]).pack(side="left")
        self.retry_spin = tk.Spinbox(row, from_=1, to=10, textvariable=self.retry_count_var, width=5,
                                     bg=self.T["input_bg"], fg=self.T["text"], buttonbackground=self.T["card2"])
        self.retry_spin.pack(side="left", padx=(4, 20))
        tk.Label(row, text="Delay (sec):", bg=self.T["card"], fg=self.T["text"]).pack(side="left")
        self.delay_spin = tk.Spinbox(row, from_=0.0, to=5.0, increment=0.5, textvariable=self.delay_var, width=5,
                                     bg=self.T["input_bg"], fg=self.T["text"], buttonbackground=self.T["card2"])
        self.delay_spin.pack(side="left")

    def _update_round_banner(self):
        rinfo = config.ROUNDS[self.current_round]
        self.config_title.config(text=f"{rinfo['name']}  —  SETUP")
        self.config_round_badge.config(text=f"ROUND {self.current_round}", fg=rinfo["accent"])
        if rinfo["status"] == "Result released":
            self.round_banner.config(text=f"✔  {rinfo['status']}.  {rinfo['note']}",
                                     bg="#0A2E1A", fg=self.T["green"])
        else:
            self.round_banner.config(text=f"⏳  {rinfo['status']}.  {rinfo['note']}",
                                     bg="#2E2508", fg=self.T["amber"])

    def _back_to_selector(self):
        if self.is_running:
            messagebox.showwarning("Running", "Stop the running automation first.")
            return
        self._show_screen(self.f_welcome)

    # ================================================================== #
    #  SCREEN 3 — DASHBOARD
    # ================================================================== #
    def _build_dashboard_screen(self):
        f = self.f_dash

        header = tk.Frame(f, bg=self.T["header_from"], height=84)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)
        tk.Frame(header, bg=self.T["header_to"], height=5).pack(side="bottom", fill="x")
        inner = tk.Frame(header, bg=self.T["header_from"])
        inner.pack(fill="both", expand=True, padx=22)

        tk.Button(inner, text="⬅  SETUP", font=("Segoe UI", 9, "bold"),
                  bg="#0B2347", fg="white", bd=0, padx=12, pady=6, cursor="hand2",
                  activebackground="#0B2347", activeforeground=self.T["sky"],
                  command=self._back_to_setup).pack(side="left")

        self.dash_title = tk.Label(inner, text="", font=("Segoe UI", 15, "bold"),
                                   bg=self.T["header_from"], fg="white")
        self.dash_title.pack(side="left", padx=16)

        badge = tk.Frame(inner, bg="#0B2347", padx=12, pady=5)
        badge.pack(side="right")
        self.live_dot = tk.Label(badge, text="●", font=("Segoe UI", 12, "bold"),
                                 bg="#0B2347", fg=self.T["green"])
        self.live_dot.pack(side="left")
        self.live_lbl = tk.Label(badge, text=" IDLE ", font=("Segoe UI", 9, "bold"),
                                 bg="#0B2347", fg="white")
        self.live_lbl.pack(side="left")

        # Metrics grid
        mframe = tk.Frame(f, bg=self.T["bg"])
        mframe.pack(fill="x", padx=24, pady=14)
        for c in range(4):
            mframe.columnconfigure(c, weight=1, uniform="m")

        cards = [
            ("TOTAL STUDENTS", self.stat_total_var, self.T["sky"], 0, 0),
            ("COMPLETED", self.stat_completed_var, self.T["green"], 0, 1),
            ("REMAINING", self.stat_remaining_var, self.T["amber"], 0, 2),
            ("SPEED", self.stat_speed_var, self.T["sky"], 0, 3),
            ("CURRENT APP NO", self.stat_current_en_var, self.T["text"], 1, 0),
            ("CURRENT STUDENT", self.stat_current_name_var, self.T["text"], 1, 1),
            ("ELAPSED", self.stat_elapsed_var, self.T["text"], 1, 2),
            ("EST. REMAINING", self.stat_eta_var, self.T["text"], 1, 3),
        ]
        for title, var, color, r, c in cards:
            card = tk.Frame(mframe, bg=self.T["card"], highlightbackground=self.T["border"],
                            highlightthickness=1)
            card.grid(row=r, column=c, padx=5, pady=5, sticky="nsew")
            tk.Label(card, text=title, font=("Segoe UI", 7, "bold"), bg=self.T["card"],
                     fg=self.T["muted"], anchor="w").pack(anchor="w", padx=10, pady=(8, 1))
            tk.Label(card, textvariable=var, font=self.f_val, bg=self.T["card"],
                     fg=color, anchor="w").pack(anchor="w", padx=10, pady=(0, 8))

        # Scan indicator + progress
        pframe = tk.Frame(f, bg=self.T["bg"])
        pframe.pack(fill="x", padx=24, pady=(8, 0))
        self.scan_lbl = tk.Label(pframe, text="● ○ ○  Waiting…", font=("Consolas", 9, "bold"),
                                 bg=self.T["bg"], fg=self.T["sky"], anchor="w")
        self.scan_lbl.pack(side="left")
        self.pbar = ttk.Progressbar(pframe, style="Bar.Horizontal.TProgressbar", mode="determinate")
        self.pbar.pack(side="left", fill="x", expand=True, padx=(14, 10))
        self.pct_label = tk.Label(pframe, textvariable=self.stat_percent_var, font=("Segoe UI", 11, "bold"),
                                  bg=self.T["bg"], fg=self.T["green"])
        self.pct_label.pack(side="right")

        self.out_lbl = tk.Label(f, text="", font=("Segoe UI", 8), bg=self.T["bg"], fg=self.T["muted"])
        self.out_lbl.pack(fill="x", padx=28, pady=(4, 0))

        # Buttons
        btns = tk.Frame(f, bg=self.T["bg"])
        btns.pack(fill="x", padx=24, pady=10)
        self.btn_pause = ttk.Button(btns, text="⏸ PAUSE", style="Pause.TButton", command=self.pause_automation, state="disabled")
        self.btn_pause.pack(side="left", padx=4)
        self.btn_resume = ttk.Button(btns, text="⏯ RESUME", style="Go.TButton", command=self.resume_automation, state="disabled")
        self.btn_resume.pack(side="left", padx=4)
        self.btn_stop = ttk.Button(btns, text="⏹ STOP", style="Stop.TButton", command=self.stop_automation, state="disabled")
        self.btn_stop.pack(side="left", padx=4)
        ttk.Button(btns, text="📁 OUTPUT FOLDER", style="GhostW.TButton", command=self._open_output_folder).pack(side="right", padx=4)
        ttk.Button(btns, text="📝 LOG FILE", style="GhostW.TButton", command=self._open_log_file).pack(side="right", padx=4)

        # Log console
        log_frame = tk.Frame(f, bg=self.T["bg"])
        log_frame.pack(fill="both", expand=True, padx=24, pady=(2, 16))
        self.log_text = scrolledtext.ScrolledText(
            log_frame, wrap="word", font=("Consolas", 9),
            bg="#070B14", fg="#E2E8F0", insertbackground="white", state="disabled",
            relief="flat", highlightbackground=self.T["border"], highlightthickness=1)
        self.log_text.pack(fill="both", expand=True)
        self.log_text.tag_config("WARN", foreground="#FBBF24")
        self.log_text.tag_config("ERROR", foreground="#F87171")
        self.log_text.tag_config("GOOD", foreground="#4ADE80")
        self.log_text.tag_config("INFO", foreground="#93C5FD")

    def _back_to_setup(self):
        if self.is_running:
            messagebox.showwarning("Running", "Automation is running. Stop it before going back.")
            return
        self._show_screen(self.f_config)

    # ================================================================== #
    #  ACTIONS
    # ================================================================== #
    def _reset_url(self):
        self.url_var.set(config.ROUNDS[self.current_round]["url"])

    def _open_url_in_browser(self):
        url = self.url_var.get().strip()
        if url:
            webbrowser.open(url)

    def _browse_excel(self):
        file_path = filedialog.askopenfilename(
            title="Select Student Allotment Input Excel",
            filetypes=[("Excel Files", "*.xlsx *.xls"), ("All Files", "*.*")])
        if file_path:
            self.input_file_var.set(file_path)

    def _preview_excel(self):
        input_path = Path(self.input_file_var.get())
        if not input_path.exists():
            messagebox.showerror("File Error", f"Excel file not found at:\n{input_path}")
            return
        try:
            handler = ExcelHandler(input_path, round_no=self.current_round)
            df = handler.load_input_data()
            completed = len(df[df[config.COL_LOGIN_STATUS] != ""])
            messagebox.showinfo(
                "Excel Preview",
                f"File: {input_path.name}\n\nStudents found: {len(df)}\n"
                f"Already completed (resume): {completed}\n\n"
                f"Output report: {handler.output_path.name}")
        except Exception as e:
            messagebox.showerror("Excel Error", str(e))

    def start_automation(self):
        url = self.url_var.get().strip()
        input_path = Path(self.input_file_var.get())

        if not url.startswith("http"):
            messagebox.showerror("URL Error", "Please paste the official allotment check link first (must start with http).")
            return
        if not input_path.exists():
            messagebox.showerror("File Error", f"Input Excel file not found at:\n{input_path}")
            return

        try:
            test_handler = ExcelHandler(input_path, round_no=self.current_round)
            df = test_handler.load_input_data()
        except Exception as e:
            messagebox.showerror("Excel Error", str(e))
            return

        proceed = messagebox.askyesno(
            "Confirm Start",
            f"CAP Round:  {config.ROUNDS[self.current_round]['name']}\n"
            f"Check URL:  {url}\n\n"
            f"Students found:  {len(df)}\n"
            f"Resumable (already done):  {len(df[df[config.COL_LOGIN_STATUS] != ''])}\n\n"
            f"Output report:  {config.output_file_for_round(self.current_round).name}\n\n"
            "Start checking allotments now?")
        if not proceed:
            return

        self.is_running = True
        self.is_paused = False
        self.btn_launch.config(state="disabled")
        self.btn_pause.config(state="normal")
        self.btn_resume.config(state="disabled")
        self.btn_stop.config(state="normal")
        self._target_pct = 0.0
        self._anim_pct = 0.0

        self._show_screen(self.f_dash)
        self.dash_title.config(text=f"LIVE DASHBOARD — {config.ROUNDS[self.current_round]['name']}")
        self.out_lbl.config(text=f"Output report: {config.output_file_for_round(self.current_round).name}   •   "
                                 f"Check link: {url}")
        self.scan_lbl.config(text="● ○ ○  Preparing browser…")
        self.pulse_dot.config(fg=self.T["green"])
        self.live_lbl.config(text=" RUNNING ")
        self.live_dot.config(fg=self.T["green"])

        self.worker_thread = threading.Thread(target=self._run_automation_worker, daemon=True)
        self.worker_thread.start()

    # ================================================================== #
    #  WORKER THREAD
    # ================================================================== #
    def _run_automation_worker(self):
        start_time = time.time()
        url = self.url_var.get().strip()

        try:
            input_path = Path(self.input_file_var.get())
            self.excel_handler = ExcelHandler(input_path, round_no=self.current_round)
            df = self.excel_handler.load_input_data()

            total_count = len(df)
            if total_count == 0:
                self.msg_queue.put(("ERROR", "Input Excel file contains no valid data rows."))
                return

            self.automation_engine = AllotmentAutomation(
                headless=self.headless_var.get(),
                retry_count=self.retry_count_var.get(),
                request_delay=self.delay_var.get(),
                target_url=url,
                round_no=self.current_round)
            app_logger.info("{:=^80}", f" STARTING {config.ROUNDS[self.current_round]['name'].upper()} ALLOTMENT CHECK ")
            app_logger.info("Target URL: {}", url)
            app_logger.info("Students to check: {}", total_count)
            self.automation_engine.start_browser()

            for idx, row in df.iterrows():
                if not self.is_running:
                    break

                app_no = str(row[config.COL_APP_NO]).strip()
                name = str(row[config.COL_NAME]).strip()
                dob = str(row[config.COL_DOB]).strip()
                existing_login = str(row[config.COL_LOGIN_STATUS]).strip()

                completed_count = len(df[df[config.COL_LOGIN_STATUS] != ""])
                remaining_count = total_count - completed_count
                elapsed_sec = time.time() - start_time

                if completed_count > 0:
                    avg_sec_per_student = elapsed_sec / completed_count
                    eta_sec = avg_sec_per_student * remaining_count
                    speed_str = f"{avg_sec_per_student:.1f} s/student"
                else:
                    eta_sec = 0
                    speed_str = "0.0 s/student"

                self.msg_queue.put(("PROGRESS", {
                    "total": str(total_count),
                    "completed": str(completed_count),
                    "remaining": str(remaining_count),
                    "current_en": app_no,
                    "current_name": name,
                    "elapsed": self._format_seconds(elapsed_sec),
                    "eta": self._format_seconds(eta_sec),
                    "speed": speed_str,
                    "percent": (completed_count / total_count) * 100}))

                if existing_login:
                    app_logger.info("Row {} (App: {}) already processed. Skipping...", idx + 1, app_no)
                    continue

                if not app_no or app_no == "NAN" or not app_no.startswith("EN"):
                    app_logger.warning("Row {} ({}) missing valid Application Number ('{}'). Marking FAILED.", idx + 1, name, app_no)
                    self.excel_handler.update_student_result(idx, config.STATUS_FAILED, config.ALLOTMENT_INVALID, "-", "-")
                    self.excel_handler.save_report()
                    continue

                cached_res = self.excel_handler.get_cached_result(app_no)
                if cached_res:
                    app_logger.info("Duplicate App No {} — reusing cached result.", app_no)
                    self.excel_handler.update_student_result(
                        idx, cached_res[config.COL_LOGIN_STATUS], cached_res[config.COL_ALLOTMENT_STATUS],
                        cached_res[config.COL_COLLEGE_NAME], cached_res[config.COL_BRANCH])
                else:
                    app_logger.info("Checking [{}/{}] {} (App: {})", idx + 1, total_count, name, app_no)
                    result = self.automation_engine.process_student(app_no, dob)
                    self.excel_handler.update_student_result(
                        idx, result[config.COL_LOGIN_STATUS], result[config.COL_ALLOTMENT_STATUS],
                        result[config.COL_COLLEGE_NAME], result[config.COL_BRANCH], result.get(config.COL_PREF_NO, "-"))

                self.excel_handler.save_report()

            completed_count = len(df[df[config.COL_LOGIN_STATUS] != ""])
            self.msg_queue.put(("PROGRESS", {
                "total": str(total_count),
                "completed": str(completed_count),
                "remaining": str(total_count - completed_count),
                "current_en": "FINISHED",
                "current_name": "All Done",
                "elapsed": self._format_seconds(time.time() - start_time),
                "eta": "00:00:00",
                "speed": "Completed",
                "percent": (completed_count / total_count) * 100 if total_count > 0 else 100}))
            self.msg_queue.put(("FINISHED", (
                f"Automation run completed successfully!\n\n"
                f"Report saved to:\n{self.excel_handler.output_path}\n\n"
                f"SUCCESS logins: {len(df[df[config.COL_LOGIN_STATUS] == config.STATUS_SUCCESS])}\n"
                f"FAILED logins: {len(df[df[config.COL_LOGIN_STATUS] == config.STATUS_FAILED])}")))

        except InterruptedException:
            app_logger.info("Automation process interrupted by user.")
            self.msg_queue.put(("FINISHED", "Automation stopped by user."))

        except Exception as e:
            app_logger.error("Unhandled exception in automation worker: {}", e)
            self.msg_queue.put(("ERROR", f"Error during automation: {e}"))

        finally:
            if self.automation_engine:
                self.automation_engine.close_browser()
            self.is_running = False
            self.msg_queue.put(("STOPPED", None))

    # ================================================================== #
    #  QUEUE PROCESSOR
    # ================================================================== #
    def _process_queue(self):
        try:
            while True:
                msg_type, data = self.msg_queue.get_nowait()

                if msg_type == "LOG":
                    self._append_log(str(data))

                elif msg_type == "PROGRESS":
                    self.stat_total_var.set(data["total"])
                    self.stat_completed_var.set(data["completed"])
                    self.stat_remaining_var.set(data["remaining"])
                    self.stat_current_en_var.set(data["current_en"])
                    self.stat_current_name_var.set(data["current_name"])
                    self.stat_elapsed_var.set(data["elapsed"])
                    self.stat_eta_var.set(data["eta"])
                    self.stat_speed_var.set(data["speed"])
                    self._target_pct = data["percent"]

                elif msg_type == "FINISHED":
                    self._target_pct = 100.0
                    self.live_lbl.config(text=" DONE ")
                    self.live_dot.config(fg=self.T["green"])
                    self._reset_controls()
                    messagebox.showinfo("Automation Complete", str(data))

                elif msg_type == "STOPPED":
                    self.live_lbl.config(text=" IDLE ")
                    self.live_dot.config(fg=self.T["green"])
                    self._reset_controls()
                    self.scan_lbl.config(text="● ○ ○  Idle — use SETUP to run again.")

                elif msg_type == "ERROR":
                    self.live_lbl.config(text=" ERROR ")
                    self.live_dot.config(fg=self.T["red"])
                    self._reset_controls()
                    messagebox.showerror("Execution Error", str(data))

        except queue.Empty:
            pass
        finally:
            self.root.after(100, self._process_queue)

    def _reset_controls(self):
        self.btn_launch.config(state="normal")
        self.btn_pause.config(state="disabled")
        self.btn_resume.config(state="disabled")
        self.btn_stop.config(state="disabled")

    def pause_automation(self):
        if self.automation_engine and self.is_running:
            self.automation_engine.request_pause()
            self.is_paused = True
            self.btn_pause.config(state="disabled")
            self.btn_resume.config(state="normal")
            self.live_lbl.config(text=" PAUSED ")
            self.live_dot.config(fg=self.T["amber"])
            app_logger.info("Automation execution paused.")

    def resume_automation(self):
        if self.automation_engine and self.is_running:
            self.automation_engine.resume_execution()
            self.is_paused = False
            self.btn_pause.config(state="normal")
            self.btn_resume.config(state="disabled")
            self.live_lbl.config(text=" RUNNING ")
            self.live_dot.config(fg=self.T["green"])
            app_logger.info("Automation execution resumed.")

    def stop_automation(self):
        if self.automation_engine and self.is_running:
            self.automation_engine.request_stop()
            self.btn_stop.config(state="disabled")
            app_logger.info("Stopping automation execution...")

    def _open_output_folder(self):
        out_dir = Path(self.output_dir_var.get())
        out_dir.mkdir(parents=True, exist_ok=True)
        try:
            if os.name == "nt":
                os.startfile(out_dir)
            else:
                subprocess.Popen(["xdg-open", str(out_dir)])
        except Exception as e:
            messagebox.showerror("Error", f"Could not open output folder: {e}")

    def _open_log_file(self):
        log_file = config.DEFAULT_LOG_FILE
        if not log_file.exists():
            messagebox.showinfo("Info", "Log file does not exist yet. Run automation first.")
            return
        try:
            if os.name == "nt":
                os.startfile(log_file)
            else:
                subprocess.Popen(["xdg-open", str(log_file)])
        except Exception as e:
            messagebox.showerror("Error", f"Could not open log file: {e}")

    # ================================================================== #
    #  ANIMATIONS
    # ================================================================== #
    def _animate_pulse(self):
        self._pulse_state = (self._pulse_state + 1) % 4
        try:
            if self.is_running and not self.is_paused:
                colors = [self.T["green"], self.T["sky"], self.T["green"], self.T["sky"]]
            elif self.is_paused:
                colors = [self.T["amber"], self.T["amber"], self.T["green"], self.T["amber"]]
            else:
                colors = [self.T["green"], self.T["green"], self.T["sky"], self.T["green"]]
            self.pulse_dot.config(fg=colors[self._pulse_state])
            self.live_dot.config(fg=colors[self._pulse_state])
        except tk.TclError:
            pass
        self.root.after(400, self._animate_pulse)

    def _animate_scan_dots(self):
        try:
            if self.is_running and not self.is_paused:
                frames = ["● ○ ○", "○ ● ○", "○ ○ ●"]
                self._dot_state = (self._dot_state + 1) % len(frames)
                self.scan_lbl.config(text=f"{frames[self._dot_state]}  Scanning student allotments — one-by-one…")
            elif self.is_paused:
                self.scan_lbl.config(text="◼ ◼ ◼  Paused…")
        except tk.TclError:
            pass
        self.root.after(280, self._animate_scan_dots)

    def _animate_progress(self):
        try:
            if self._anim_pct < self._target_pct:
                self._anim_pct = min(self._target_pct,
                                     self._anim_pct + max(0.5, (self._target_pct - self._anim_pct) * 0.2))
                self.pbar["value"] = self._anim_pct
                self.stat_percent_var.set(f"{self._anim_pct:.0f}%")
            elif self._anim_pct > self._target_pct:
                self._anim_pct = max(self._target_pct, self._anim_pct - 1)
                self.pbar["value"] = self._anim_pct
                self.stat_percent_var.set(f"{self._anim_pct:.0f}%")
        except tk.TclError:
            pass
        self.root.after(50, self._animate_progress)

    # ================================================================== #
    #  HELPERS
    # ================================================================== #
    def _log_callback(self, message: str):
        self.msg_queue.put(("LOG", message))

    def _append_log(self, line: str):
        self.log_text.config(state="normal")
        tag = "INFO"
        upper = line.upper()
        if "ERROR" in upper or "FATAL" in upper:
            tag = "ERROR"
        elif "WARN" in upper or "RETRY" in upper:
            tag = "WARN"
        elif "SUCCESS" in upper or "ALLOTTED" in upper or "COMPLETED" in upper:
            tag = "GOOD"
        self.log_text.insert("end", line + "\n", tag)
        self.log_text.see("end")
        self.log_text.config(state="disabled")

    @staticmethod
    def _format_seconds(seconds: float) -> str:
        if seconds < 0:
            seconds = 0
        m, s = divmod(int(seconds), 60)
        h, m = divmod(m, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"


def launch_desktop_app():
    """Entry point: launches the Tkinter desktop application."""
    config.DEFAULT_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    config.DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    setup_logger()
    app_logger.info("Starting MHT-CET CAP All-Rounds Allotment Automation Application (v2 GUI)...")

    root = tk.Tk()
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    window_width = 1100
    window_height = 800
    center_x = max(0, int((screen_width - window_width) / 2))
    center_y = max(0, int((screen_height - window_height) / 2))
    root.geometry(f"{window_width}x{window_height}+{center_x}+{center_y}")

    app = AllotmentAppGUI(root)
    root.mainloop()