/* MHT-CET FE 2026 - Allotment Live Alert : frontend logic */

const $ = (s) => document.querySelector(s);
const cardsEl = $("#cards");
const logBox = $("#logBox");
const banner = $("#liveBanner");
const liveText = $("#liveText");
const liveOpen = $("#liveOpenLink");

let state = null;
let prevLive = {};
let enabledRounds = new Set();
let audioCtx = null;
let alarmTimer = null;
let titleTimer = null;
let muted = false;
let spinning = null;

/* ---------------- alarm sound ---------------- */
function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function beep() {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime;
  [[880, 0], [660, 0.42]].forEach(([f, off]) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + off);
    g.gain.exponentialRampToValueAtTime(0.4, t + off + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.4);
    o.connect(g).connect(audioCtx.destination);
    o.start(t + off);
    o.stop(t + off + 0.45);
  });
}

function startAlarm() {
  initAudio();
  if (alarmTimer) return;
  beep();
  alarmTimer = setInterval(beep, 950);
  let flip = true;
  titleTimer = setInterval(() => {
    document.title = flip ? "*** LINK IS LIVE ***" : "MHT-CET Allotment Alert";
    flip = !flip;
  }, 700);
}

function stopAlarm() {
  clearInterval(alarmTimer); alarmTimer = null;
  clearInterval(titleTimer); titleTimer = null;
  document.title = "MHT-CET Allotment Live Alert";
}

/* ---------------- notifications ---------------- */
function notify(title, body, url) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, requireInteraction: true });
    n.onclick = () => { if (url) window.open(url, "_blank"); window.focus(); };
  } catch (e) { /* ignore */ }
}

$("#notifBtn").addEventListener("click", () => {
  if (!("Notification" in window)) return alert("Notifications not supported in this browser.");
  Notification.requestPermission().then((p) => {
    $("#notifBtn").textContent = p === "granted" ? "Notifications ON" : "Enable Notifications";
    if (p === "granted") notify("Alerts enabled", "You will be notified the moment a link goes live.");
  });
});

/* ---------------- helpers ---------------- */
async function api(path, opts) {
  const r = await fetch(path, opts);
  return r.json();
}
async function post(path, obj) {
  return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });
}
function fmtTime(ts) {
  if (!ts) return "--:--:--";
  return new Date(ts * 1000).toLocaleTimeString([], { hour12: false });
}

/* ---------------- render ---------------- */
function statusPill(r) {
  if (r.checking && !r.live) return `<span class="status checking"><span class="sdot"></span>CHECKING...</span>`;
  if (r.live === null || r.last_checked === null)
    return `<span class="status waiting"><span class="sdot"></span>WAITING FOR FIRST CHECK</span>`;
  if (r.live) return `<span class="status live"><span class="sdot"></span>LINK IS LIVE</span>`;
  return `<span class="status down"><span class="sdot"></span>NOT LIVE YET</span>`;
}

function renderCards(rounds, enabled) {
  // Compute which rounds are enabled
  const enabledRounds = new Set(Object.keys(enabled).map(k => Number(k)).filter(k => enabled[k]));

  cardsEl.innerHTML = rounds.map((r) => {
    const isEnabled = enabledRounds.has(r.round);
    const on = isEnabled;
    const statusText = isEnabled ? statusPill(r) : `<span class="status waiting"><span class="sdot"></span>NOT SELECTED</span>`;
    const cls = ["card", on ? "" : "disabled", r.live && on ? "islive" : ""].join(" ").trim();
    return `
      <div class="${cls}" id="card-${r.round}">
        <div class="card-top">
          <span class="badge">ROUND ${r.round}</span>
          <label class="switch" title="Monitor this round">
            <input type="checkbox" data-round="${r.round}" ${on ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
        <div class="card-name">${r.name}</div>
        <div class="card-url">${r.url.replace("https://", "")}</div>
        ${statusText}
        <div class="meta">
          Last check: <b>${fmtTime(isEnabled ? r.last_checked : null)}</b><br>
          HTTP: <b>${isEnabled ? (r.code ?? "-") : "-"}</b> &middot; ${isEnabled ? (r.note || "-") : "-"}
        </div>
        <div class="card-actions">
          <a class="icon-btn primary" href="${r.url}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open
          </a>
          <button class="icon-btn recheck" data-round="${r.round}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
            Recheck
          </button>
        </div>
      </div>`;
  }).join("");
}

