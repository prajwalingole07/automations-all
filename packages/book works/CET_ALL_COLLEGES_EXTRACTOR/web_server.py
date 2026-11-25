"""
CET ALL COLLEGES - LOCALHOST WEB SERVER with LIVE PROGRESS
==========================================================
Shows live progress ONE BY ONE of every College -> Branch -> Category
while extracting from the PDFs. Generates the master Excel in the browser.

Run:  python web_server.py
Then open:  http://127.0.0.1:5000
"""

import os
import sys
import time
import json
import queue
import threading
import webbrowser

import cet_core

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# ------------------------------ Flask ------------------------------
from flask import Flask, Response, request, jsonify, send_from_directory

app = Flask(__name__)

STATE = {
    'running': False,
    'finished': False,
    'phase': 'idle',
    'round': 0,
    'page': 0,
    'total_pages': 0,
    'institutes': 0,
    'branches': 0,
    'items': 0,
    'rows': 0,
    'file': '',
    'last_item': '',
    'error': '',
    'events': [],
    'started_at': 0,
}

event_queue = queue.Queue()
MAX_EVENTS = 3000

PDF_FOLDER = "PDFs"
OUTPUT_DIR = "CET DATA"


def emit(event):
    STATE['events'].append(event)
    if len(STATE['events']) > MAX_EVENTS:
        STATE['events'] = STATE['events'][-MAX_EVENTS:]
    event_queue.put(event)


def progress_callback(event):
    etype = event.get('type')
    STATE['last_event'] = event
    if etype == 'phase':
        STATE['phase'] = event.get('phase', STATE['phase'])
        if event.get('phase') == 'discover':
            STATE['total_pages'] = event.get('total_pages', STATE['total_pages'])
        if event.get('phase') == 'extract':
            STATE['round'] = event.get('round', 0)
            STATE['total_pages'] = event.get('total_pages', STATE['total_pages'])
        emit(event)
    elif etype == 'progress':
        STATE['page'] = event['page']
        STATE['total_pages'] = event['total']
        emit(event)
    elif etype == 'discovered':
        STATE['institutes'] = event['institutes']
        STATE['branches'] = event['branches']
        emit(event)
    elif etype == 'item':
        STATE['items'] += 1
        emit(event)
    elif etype == 'branch_found':
        emit(event)
    elif etype == 'done':
        STATE['finished'] = True
        STATE['phase'] = 'done'
        STATE['file'] = event['file']
        STATE['rows'] = event['rows']
        STATE['running'] = False
        emit(event)
    elif etype == 'error':
        STATE['error'] = event['msg']
        STATE['running'] = False
        STATE['phase'] = 'error'
        emit(event)


def worker():
    try:
        STATE['running'] = True
        STATE['finished'] = False
        STATE['phase'] = 'starting'
        STATE['items'] = 0
        STATE['rows'] = 0
        STATE['file'] = ''
        STATE['error'] = ''
        STATE['events'] = []          # fresh log for every run
        STATE['started_at'] = time.time()
        emit({'type': 'banner', 'msg': 'CET CUTOFF DATA EXTRACTOR - ALL COLLEGES'})
        path = cet_core.run_workflow(pdf_folder=PDF_FOLDER, output_dir=OUTPUT_DIR,
                                     on_event=progress_callback)
    except Exception as e:
        progress_callback({'type': 'error', 'msg': str(e)})


@app.route('/')
def index():
    return HTML


@app.route('/api/state')
def api_state():
    return jsonify({
        'running': STATE['running'],
        'finished': STATE['finished'],
        'phase': STATE['phase'],
        'round': STATE['round'],
        'page': STATE['page'],
        'total_pages': STATE['total_pages'],
        'institutes': STATE['institutes'],
        'branches': STATE['branches'],
        'items': STATE['items'],
        'rows': STATE['rows'],
        'file': STATE['file'],
        'error': STATE['error'],
        'events': STATE['events'][-800:],
    })


@app.route('/api/start', methods=['POST'])
def api_start():
    if STATE['running']:
        return jsonify({'ok': False, 'msg': 'Extraction already running.'})
    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return jsonify({'ok': True, 'msg': 'Started.'})


