"""
Web Dashboard Server for MHT-CET CAP All-Rounds Allotment Automation Tool.
Runs a web app at http://localhost:5000 (or 0.0.0.0:5000 with --host 0.0.0.0)
with round selection (1-4), editable check-link, Excel upload, live progress
streaming, animated UI, and report generation.

Usage:
    python web_app.py                          # localhost:5000
    python web_app.py --host 0.0.0.0 --port 5000   # accessible from other machines
"""

import sys
import os
import json
import time
import base64
import queue
import threading
import webbrowser
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import config
from logger import setup_logger, register_gui_callback, app_logger
from excel_handler import ExcelHandler
from automation import AllotmentAutomation, InterruptedException

# Global Application State
STATE = {
    "round_no": config.DEFAULT_ROUND_NO,
    "round_name": config.ROUNDS[config.DEFAULT_ROUND_NO]["name"],
    "round_status": config.ROUNDS[config.DEFAULT_ROUND_NO]["status"],
    "round_note": config.ROUNDS[config.DEFAULT_ROUND_NO]["note"],
    "target_url": config.ROUNDS[config.DEFAULT_ROUND_NO]["url"],
    "is_running": False,
    "is_paused": False,
    "total": 0,
    "completed": 0,
    "remaining": 0,
    "current_en": "-",
    "current_name": "-",
    "elapsed": "00:00:00",
    "eta": "00:00:00",
    "speed": "0.0 s/student",
    "percent": 0.0,
    "input_file": str(config.DEFAULT_INPUT_FILE),
    "output_file": str(config.output_file_for_round(config.DEFAULT_ROUND_NO)),
    "headless": False,
    "retry_count": config.DEFAULT_RETRY_COUNT,
    "delay": config.DEFAULT_DELAY_BETWEEN_REQUESTS,
    "import_status": "Ready to import student Excel file",
}

LOG_HISTORY = []
LOG_LOCK = threading.Lock()
AUTOMATION_ENGINE = None
EXCEL_HANDLER = None
WORKER_THREAD = None