function renderLog(log) {
  if (!log.length) {
    logBox.innerHTML = `<div class="empty-log">No activity yet. Checks are running in the background...</div>`;
    return;
  }
  logBox.innerHTML = log.map((e) => `
    <div class="log-row">
      <span class="log-time">${fmtTime(e.ts)}</span>
      <span class="log-dot ${e.kind}"></span>
      <span class="log-text">${e.text}</span>
    </div>`).join("");
}

function handleTransitions(rounds) {
  let anyLiveNow = [];
  rounds.forEach((r) => {
    const isEnabled = r.live !== null && enabledRounds.includes(r.round);
    const before = prevLive[r.round];
    if (before === false && r.live === true && isEnabled) {
      notify(`ALERT: ${r.name} is LIVE!`, "The allotment status page is now open.", r.url);
    }
    prevLive[r.round] = r.live;
    if (r.live && isEnabled) anyLiveNow.push(r);
  });

  if (anyLiveNow.length) {
    liveText.textContent = anyLiveNow.map((r) => `${r.name.toUpperCase()} IS LIVE!`).join("  ");
    liveOpen.href = anyLiveNow[0].url;
    banner.classList.remove("hidden");
    startAlarm();
  } else {
    banner.classList.add("hidden");
    stopAlarm();
  }
}

/* ---------------- main poll loop ---------------- */
async function tick() {
  try {
    state = await api("/api/status");
  } catch (e) {
    $("#monitorState").textContent = "Server offline";
    $("#monitorSub").textContent = "is server.py running?";
    return;
  }

  // Track which rounds are enabled
  enabledRounds = new Set(Object.keys(state.enabled).map(k => Number(k)).filter(k => state.enabled[k]));

  renderCards(state.rounds, state.enabled);
  renderLog(state.log);
  handleTransitions(state.rounds);

  const sel = Object.values(state.enabled).filter(Boolean).length;
  $("#selCount").textContent = `${sel} round${sel === 1 ? "" : "s"} selected`;

  $("#countdown").textContent = state.monitoring && sel > 0
    ? (state.seconds_until_next_check > 0 ? `in ${state.seconds_until_next_check}s` : "checking now...")
    : "paused";

  const dot = $("#monitorDot");
  dot.className = "dot " + (state.monitoring ? "on" : "off");
  $("#monitorState").textContent = state.monitoring ? "Monitoring active" : "Monitoring paused";
  $("#monitorSub").textContent = state.monitoring ? "continuous background checks" : "press Resume to continue";

  const mBtn = $("#masterBtn");
  mBtn.innerHTML = state.monitoring
    ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg> Pause`
    : `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg> Resume`;
  mBtn.classList.toggle("danger-outline", state.monitoring);
  mBtn.classList.toggle("ghost", !state.monitoring);

  if ($("#intervalSel").value != state.interval) $("#intervalSel").value = state.interval;
}

setInterval(tick, 900);
tick();

/* ---------------- events ---------------- */
cardsEl.addEventListener("change", async (ev) => {
  const input = ev.target.closest('input[type="checkbox"][data-round]');
  if (!input) return;
  await post("/api/toggle", { round: Number(input.dataset.round), enabled: input.checked });
  tick();
});

cardsEl.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".recheck");
  if (!btn) return;
  btn.disabled = true;
  post("/api/check-now", {}).then(() => setTimeout(() => (btn.disabled = false), 2500));
});

$("#checkNowBtn").addEventListener("click", function () {
  this.classList.add("spin");
  post("/api/check-now", {}).then(() => setTimeout(() => this.classList.remove("spin"), 1500));
});

$("#intervalSel").addEventListener("change", (e) => post("/api/interval", { interval: Number(e.target.value) }));

$("#masterBtn").addEventListener("click", () => post("/api/master", { monitoring: !(state && state.monitoring) }));

$("#soundBtn").addEventListener("click", () => {
  muted = false;
  initAudio();
  beep();
  setTimeout(beep, 1000);
});

$("#stopAlarmBtn").addEventListener("click", stopAlarm);

document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