@app.route('/events')
def events():
    def gen():
        # replay recent state so a freshly connected client sees progress
        for ev in STATE['events'][-200:]:
            yield f"data: {json.dumps(ev)}\n\n"
        while True:
            try:
                ev = event_queue.get(timeout=10)
                yield f"data: {json.dumps(ev)}\n\n"
            except queue.Empty:
                yield f": keepalive\n\n"
    return Response(gen(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/download')
def download():
    filename = os.path.basename(STATE['file']) if STATE['file'] else ''
    if not filename or not os.path.exists(STATE['file']):
        return "No file available yet.", 404
    return send_from_directory(os.path.dirname(STATE['file']) or '.', filename, as_attachment=True)


@app.route('/latest')
def latest():
    if STATE['file'] and os.path.exists(STATE['file']):
        return send_from_directory(os.path.dirname(STATE['file']) or '.', os.path.basename(STATE['file']), as_attachment=True)
    return "No file yet.", 404


HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CET ALL COLLEGES - Live Progress</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0d1117; color: #e6edf3; }
  header { background: linear-gradient(90deg,#1f6feb,#8957e5); padding: 16px 24px; color: #fff; }
  header h1 { font-size: 20px; letter-spacing: .5px; }
  header p { font-size: 13px; opacity: .9; }
  .wrap { max-width: 1200px; margin: 20px auto; padding: 0 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 12px; margin: 16px 0; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 14px 16px; }
  .card .label { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 1px; }
  .card .value { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .bar { background: #21262d; height: 22px; border-radius: 12px; overflow: hidden; margin: 8px 0 4px; }
  .bar > div { height: 100%; width: 0%; background: linear-gradient(90deg,#2ea043,#1f6feb); transition: width .3s; }
  .phase { font-size: 15px; color: #58a6ff; font-weight: 600; }
  .log { background: #0d1117; border: 1px solid #30363d; border-radius: 10px; height: 420px; overflow-y: auto;
         padding: 10px; font-family: Consolas, monospace; font-size: 12.5px; line-height: 1.55; }
  .log div { border-bottom: 1px solid #161b22; padding: 1px 4px; }
  .r1 { color: #7ee787; } .r2 { color: #79c0ff; } .r3 { color: #d2a8ff; } .r4 { color: #ffa657; }
  .cat { color: #ffd33d; font-weight: 600; }
  .clg { color: #ff7b72; } .br { color: #56d364; }
  .btn { background: #238636; border: none; color: #fff; font-size: 15px; font-weight: 700;
         padding: 12px 26px; border-radius: 8px; cursor: pointer; }
  .btn:disabled { background: #30363d; cursor: not-allowed; }
  .dl { background: #1f6feb; text-decoration: none; display: inline-block; }
  .box { margin-top: 14px; }
  .ok { color: #7ee787; font-weight: 700; }
  .err { color: #f85149; font-weight: 700; }
  #now { color:#8b949e; font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>CET ALL COLLEGES - CUTOFF EXTRACTOR</h1>
  <p>Live progress - one by one of every College &gt; Branch &gt; Category &nbsp;|&nbsp; PRAJWAL'S CREATION</p>
</header>
<div class="wrap">
  <div class="cards">
    <div class="card"><div class="label">Status</div><div class="value phase" id="phase">Idle</div></div>
    <div class="card"><div class="label">Round</div><div class="value" id="round">-</div></div>
    <div class="card"><div class="label">Page (PDF)</div><div class="value" id="page">0 / 0</div></div>
    <div class="card"><div class="label">Colleges</div><div class="value" id="insts">0</div></div>
    <div class="card"><div class="label">Branches</div><div class="value" id="brs">0</div></div>
    <div class="card"><div class="label">Rows Extracted</div><div class="value" id="items">0</div></div>
  </div>
  <div class="bar"><div id="pbar"></div></div>
  <div id="now"></div>

  <div class="box">
    <button class="btn" id="start" onclick="start()">START EXTRACTION</button>
    <a class="btn dl" id="dl" style="display:none" href="/latest">Download Excel</a>
  </div>

  <div class="box"><div class="phase">Live Log (College / Branch / Category)</div></div>
  <div class="log" id="log"><div>Waiting... click START EXTRACTION.</div></div>
</div>

<script>
let lastState = {};
const $ = id => document.getElementById(id);
const elog = $('log');

function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function addLine(html){
  const d=document.createElement('div'); d.innerHTML=html;
  elog.appendChild(d);
  while(elog.children.length>2000) elog.removeChild(elog.firstChild);
  elog.scrollTop=elog.scrollHeight;
}

function handle(ev){
  const t=ev.type;
  if(t==='phase'){ $('phase').textContent=ev.phase.toUpperCase(); }
  if(t==='round_start'){ $('round').textContent='R'+ev.round; }
  if(t==='progress'){
    $('page').textContent=ev.page+' / '+ev.total;
    const pct=Math.round(100*ev.page/ev.total);
    $('pbar').style.width=pct+'%';
    $('phase').textContent=(ev.phase==='extract'?'R'+lastState.round+' EXTRACT':ev.phase).toUpperCase();
  }
  if(t==='discovered'){
    $('insts').textContent=ev.institutes; $('brs').textContent=ev.branches;
    addLine('<span class="ok">FOUND</span> ' + ev.institutes + ' colleges, ' + ev.branches + ' branches');
  }
  if(t==='item'){
    $('items').textContent=ev.items||(lastState.items||0);
    $('now').textContent='Now: R'+ev.round+' | '+ev.inst+' - '+(ev.inst_name||'')+' | '+ev.branch+' - '+(ev.branch_name||'');
    addLine('<span class="r'+ev.round+'">R'+ev.round+'</span> <span class="clg">'+esc(ev.inst_name||ev.inst)+
            '</span> &gt; <span class="br">'+esc(ev.branch_name||ev.branch)+'</span> &gt; <span class="cat">'+
            esc(ev.category)+'</span> = '+esc(ev.rank)+' ('+esc(ev.perc)+'%)');
  }
  if(t==='done'){
    $('phase').textContent='DONE'; $('rows').textContent=ev.rows;
    addLine('<span class="ok">DONE - ' + esc(ev.file) + ' (' + ev.rows + ' rows)</span>');
    $('dl').style.display='inline-block';
    $('start').disabled=false; $('start').textContent='START EXTRACTION';
  }
  if(t==='error'){
    $('phase').textContent='ERROR'; $('phase').className='value phase err';
    addLine('<span class="err">ERROR: ' + esc(ev.msg) + '</span>');
    $('start').disabled=false; $('start').textContent='START EXTRACTION';
  }
}

async function start(){
  $('start').disabled=true; $('start').textContent='RUNNING...';
  const r=await fetch('/api/start',{method:'POST'}).then(r=>r.json());
  if(!r.ok){ $('start').disabled=false; $('start').textContent=r.msg; }
}

function stream(){
  const es=new EventSource('/events');
  es.onmessage=e=>handle(JSON.parse(e.data));
  es.onerror=()=>{};
}

(async ()=>{
  stream();
  const s=await fetch('/api/state').then(r=>r.json());
  Object.assign(lastState,s);
  $('insts').textContent=s.institutes; $('brs').textContent=s.branches;
  $('items').textContent=s.items; $('page').textContent=s.page+' / '+s.total_pages;
  if(s.phase==='extract') $('round').textContent='R'+s.round;
  $('phase').textContent=s.phase.toUpperCase();
  if(s.finished){ $('phase').textContent='DONE'; $('dl').style.display='inline-block'; }
  if(s.running){ $('start').disabled=true; $('start').textContent='RUNNING...'; }
  elog.innerHTML='';
  (s.events||[]).forEach(handle);
})();
</script>
</body>
</html>
"""


def main():
    port = int(os.environ.get('PORT', 5000))
    url = f"http://127.0.0.1:{port}"
    print("=" * 70)
    print("  CET ALL COLLEGES - WEB SERVER WITH LIVE PROGRESS")
    print(f"  Open this in your browser:  {url}")
    print("  Press CTRL+C to stop the server.")
    print("=" * 70)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    app.run(host='127.0.0.1', port=port, threaded=True, debug=False)


if __name__ == "__main__":
    main()