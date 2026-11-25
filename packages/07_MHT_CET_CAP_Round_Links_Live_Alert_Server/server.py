#!/usr/bin/env python3
"""
MHT-CET FE 2026 - Allotment Link Live Alert
--------------------------------------------
Continuously monitors the official CAP allotment status links and reports
which rounds are LIVE. Pure Python standard library - no installations needed.

Run:  python server.py   (or just double-click start_app.bat)
Then open: http://localhost:8577
"""

import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
STATE_FILE = os.path.join(BASE_DIR, "state.json")
PORT_RANGE = range(8577, 8590)

ROUNDS = [
    {"round": 1, "name": "CAP Round 1", "short": "R1",
     "url": "https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound1"},
    {"round": 2, "name": "CAP Round 2", "short": "R2",
     "url": "https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound2"},
    {"round": 3, "name": "CAP Round 3", "short": "R3",
     "url": "https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound3"},
    {"round": 4, "name": "CAP Round 4", "short": "R4",
     "url": "https://fe2026.mahacet.org/StaticPages/frmCheckAllotmentStatusCAPRound4"},
]

LOCK = threading.RLock()
WAKE = threading.Event()


class Store:
    """Holds config + live status. Config persists across restarts."""

    def __init__(self):
        self.interval = 20            # seconds between check cycles
        self.monitoring = True
        self.enabled = {r["round"]: True for r in ROUNDS}
        self.status = {r["round"]: {"live": None, "code": None, "note": "",
                                    "last_checked": None, "checking": False}
                       for r in ROUNDS}
        self.next_check_ts = 0
        self.log = []
        self.started_at = time.time()
        self._load()

    def _load(self):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.interval = int(data.get("interval", 20))
            saved = data.get("enabled", {})
            for r in ROUNDS:
                self.enabled[r["round"]] = bool(saved.get(str(r["round"]), True))
        except Exception:
            pass

    def save(self):
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump({"interval": self.interval,
                           "enabled": {str(k): v for k, v in self.enabled.items()}}, f)
        except Exception:
            pass

    def add_log(self, text, kind="info"):
        entry = {"ts": time.time(), "text": text, "kind": kind}
        with LOCK:
            self.log.insert(0, entry)
            del self.log[80:]
        print("[LOG]", text)


STORE = Store()
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
}


def check_url(url):
    """Returns (live: bool, code: int|str, note: str).

    A round counts as LIVE only when the page shows the actual allotment
    form (Application ID / Date of Birth). The site also returns HTTP 200
    with a '... is Not Published.' message before the result is out, so a
    200 status alone is NOT enough.
    """
    t0 = time.time()
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=12, context=SSL_CTX) as resp:
            raw = resp.read(60000)
            ms = int((time.time() - t0) * 1000)
            code = resp.code
            low = raw.decode("utf-8", "ignore").lower()

            if "not published" in low:
                return False, code, "site says: NOT PUBLISHED yet (%dms)" % ms

            has_form = ("application id" in low and "date of birth" in low) \
                or "enter your application" in low
            if 200 <= code < 300 and has_form:
                return True, code, "ALLOTMENT FORM detected (%dms, %dB)" % (ms, len(raw))

            # 2xx but neither published-form nor not-published message:
            # treat as not live to avoid false alarms.
            return False, code, "page up but no allotment form (%dms)" % ms
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        return False, e.code, "%dms" % ms
    except Exception as e:
        return False, type(e).__name__, str(e)[:70]


def checker_loop():
    print("[MONITOR] Background checker started.")
    while True:
        with LOCK:
            monitoring = STORE.monitoring
            interval = STORE.interval
            targets = [r for r in ROUNDS if STORE.enabled[r["round"]]]
            STORE.next_check_ts = time.time() + interval
        if monitoring and targets:
            results = {}

            def worker(r):
                live, code, note = check_url(r["url"])
                results[r["round"]] = (live, code, note)

            threads = []
            with LOCK:
                for r in targets:
                    STORE.status[r["round"]]["checking"] = True
            for r in targets:
                t = threading.Thread(target=worker, args=(r,), daemon=True)
                t.start()
                threads.append(t)
            for t in threads:
                t.join(timeout=25)

            now = time.time()
            with LOCK:
                for r in targets:
                    res = results.get(r["round"])
                    if not res:
                        continue
                    live, code, note = res
                    st = STORE.status[r["round"]]
                    prev = st["live"]
                    st.update({"live": bool(live), "code": code, "note": note,
                               "last_checked": now, "checking": False})
                    label = "%s (%s)" % (r["name"], r["url"])
                    if prev is not True and live:
                        STORE.add_log("LIVE NOW -> %s [HTTP %s]" % (label, code), "live")
                        STORE.save()
                    elif prev is None:
                        STORE.add_log("First check %s: HTTP %s - %s"
                                      % (r["name"], code, note or ("LIVE" if live else "NOT live")),
                                      "live" if live else "info")
                    elif prev is True and not live:
                        STORE.add_log("%s no longer live [HTTP %s] %s" % (r["name"], code, note), "info")
            WAKE.wait(timeout=max(3, interval))
            WAKE.clear()
        else:
            with LOCK:
                STORE.next_check_ts = 0
            WAKE.wait(timeout=1.5)
            WAKE.clear()