def web_log_callback(msg: str):
    """Appends log line to history buffer for Web API streaming."""
    with LOG_LOCK:
        LOG_HISTORY.append(msg)
        if len(LOG_HISTORY) > 1000:
            LOG_HISTORY.pop(0)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MHT-CET All-Rounds Allotment Automation</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet">
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
    .container { max-width: 1100px; margin: 0 auto; }

    .header { background: linear-gradient(135deg, #1e3a8a, #0284c7); padding: 22px 30px; border-radius: 12px; margin-bottom: 18px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 22px; font-weight: 800; color: #fff; }
    .header p { font-size: 13px; color: #e0f2fe; margin-top: 4px; }
    .live-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.25); padding: 8px 14px; border-radius: 30px; font-weight: 700; font-size: 13px; color: #fff; }
    .live-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: pulse 1s infinite; }
    .live-dot.running { background: #4ade80; }
    .live-dot.paused { background: #f59e0b; }
    @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1);} 50% { opacity: 0.4; transform: scale(0.75);} }

    .card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 18px; border: 1px solid #334155; }
    .card-title { font-size: 15px; font-weight: 700; color: #38bdf8; margin-bottom: 14px; border-bottom: 1px solid #334155; padding-bottom: 8px; }

    .rounds { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .round-tile { background: #0f172a; border: 2px solid #334155; border-radius: 12px; padding: 16px; cursor: pointer; transition: all .2s ease; position: relative; overflow: hidden; }
    .round-tile:hover { transform: translateY(-3px); border-color: #38bdf8; box-shadow: 0 8px 20px -6px rgba(56,189,248,0.4); }
    .round-tile.active { border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56,189,248,0.3); }
    .round-tile .rno { font-size: 26px; font-weight: 800; }
    .round-tile .rname { font-size: 13px; color: #94a3b8; margin: 2px 0 8px; }
    .round-tile .rstatus { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; display: inline-block; }
    .rstatus.live { background: #dcfce7; color: #166534; }
    .rstatus.wait { background: #fef3c7; color: #92400e; }
    .tile-glow { position: absolute; top: -30px; right: -30px; width: 90px; height: 90px; border-radius: 50%; background: radial-gradient(circle, rgba(56,189,248,0.25), transparent 70%); }

    .round-note { background: #fef3c7; color: #92400e; padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-top: 12px; border-left: 4px solid #f59e0b; }
    .round-note.live-note { background: #dcfce7; color: #166534; border-left-color: #22c55e; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .metric-box { background: #0f172a; padding: 14px; border-radius: 8px; border-left: 4px solid #0284c7; }
    .metric-title { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-val { font-size: 18px; font-weight: 800; color: #f8fafc; margin-top: 4px; word-break: break-all; }

    .progress-bg { background: #334155; height: 24px; border-radius: 12px; overflow: hidden; margin-top: 14px; position: relative; }
    .progress-fill { background: linear-gradient(90deg, #dc2626, #ef4444); height: 100%; width: 0%; transition: width .4s ease; }
    .progress-text { position: absolute; width: 100%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 800; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }

    .controls { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .btn { padding: 11px 20px; border-radius: 8px; font-weight: 700; border: none; cursor: pointer; transition: all .15s; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }
    .btn:hover:not(:disabled) { transform: translateY(-2px); }
    .btn-start { background: #16a34a; color: white; }
    .btn-start:hover { background: #15803d; }
    .btn-pause { background: #d97706; color: white; }
    .btn-pause:hover { background: #b45309; }
    .btn-stop { background: #dc2626; color: white; }
    .btn-stop:hover { background: #b91c1c; }
    .btn-resume { background: #0284c7; color: white; }
    .btn-resume:hover { background: #0369a1; }
    .btn-ghost { background: #475569; color: white; }
    .btn-ghost:hover { background: #334155; }

    .form-group { margin-bottom: 12px; }
    .form-group label { font-size: 12px; color: #cbd5e1; display: block; margin-bottom: 5px; font-weight: 600; }
    .form-control { width: 100%; padding: 10px; border-radius: 6px; background: #0f172a; border: 1px solid #334155; color: #fff; font-size: 13px; }
    .form-control:focus { outline: none; border-color: #38bdf8; }

    .scan-line { font-family: monospace; font-size: 13px; color: #38bdf8; margin-top: 10px; min-height: 18px; font-weight: 700; }

    .log-box { background: #090d16; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 12px; height: 250px; overflow-y: auto; color: #a7f3d0; border: 1px solid #1e293b; }
    .log-line { margin-bottom: 3px; white-space: pre-wrap; }
    .log-warn { color: #fbbf24; }
    .log-error { color: #f87171; }
    .log-good { color: #4ade80; }
</style>
</head>
<body>
<div class="container">

    <div class="header">
        <div>
            <h1>MHT-CET All-Rounds Allotment Automation</h1>
            <p>Round 1 • 2 • 3 • 4 — bulk allotment checker for students from Excel</p>
        </div>
        <div class="live-badge"><span class="live-dot" id="live-dot"></span><span id="live-text">IDLE</span></div>
    </div>

    <div class="card">
        <div class="card-title">1️⃣ SELECT CAP ROUND</div>
        <div class="rounds" id="round-tiles">
            <!-- injected by JS -->
        </div>
        <div class="round-note" id="round-note">Select a round above.</div>
    </div>

    <div class="card">
        <div class="card-title">2️⃣ CHECK LINK + STUDENTS EXCEL</div>
        <div class="grid">
            <div class="form-group" style="grid-column: span 2;">
                <label>Allotment Check Link (paste official link here):</label>
                <input type="text" id="target_url" class="form-control" value="">
            </div>
            <div class="form-group">
                <label>Browser Mode:</label>
                <select id="headless" class="form-control">
                    <option value="false" selected>Visible Chrome (Watch Live)</option>
                    <option value="true">Headless (Hidden)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Retry Count:</label>
                <input type="number" id="retry_count" class="form-control" value="3" min="1" max="10">
            </div>
            <div class="form-group" style="grid-column: span 2;">
                <label>Active Input File:</label>
                <input type="text" id="input_file" class="form-control" value="CONFIG_INPUT_FILE" readonly>
            </div>
        </div>
        <input type="file" id="excel-file-input" accept=".xlsx, .xls" style="display:none;" onchange="handleFileSelect(event)">
        <div class="status-banner" id="import-banner" style="background:#0f172a; padding:10px 14px; border-radius:8px; border-left:4px solid #38bdf8; font-size:13px; margin-top:6px;">Ready to import Excel file</div>
        <div class="controls">
            <button class="btn btn-start" onclick="document.getElementById('excel-file-input').click()">📥 IMPORT EXCEL</button>
            <button class="btn btn-start" id="btn-start" onclick="startAutomation()">▶ START CHECKING</button>
            <button class="btn btn-pause" id="btn-pause" onclick="pauseAutomation()" disabled>⏸ Pause</button>
            <button class="btn btn-resume" id="btn-resume" onclick="resumeAutomation()" disabled>⏯ Resume</button>
            <button class="btn btn-stop" id="btn-stop" onclick="stopAutomation()" disabled>⏹ Stop</button>
        </div>
    </div>

    <div class="card">
        <div class="card-title">📊 LIVE PROGRESS</div>
        <div class="grid">
            <div class="metric-box" style="border-color:#0284c7;"><div class="metric-title">Total Students</div><div class="metric-val" id="val-total">0</div></div>
            <div class="metric-box" style="border-color:#16a34a;"><div class="metric-title">Completed</div><div class="metric-val" id="val-completed">0</div></div>
            <div class="metric-box" style="border-color:#d97706;"><div class="metric-title">Remaining</div><div class="metric-val" id="val-remaining">0</div></div>
            <div class="metric-box" style="border-color:#38bdf8;"><div class="metric-title">Speed</div><div class="metric-val" id="val-speed">0.0 s/student</div></div>
            <div class="metric-box" style="border-color:#a855f7; grid-column: span 2;"><div class="metric-title">Current Student</div><div class="metric-val" id="val-current-name">-</div></div>
            <div class="metric-box" style="border-color:#ec4899;"><div class="metric-title">App No</div><div class="metric-val" id="val-current-en">-</div></div>
            <div class="metric-box" style="border-color:#14b8a6;"><div class="metric-title">Elapsed / ETA</div><div class="metric-val" id="val-time">00:00:00 / 00:00:00</div></div>
        </div>
        <div class="scan-line" id="scan-line">● ○ ○  Waiting…</div>
        <div class="progress-bg">
            <div class="progress-fill" id="pbar-fill"></div>
            <div class="progress-text" id="pbar-text">0%</div>
        </div>
    </div>

    <div class="card">
        <div class="card-title">📝 LIVE TERMINAL</div>
        <div class="log-box" id="log-box"></div>
    </div>
</div>

<script>
const ROUNDS = ROUNDS_JSON;

function renderRounds() {
    const box = document.getElementById('round-tiles');
    box.innerHTML = '';
    Object.keys(ROUNDS).forEach(k => {
        const r = ROUNDS[k];
        const tile = document.createElement('div');
        tile.className = 'round-tile';
        tile.dataset.round = k;
        const cls = r.status === 'Result released' ? 'live' : 'wait';
        tile.innerHTML = `
            <div class="tile-glow"></div>
            <div class="rno" style="color:${r.accent}">ROUND ${k}</div>
            <div class="rname">${r.name}</div>
            <span class="rstatus ${cls}">${r.status}</span>`;
        tile.onclick = () => selectRound(k);
        box.appendChild(tile);
    });
}

function selectRound(round) {
    fetch('/api/set_round', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ round_no: parseInt(round) })
    }).then(r => r.json()).then(res => {
        document.querySelectorAll('.round-tile').forEach(t =>
            t.classList.toggle('active', t.dataset.round === String(round)));
        document.getElementById('target_url').value = res.url;
        const note = document.getElementById('round-note');
        note.innerText = res.status === 'Result released' ? '✔ ' + res.note : '⚠ ' + res.note;
        note.className = 'round-note' + (res.status === 'Result released' ? ' live-note' : '');
        document.getElementById('input_file').value = res.input_file;
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('import-banner').innerText = "Importing " + file.name + "...";
        fetch('/api/upload', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ filename: file.name, file_b64: e.target.result.split(',')[1] })
        })
        .then(r => r.json())
        .then(res => {
            document.getElementById('import-banner').innerText = res.status === 'ok'
                ? "✅ " + res.message : "❌ Import Failed: " + res.message;
            if (res.status === 'ok') {
                document.getElementById('input_file').value = res.input_file;
                document.getElementById('val-total').innerText = res.total;
                alert(res.message + " Click 'START CHECKING' to begin.");
            }
        })
        .catch(err => alert("Upload error: " + err));
    };
    reader.readAsDataURL(file);
}

function updateUI(data) {
    document.getElementById('val-total').innerText = data.total;
    document.getElementById('val-completed').innerText = data.completed;
    document.getElementById('val-remaining').innerText = data.remaining;
    document.getElementById('val-speed').innerText = data.speed;
    document.getElementById('val-current-name').innerText = data.current_name;
    document.getElementById('val-current-en').innerText = data.current_en;
    document.getElementById('val-time').innerText = data.elapsed + ' / ' + data.eta;

    const pct = Math.round(data.percent || 0);
    document.getElementById('pbar-fill').style.width = pct + '%';
    document.getElementById('pbar-text').innerText = pct + '% Completed';

    const dot = document.getElementById('live-dot');
    const text = document.getElementById('live-text');
    if (data.is_running) {
        text.innerText = data.is_paused ? 'PAUSED' : 'RUNNING';
        dot.className = 'live-dot ' + (data.is_paused ? 'paused' : 'running');
    } else {
        text.innerText = 'IDLE';
        dot.className = 'live-dot';
    }
    document.getElementById('btn-start').disabled = data.is_running;
    document.getElementById('btn-pause').disabled = !(data.is_running && !data.is_paused);
    document.getElementById('btn-resume').disabled = !(data.is_running && data.is_paused);
    document.getElementById('btn-stop').disabled = !data.is_running;

    const scan = document.getElementById('scan-line');
    if (data.is_running && !data.is_paused) {
        const dots = ['● ○ ○', '○ ● ○', '○ ○ ●'];
        scan.innerText = dots[Math.floor(Date.now() / 280) % 3] + '  Scanning: ' + data.current_name + ' (' + data.current_en + ')';
    } else if (data.is_paused) {
        scan.innerText = '◼ ◼ ◼  Paused…';
    } else {
        scan.innerText = '● ○ ○  Waiting…';
    }
}

function pollStatus() {
    fetch('/api/status').then(r => r.json()).then(updateUI).catch(() => {});
    fetch('/api/logs').then(r => r.json()).then(logs => {
        const box = document.getElementById('log-box');
        box.innerHTML = logs.map(l => {
            let cls = '';
            const up = l.toUpperCase();
            if (up.includes('ERROR') || up.includes('FATAL')) cls = 'log-error';
            else if (up.includes('WARN') || up.includes('RETRY')) cls = 'log-warn';
            else if (up.includes('SUCCESS') || up.includes('ALLOTTED') || up.includes('COMPLETED')) cls = 'log-good';
            return '<div class="log-line ' + cls + '">' + escapeHtml(l) + '</div>';
        }).join('');
        box.scrollTop = box.scrollHeight;
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function startAutomation() {
    fetch('/api/start', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            target_url: document.getElementById('target_url').value,
            headless: document.getElementById('headless').value === 'true',
            retry_count: parseInt(document.getElementById('retry_count').value)
        })
    }).then(r => r.json()).then(res => alert(res.message));
}

function pauseAutomation() { fetch('/api/pause', {method: 'POST'}); }
function resumeAutomation() { fetch('/api/resume', {method: 'POST'}); }
function stopAutomation() { fetch('/api/stop', {method: 'POST'}); }

renderRounds();
setInterval(pollStatus, 900);
pollStatus();
</script>
</body>
</html>
"""


def _template(round_no: int = None):
    round_no = round_no or config.DEFAULT_ROUND_NO
    html = HTML_TEMPLATE
    html = html.replace("CONFIG_INPUT_FILE", STATE["input_file"])
    html = html.replace("ROUNDS_JSON", json.dumps(config.ROUNDS))
    return html


class WebRequestHandler(BaseHTTPRequestHandler):
    """Custom HTTP Request Handler for Web Dashboard API."""

    def log_message(self, format, *args):
        pass

    def _send_json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path in ("/", "/index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(_template(STATE["round_no"]).encode("utf-8"))

        elif parsed.path == "/api/status":
            self._send_json(STATE)

        elif parsed.path == "/api/logs":
            with LOG_LOCK:
                self._send_json(LOG_HISTORY[-100:])

        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"

        try:
            req_data = json.loads(body.decode("utf-8")) if body else {}
        except Exception:
            req_data = {}

        if parsed.path == "/api/set_round":
            try:
                rno = int(req_data.get("round_no", config.DEFAULT_ROUND_NO))
                if rno not in config.ROUNDS:
                    raise ValueError("Invalid round")
                STATE["round_no"] = rno
                rinfo = config.ROUNDS[rno]
                STATE.update({
                    "round_name": rinfo["name"],
                    "round_status": rinfo["status"],
                    "round_note": rinfo["note"],
                    "target_url": rinfo["url"],
                    "output_file": str(config.output_file_for_round(rno)),
                })
                app_logger.info("Round changed to {} ({})", rinfo["name"], rinfo["url"])
                self._send_json({
                    "status": "ok",
                    "url": rinfo["url"],
                    "note": rinfo["note"],
                    "status_text": rinfo["status"],
                    "input_file": STATE["input_file"],
                })
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)})

        elif parsed.path == "/api/upload":
            try:
                filename = req_data.get("filename", "Imported_Students.xlsx")
                file_b64 = req_data.get("file_b64", "")

                if not file_b64:
                    self._send_json({"status": "error", "message": "No file content received."})
                    return

                target_path = config.DEFAULT_INPUT_DIR / filename
                target_path.parent.mkdir(parents=True, exist_ok=True)

                with open(target_path, "wb") as f:
                    f.write(base64.b64decode(file_b64))

                test_handler = ExcelHandler(target_path, round_no=STATE["round_no"])
                df = test_handler.load_input_data()

                STATE["input_file"] = str(target_path)
                STATE["total"] = len(df)
                STATE["completed"] = len(df[df[config.COL_LOGIN_STATUS] != ""])
                STATE["remaining"] = len(df) - STATE["completed"]
                STATE["import_status"] = f"Successfully imported {len(df)} students from {filename}"

                app_logger.info("Successfully imported {} students from {}", len(df), target_path)
                self._send_json({
                    "status": "ok",
                    "message": f"Successfully imported {len(df)} students from {filename}",
                    "input_file": str(target_path),
                    "total": len(df),
                })
            except Exception as e:
                app_logger.error("Error importing Excel file: {}", e)
                self._send_json({"status": "error", "message": str(e)})

        elif parsed.path == "/api/start":
            if STATE["is_running"]:
                self._send_json({"status": "error", "message": "Automation is already running."})
                return

            if "target_url" in req_data and req_data["target_url"]:
                STATE["target_url"] = req_data["target_url"].strip()
            if "headless" in req_data:
                STATE["headless"] = bool(req_data["headless"])
            if "retry_count" in req_data:
                STATE["retry_count"] = int(req_data["retry_count"])

            STATE["output_file"] = str(config.output_file_for_round(STATE["round_no"]))

            if not STATE["target_url"].startswith("http"):
                self._send_json({"status": "error", "message": "Please paste a valid check link first."})
                return

            start_background_batch()
            self._send_json({"status": "ok", "message": "Live Chrome browser launched! Processing students..."})

        elif parsed.path == "/api/pause":
            if AUTOMATION_ENGINE and STATE["is_running"]:
                AUTOMATION_ENGINE.request_pause()
                STATE["is_paused"] = True
            self._send_json({"status": "ok"})

        elif parsed.path == "/api/resume":
            if AUTOMATION_ENGINE and STATE["is_running"]:
                AUTOMATION_ENGINE.resume_execution()
                STATE["is_paused"] = False
            self._send_json({"status": "ok"})

        elif parsed.path == "/api/stop":
            if AUTOMATION_ENGINE and STATE["is_running"]:
                AUTOMATION_ENGINE.request_stop()
            self._send_json({"status": "ok"})

        else:
            self.send_error(404)


def run_worker():
    """Background worker thread for web app batch execution."""
    global AUTOMATION_ENGINE, EXCEL_HANDLER

    start_time = time.time()
    STATE["is_running"] = True
    STATE["is_paused"] = False

    try:
        input_path = Path(STATE["input_file"])
        output_file = Path(STATE["output_file"])

        EXCEL_HANDLER = ExcelHandler(input_path, output_file, round_no=STATE["round_no"])
        df = EXCEL_HANDLER.load_input_data()

        total = len(df)
        STATE["total"] = total

        if total == 0:
            app_logger.error("Input file has 0 data rows.")
            return

        AUTOMATION_ENGINE = AllotmentAutomation(
            headless=STATE["headless"],
            retry_count=STATE["retry_count"],
            request_delay=STATE["delay"],
            target_url=STATE["target_url"],
            round_no=STATE["round_no"],
        )
        app_logger.info("{:=^80}", f" STARTING {STATE['round_name'].upper()} ALLOTMENT CHECK ")
        app_logger.info("Target URL: {}", STATE["target_url"])
        app_logger.info("Students to check: {}", total)
        AUTOMATION_ENGINE.start_browser()

        for idx, row in df.iterrows():
            if not STATE["is_running"]:
                break

            app_no = str(row[config.COL_APP_NO]).strip()
            name = str(row[config.COL_NAME]).strip()
            dob = str(row[config.COL_DOB]).strip()
            existing_login = str(row[config.COL_LOGIN_STATUS]).strip()

            completed = len(df[df[config.COL_LOGIN_STATUS] != ""])
            remaining = total - completed
            elapsed_sec = time.time() - start_time

            if completed > 0:
                avg_sec = elapsed_sec / completed
                eta_sec = avg_sec * remaining
                speed_str = f"{avg_sec:.1f} s/student"
            else:
                eta_sec = 0
                speed_str = "0.0 s/student"

            STATE.update({
                "completed": completed,
                "remaining": remaining,
                "current_en": app_no,
                "current_name": name,
                "elapsed": format_seconds(elapsed_sec),
                "eta": format_seconds(eta_sec),
                "speed": speed_str,
                "percent": (completed / total) * 100 if total > 0 else 0,
            })

            if existing_login:
                app_logger.info("Row {} ({}) already processed. Skipping...", idx + 1, app_no)
                continue

            if not app_no or app_no == "NAN" or not app_no.startswith("EN"):
                app_logger.warning("Row {} ({}) missing valid Application Number ('{}'). Marking FAILED.", idx + 1, name, app_no)
                EXCEL_HANDLER.update_student_result(idx, config.STATUS_FAILED, config.ALLOTMENT_INVALID, "-", "-", "-")
                EXCEL_HANDLER.save_report()
                continue

            cached = EXCEL_HANDLER.get_cached_result(app_no)
            if cached:
                app_logger.info("Duplicate App No {} — reusing cached result.", app_no)
                EXCEL_HANDLER.update_student_result(
                    idx,
                    cached[config.COL_LOGIN_STATUS],
                    cached[config.COL_ALLOTMENT_STATUS],
                    cached[config.COL_COLLEGE_NAME],
                    cached[config.COL_BRANCH],
                    cached.get(config.COL_PREF_NO, "-"),
                )
            else:
                app_logger.info("Checking [{}/{}] {} (App: {})", idx + 1, total, name, app_no)
                res = AUTOMATION_ENGINE.process_student(app_no, dob)
                EXCEL_HANDLER.update_student_result(
                    idx,
                    res[config.COL_LOGIN_STATUS],
                    res[config.COL_ALLOTMENT_STATUS],
                    res[config.COL_COLLEGE_NAME],
                    res[config.COL_BRANCH],
                    res.get(config.COL_PREF_NO, "-"),
                )

            EXCEL_HANDLER.save_report()

        completed = len(df[df[config.COL_LOGIN_STATUS] != ""])
        STATE.update({
            "completed": completed,
            "remaining": total - completed,
            "current_en": "FINISHED",
            "current_name": "Completed Successfully",
            "percent": 100.0,
        })
        app_logger.info("Batch automation finished successfully! Report: {}", EXCEL_HANDLER.output_path)

    except InterruptedException:
        app_logger.warning("Automation stopped by user.")
    except Exception as e:
        app_logger.error("Error during automation: {}", e)
    finally:
        if AUTOMATION_ENGINE:
            AUTOMATION_ENGINE.close_browser()
        STATE["is_running"] = False
        STATE["is_paused"] = False


def start_background_batch():
    """Launches the automation worker thread."""
    global WORKER_THREAD
    WORKER_THREAD = threading.Thread(target=run_worker, daemon=True)
    WORKER_THREAD.start()


def format_seconds(seconds: float) -> str:
    m, s = divmod(int(max(0, seconds)), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def main():
    host = "127.0.0.1"
    port = int(os.environ.get('PORT', 5000))

    if "--host" in sys.argv:
        idx = sys.argv.index("--host")
        if len(sys.argv) > idx + 1:
            host = sys.argv[idx + 1]
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if len(sys.argv) > idx + 1:
            port = int(sys.argv[idx + 1])

    setup_logger()
    register_gui_callback(web_log_callback)

    server_address = (host, port)
    httpd = HTTPServer(server_address, WebRequestHandler)

    app_logger.info("=" * 70)
    app_logger.info("MHT-CET ALL-ROUNDS ALLOTMENT AUTOMATION WEB DASHBOARD SERVER")
    app_logger.info("Dashboard URL: http://{}:{}", host, port)
    app_logger.info("=" * 70)

    if host in ("127.0.0.1", "localhost"):
        webbrowser.open(f"http://localhost:{port}")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        app_logger.info("Shutting down web server...")
        httpd.server_close()


if __name__ == "__main__":
    main()