def build_status():
    with LOCK:
        now = time.time()
        remaining = max(0, int(STORE.next_check_ts - now)) if STORE.next_check_ts else 0
        return {
            "monitoring": STORE.monitoring,
            "interval": STORE.interval,
            "seconds_until_next_check": remaining,
            "enabled": {str(k): v for k, v in STORE.enabled.items()},
            "log": STORE.log[:50],
            "rounds": [
                {
                    **r,
                    **STORE.status[r["round"]],
                } for r in ROUNDS
            ],
        }


MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
        ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json"}


class Handler(BaseHTTPRequestHandler):
    server_version = "MCETAlert/1.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, data, ctype="application/json", code=200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, obj, code=200):
        self._send(json.dumps(obj).encode("utf-8"), "application/json", code)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            return self._static("index.html")
        if path == "/api/status":
            return self._json(build_status())
        if path == "/api/ping":
            return self._json({"ok": True})
        return self._static(path.lstrip("/"))

    def _static(self, name):
        safe = os.path.normpath(name).replace("..", "")
        full = os.path.join(STATIC_DIR, safe)
        if os.path.isfile(full):
            ext = os.path.splitext(full)[1].lower()
            with open(full, "rb") as f:
                self._send(f.read(), MIME.get(ext, "application/octet-stream"))
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json({"ok": False, "error": "bad body"}, 400)

        path = self.path.split("?")[0]
        if path == "/api/toggle":
            rnd = int(body.get("round", 0))
            val = bool(body.get("enabled", True))
            if rnd in STORE.enabled:
                STORE.enabled[rnd] = val
                STORE.add_log("%s monitoring turned %s"
                              % ([r["name"] for r in ROUNDS if r["round"] == rnd][0],
                                 "ON" if val else "OFF"), "info")
                STORE.save()
                return self._json({"ok": True})
            return self._json({"ok": False}, 404)

        if path == "/api/master":
            STORE.monitoring = bool(body.get("monitoring", True))
            STORE.add_log("Monitoring paused" if not STORE.monitoring else "Monitoring resumed",
                          "info")
            WAKE.set()
            return self._json({"ok": True})

        if path == "/api/interval":
            try:
                iv = max(5, min(600, int(body.get("interval", 20))))
                STORE.interval = iv
                STORE.next_check_ts = time.time() + iv
                STORE.save()
                WAKE.set()
                return self._json({"ok": True, "interval": iv})
            except ValueError:
                return self._json({"ok": False}, 400)

        if path == "/api/check-now":
            STORE.next_check_ts = time.time()
            WAKE.set()
            return self._json({"ok": True})

        return self._json({"ok": False}, 404)


def find_server():
    env_port = os.environ.get('PORT')
    if env_port:
        try:
            p = int(env_port)
            srv = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            srv.daemon_threads = True
            return srv, p
        except Exception:
            pass
    last_err = None
    for port in PORT_RANGE:
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            srv.daemon_threads = True
            return srv, port
        except OSError as e:
            last_err = e
    raise SystemExit("Could not bind a port: %s" % last_err)


def main():
    srv, port = find_server()
    url = "http://localhost:%d" % port
    banner = r"""

  ============================================================
     MHT-CET FE 2026  |  ALLOTMENT LINK LIVE ALERT
  ============================================================
     Local app : %s
     Checking  : CAP Rounds 1-4 on fe2026.mahacet.org
     Mode      : Continuous background checking

     Browser should open automatically.
     Keep this window OPEN while the alert runs.
     Press Ctrl+C to stop.
  ============================================================
""" % url
    print(banner)
    if os.environ.get("MCET_NO_BROWSER") != "1":
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    t = threading.Thread(target=checker_loop, daemon=True)
    t.start()
    main()
