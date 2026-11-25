#!/usr/bin/env node
/**
 * NEXUS Automation Hub — Local Windows Runner (v2.0.0)
 *
 * Execution is ALWAYS local. The cloud dashboard only stores jobs and relays
 * them to the runner that belongs to the PC where the job was started.
 *
 * Isolation guarantees:
 *  - Every installation has its own machineId + random control token.
 *  - The cloud pins each job to one machineId; no other runner can claim it.
 *  - Ports, processes and Chrome tabs are allocated locally per job.
 */
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');

const RUNNER_VERSION = '2.0.0';
const AGENT_HOST = '127.0.0.1';
const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 3998;
const LOG_FLUSH_MS = 700;
const BROWSER_READY_TIMEOUT_MS = 45_000;

const runnerDir = __dirname;
const hubRoot = path.resolve(runnerDir, '..');
const packagesRoot = path.join(hubRoot, 'packages');
const statePath = path.join(runnerDir, 'state.json');
const runtimePath = path.join(runnerDir, 'runtime.json');

// ---------------------------------------------------------------------------
// Configuration + persisted identity
// ---------------------------------------------------------------------------

function readJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`[CONFIG] Could not read ${path.basename(file)}: ${err.message}`);
  }
  return {};
}

function writeJson(file, value) {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[CONFIG] Could not write ${path.basename(file)}: ${err.message}`);
  }
}

function normalizeUrl(value) {
  let url = String(value || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

const diskConfig = { ...readJson(path.join(runnerDir, 'config.json')), ...readJson(runtimePath) };
const state = readJson(statePath);

const cloudUrlTxtPath = path.join(hubRoot, 'cloud_url.txt');
let legacyCloudUrl = '';
try {
  if (fs.existsSync(cloudUrlTxtPath)) {
    legacyCloudUrl = fs.readFileSync(cloudUrlTxtPath, 'utf8').trim();
  }
} catch {}

const config = {
  cloudUrl:
    normalizeUrl(envValue('CLOUD_URL', 'HUB_URL')) ||
    normalizeUrl(diskConfig.cloudUrl) ||
    normalizeUrl(legacyCloudUrl) ||
    'http://localhost:3080',
  runnerSecret:
    envValue('RUNNER_SECRET_TOKEN', 'RUNNER_SECRET') ||
    String(diskConfig.runnerSecret || '') ||
    'local-dev-runner',
  agentPort: Number(envValue('RUNNER_AGENT_PORT') || diskConfig.agentPort || 3199),
  pollIntervalMs: Number(diskConfig.pollIntervalMs || 2000),
  heartbeatIntervalMs: Number(diskConfig.heartbeatIntervalMs || 8000),
  maxConcurrentJobs: Math.max(1, Math.min(8, Number(diskConfig.maxConcurrentJobs || 4))),
};

function slug(value) {
  return String(value || 'pc')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'pc';
}

function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const hostname = os.hostname();
if (!state.machineId) {
  state.machineId = `mach_${slug(hostname)}_${randomCode(6).toLowerCase()}`;
}
if (!state.pairingCode) state.pairingCode = randomCode(8);
state.machineName =
  envValue('MACHINE_NAME') || state.machineName || diskConfig.machineName || hostname;
state.machineToken = state.machineToken || '';

const machineName = state.machineName;

// Persist the resolved cloud URL so the next "saved settings" launch works.
writeJson(runtimePath, {
  cloudUrl: config.cloudUrl,
  runnerSecret: config.runnerSecret,
  agentPort: config.agentPort,
  updatedAt: new Date().toISOString(),
});

function saveState() {
  writeJson(statePath, state);
}

// Persist the generated identity immediately, even if the cloud is unreachable,
// so a PC never changes identity between runs.
saveState();

function formatPairingCode(code) {
  if (!code) return '—';
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// ---------------------------------------------------------------------------
// HTTP client to the cloud dashboard
// ---------------------------------------------------------------------------

function apiRequest(pathname, options = {}) {
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : null;
  const url = new URL(pathname, `${config.cloudUrl}/`);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        timeout: 15_000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `NexusRunner/${RUNNER_VERSION}`,
          'x-machine-id': state.machineId,
          'x-machine-token': state.machineToken,
          'x-runner-token': config.runnerSecret,
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = { raw };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const message =
              (parsed && (parsed.error || parsed.message)) ||
              `HTTP ${res.statusCode} from ${pathname}`;
            const error = new Error(message);
            error.statusCode = res.statusCode;
            error.payload = parsed;
            reject(error);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Cloud request timed out'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

let previousCpuTimes = os.cpus().map((cpu) => cpu.times);
function cpuUsagePercent() {
  const current = os.cpus().map((cpu) => cpu.times);
  let totalDiff = 0;
  let idleDiff = 0;
  current.forEach((times, index) => {
    const prev = previousCpuTimes[index];
    if (!prev) return;
    const prevTotal = Object.values(prev).reduce((a, b) => a + b, 0);
    const currTotal = Object.values(times).reduce((a, b) => a + b, 0);
    totalDiff += currTotal - prevTotal;
    idleDiff += times.idle - prev.idle;
  });
  previousCpuTimes = current;
  if (!totalDiff) return 0;
  return Math.min(100, Math.max(0, Math.round((100 - (idleDiff / totalDiff) * 100) * 10) / 10));
}

function localIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const entry of list || []) {
      if (entry && entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

// ---------------------------------------------------------------------------
// Active jobs
// ---------------------------------------------------------------------------

/** jobId -> { child, pid, job, cancelled, finished, logBuffer, flushTimer, recent } */
const activeJobs = new Map();
const pendingSpawns = new Set();
const cancelledBeforeSpawn = new Set();

let online = false;
let lastConnectionError = '';

async function heartbeat() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const payload = {
      id: state.machineId,
      name: machineName,
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      loggedInUser: os.userInfo().username || 'Operator',
      runnerVersion: RUNNER_VERSION,
      cpuUsage: cpuUsagePercent(),
      ramUsage: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10,
      totalRamGb: Math.round(totalMem / 1024 ** 3),
      ipAddress: localIpAddress(),
      activeJobsCount: activeJobs.size,
      pairingCode: state.pairingCode,
    };

    const response = await apiRequest('/api/machines/heartbeat', {
      method: 'POST',
      body: payload,
    });

    if (response && response.success) {
      if (response.token && response.token !== state.machineToken) {
        state.machineToken = response.token;
        saveState();
      }
      if (response.pairingCode && response.pairingCode !== state.pairingCode) {
        state.pairingCode = response.pairingCode;
        saveState();
      }
      if (!online) {
        console.log(`[CONNECTED] ${machineName} is ONLINE → ${config.cloudUrl}`);
        console.log(`[PAIRING]   Code: ${formatPairingCode(state.pairingCode)}  (use this if auto-detect fails)`);
        online = true;
        lastConnectionError = '';
      }
    }
  } catch (err) {
    const message = err.message || String(err);
    if (online || message !== lastConnectionError) {
      console.warn(`[RECONNECTING] ${config.cloudUrl} → ${message}`);
    }
    online = false;
    lastConnectionError = message;
  }
}

// ---------------------------------------------------------------------------
// Update reporting + logs
// ---------------------------------------------------------------------------

function isTerminal(status) {
  return ['Completed', 'Failed', 'Cancelled', 'Disconnected'].includes(status);
}

async function reportUpdate(jobId, updates) {
  try {
    await apiRequest('/api/runner/update', {
      method: 'POST',
      body: { jobId, ...updates },
    });
  } catch (err) {
    if (!/timed out|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(err.message || '')) {
      console.warn(`[REPORT] ${jobId}: ${err.message}`);
    }
  }
}

function makeLogger(entry, job) {
  entry.logBuffer = [];
  entry.flushTimer = null;

  const flush = async () => {
    entry.flushTimer = null;
    if (!entry.logBuffer.length) return;
    const batch = entry.logBuffer.splice(0, entry.logBuffer.length);
    await reportUpdate(job.id, { logs: batch });
  };

  return function log(level, message) {
    const text = String(message == null ? '' : message).replace(/\r/g, '').trim();
    if (!text) return;
    for (const line of text.split('\n').slice(0, 80)) {
      const clean = line.length > 8000 ? `${line.slice(0, 8000)}…` : line;
      entry.recent.push(`[${level}] ${clean}`);
      if (entry.recent.length > 50) entry.recent.shift();
      entry.logBuffer.push({ level, message: clean, timestamp: new Date().toISOString() });
      const prefix =
        level === 'error' ? 'ERR ' : level === 'warn' ? 'WARN' : level === 'step' ? 'STEP' : 'INFO';
      console.log(`  [${prefix}] ${clean}`);
    }
    if (entry.logBuffer.length >= 40) {
      flush();
    } else if (!entry.flushTimer) {
      entry.flushTimer = setTimeout(flush, LOG_FLUSH_MS);
    }
  };
}

// ---------------------------------------------------------------------------
// Local port allocation
// ---------------------------------------------------------------------------

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, AGENT_HOST);
  });
}

// Concurrent jobs must never be handed the same port. isPortFree() only sees
// sockets that are already bound, so reserve ports in memory and serialise the
// scan until the child process has had time to bind.
const reservedPorts = new Set();
let portAllocationQueue = Promise.resolve();

function allocatePort() {
  const task = portAllocationQueue.then(async () => {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port += 1) {
      if (port === config.agentPort) continue;
      if (reservedPorts.has(port)) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await isPortFree(port)) {
        reservedPorts.add(port);
        return port;
      }
    }
    throw new Error(`No free local port in ${PORT_RANGE_START}-${PORT_RANGE_END}`);
  });
  portAllocationQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

function releasePort(port) {
  if (port) reservedPorts.delete(port);
}

// ---------------------------------------------------------------------------
// Browser window
// ---------------------------------------------------------------------------

function chromeCandidates() {
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    localAppData ? path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe') : '',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
}

function openInChrome(url) {
  const browser = chromeCandidates().find((candidate) => fs.existsSync(candidate));
  try {
    if (browser) {
      const child = spawn(browser, ['--new-window', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      console.log(`[BROWSER] Opened ${url} in ${path.basename(browser)}`);
      return;
    }
    exec(`start "" "${url}"`);
    console.log(`[BROWSER] Opened ${url} in the default browser`);
  } catch (err) {
    console.warn(`[BROWSER] Could not open ${url}: ${err.message}`);
  }
}

function waitForHttp(port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const check = () => {
      if (settled) return;
      const req = http.get(
        { host: AGENT_HOST, port, path: '/', timeout: 2000 },
        (res) => {
          settled = true;
          res.resume();
          resolve(true);
        }
      );
      req.on('timeout', () => {
        req.destroy();
      });
      req.on('error', () => {
        if (Date.now() - started >= timeoutMs) {
          settled = true;
          resolve(false);
          return;
        }
        setTimeout(check, 900);
      });
    };
    check();
  });
}

function killProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${pid} /T /F`, () => resolve());
      return;
    }
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
    resolve();
  });
}

// ---------------------------------------------------------------------------
// Package registry
// ---------------------------------------------------------------------------

const PACKAGE_REGISTRY = {
  'mhtcet-status-checker': {
    relDir: '01_MHT_CET_Option_Form_Confirmation_Status_Checker',
    cmd: 'npx',
    args: ['tsx', 'server/server.ts'],
    isServer: true,
  },
  'cutoff-pdf-extractor': {
    relDir: '02_MHT_CET_Cutoff_PDF_to_Excel_Master_Extractor',
    cmd: 'python',
    args: ['web_server.py'],
    isServer: true,
  },
  'dse-choice-filling': {
    relDir: '03_DSE_Engineering_Option_Form_Choice_Filling_Automation',
    cmd: 'npx',
    args: ['tsx', 'server/server.ts'],
    isServer: true,
  },
  'cap-links-live-alert': {
    relDir: '07_MHT_CET_CAP_Round_Links_Live_Alert_Server',
    cmd: 'python',
    args: ['server.py'],
    isServer: true,
  },
  'cet-choice-filling-r1-r4': {
    relDir: 'CET_Choice_Filling_Automation_ROUND1-4_FIXED',
    cmd: 'npx',
    args: ['tsx', 'server/server.ts'],
    isServer: true,
  },
  'allotment-result-checker': {
    relDir: 'Student_Allotment_Result_Checker',
    cmd: 'python',
    argsForPort: (port) => ['web_app.py', '--port', String(port)],
    args: ['web_app.py'],
    isServer: true,
  },
  'cutoff-book-maker': {
    relDir: path.join('book works', 'BOOK TABLE MAKER CET'),
    cmd: 'python',
    args: ['app.py'],
    isServer: true,
  },
};

function resolvePackageDir(job, automation) {
  const spec = PACKAGE_REGISTRY[job.automationId];
  const candidates = [];
  if (spec) candidates.push(path.join(packagesRoot, spec.relDir));
  if (automation && automation.packageDir) {
    const raw = String(automation.packageDir);
    candidates.push(path.isAbsolute(raw) ? raw : path.resolve(hubRoot, raw));
    candidates.push(path.resolve(packagesRoot, raw));
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return candidates[0] || packagesRoot;
}

function buildCommand(job, automation, directory, port) {
  const spec = PACKAGE_REGISTRY[job.automationId];
  if (spec) {
    return {
      cmd: spec.cmd,
      args: spec.argsForPort ? spec.argsForPort(port) : spec.args.slice(),
      isServer: Boolean(spec.isServer),
    };
  }

  const files = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
  const entry = automation.entryPoint && files.includes(path.basename(automation.entryPoint))
    ? path.basename(automation.entryPoint)
    : '';

  if (
    String(automation.language || '').toLowerCase().includes('python') ||
    files.some((file) => file.endsWith('.py'))
  ) {
    const pythonEntry =
      entry ||
      ['app.py', 'web_server.py', 'server.py', 'main.py'].find((file) => files.includes(file)) ||
      files.find((file) => file.endsWith('.py')) ||
      'main.py';
    return { cmd: 'python', args: [pythonEntry], isServer: Boolean(automation.defaultPort) };
  }

  return {
    cmd: 'npx',
    args: ['tsx', entry || 'server/server.ts'],
    isServer: true,
  };
}

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

async function executeJob(job, automation) {
  pendingSpawns.add(job.id);

  if (cancelledBeforeSpawn.has(job.id)) {
    cancelledBeforeSpawn.delete(job.id);
    pendingSpawns.delete(job.id);
    await reportUpdate(job.id, {
      status: 'Cancelled',
      step: 'Cancelled before the process started',
      endTime: new Date().toISOString(),
      logs: [{ level: 'warn', message: 'Cancellation received before spawn — nothing was launched.' }],
    });
    return;
  }

  const entry = {
    child: null,
    pid: null,
    job,
    cancelled: false,
    finished: false,
    recent: [],
    logBuffer: [],
    flushTimer: null,
  };
  const log = makeLogger(entry, job);

  console.log('\n======================================================');
  console.log(`[JOB] ${job.id}`);
  console.log(`      ${job.automationName}`);
  console.log(`      Pinned PC: ${machineName}`);
  console.log('======================================================');

  const directory = resolvePackageDir(job, automation);
  log('info', `Local package directory: ${directory}`);
  log('step', `Executing only on this PC: ${machineName} (${state.machineId})`);

  if (!fs.existsSync(directory)) {
    pendingSpawns.delete(job.id);
    log('error', `Package directory is missing: ${directory}`);
    await reportUpdate(job.id, {
      status: 'Failed',
      step: 'Package directory missing on this PC',
      errorMessage: `Folder not found: ${directory}. Extract the automation package on this PC.`,
      endTime: new Date().toISOString(),
      logs: entry.logBuffer.splice(0),
    });
    return;
  }

  const needsPort = Boolean(automation.requiresLocalServer || automation.defaultPort);
  let port;
  try {
    port = needsPort ? await allocatePort() : undefined;
  } catch (err) {
    pendingSpawns.delete(job.id);
    await reportUpdate(job.id, {
      status: 'Failed',
      step: 'Could not allocate a free local port',
      errorMessage: err.message,
      endTime: new Date().toISOString(),
      logs: entry.logBuffer.splice(0),
    });
    return;
  }

  const command = buildCommand(job, automation, directory, port);
  if (port) log('step', `Allocated free local port :${port}`);

  if (cancelledBeforeSpawn.has(job.id)) {
    cancelledBeforeSpawn.delete(job.id);
    pendingSpawns.delete(job.id);
    releasePort(port);
    await reportUpdate(job.id, {
      status: 'Cancelled',
      step: 'Cancelled before spawn',
      endTime: new Date().toISOString(),
      logs: entry.logBuffer.splice(0),
    });
    return;
  }

  const env = {
    ...process.env,
    NODE_PATH: path.join(hubRoot, 'node_modules') + (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : ''),
    JOB_ID: job.id,
    MACHINE_ID: state.machineId,
    PORT: port ? String(port) : '',
    HOST: AGENT_HOST,
    PYTHONUNBUFFERED: '1',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    HEADLESS: job.inputs && job.inputs.headless ? 'true' : 'false',
    PLAYWRIGHT_NEW_CONTEXT: 'true',
  };

  log('step', `Spawning: ${command.cmd} ${command.args.join(' ')}`);
  if (port) log('info', `Local URL: http://localhost:${port}`);

  let child;
  try {
    child = spawn(command.cmd, command.args, {
      cwd: directory,
      env,
      shell: true,
      windowsHide: true,
    });
  } catch (err) {
    pendingSpawns.delete(job.id);
    releasePort(port);
    log('error', `Spawn failed: ${err.message}`);
    await reportUpdate(job.id, {
      status: 'Failed',
      step: 'Process could not be started',
      errorMessage: err.message,
      endTime: new Date().toISOString(),
      logs: entry.logBuffer.splice(0),
    });
    return;
  }

  entry.child = child;
  entry.pid = child.pid;
  activeJobs.set(job.id, entry);
  pendingSpawns.delete(job.id);

  await reportUpdate(job.id, {
    status: 'Running',
    step: port
      ? `Starting locally on ${machineName} · port :${port}`
      : `Running locally on ${machineName}`,
    progress: port ? 25 : 35,
    processId: child.pid,
    allocatedPort: port,
    logs: entry.logBuffer.splice(0),
  });

  child.stdout?.on('data', (chunk) => log('info', chunk.toString()));
  child.stderr?.on('data', (chunk) => log('warn', chunk.toString()));

  if (port) {
    waitForHttp(port, BROWSER_READY_TIMEOUT_MS).then(async (ready) => {
      if (!activeJobs.has(job.id) || entry.finished) return;
      if (ready) {
        const url = `http://localhost:${port}`;
        log('success', `Workflow is responding at ${url}`);
        await reportUpdate(job.id, {
          status: 'Running',
          progress: 60,
          step: `Workflow ready at ${url}`,
          browserTabUrl: url,
          logs: entry.logBuffer.splice(0),
        });
        openInChrome(url);
      } else {
        log(
          'warn',
          `Process is alive but did not answer HTTP on :${port} within ${Math.round(
            BROWSER_READY_TIMEOUT_MS / 1000
          )}s. It may still be installing dependencies.`
        );
        await reportUpdate(job.id, {
          step: `Process alive; waiting for the local server on :${port}`,
          logs: entry.logBuffer.splice(0),
        });
      }
    });
  }

  child.on('error', async (err) => {
    if (entry.finished) return;
    entry.finished = true;
    activeJobs.delete(job.id);
    releasePort(port);
    log('error', `Process error: ${err.message}`);
    await reportUpdate(job.id, {
      status: 'Failed',
      step: 'Process crashed before completing',
      errorMessage: err.message,
      endTime: new Date().toISOString(),
      logs: entry.logBuffer.splice(0),
    });
  });

  child.on('close', async (code, signal) => {
    if (entry.finished) return;
    entry.finished = true;
    activeJobs.delete(job.id);
    releasePort(port);
    if (entry.flushTimer) clearTimeout(entry.flushTimer);
    log('info', `Process exited with code ${code}${signal ? ` (${signal})` : ''}`);

    const cancelled = entry.cancelled;
    const status = cancelled ? 'Cancelled' : code === 0 ? 'Completed' : 'Failed';
    const tail = entry.recent.slice(-6).join('\n');

    await reportUpdate(job.id, {
      status,
      progress: status === 'Completed' ? 100 : undefined,
      step: cancelled
        ? 'Stopped by user request'
        : status === 'Completed'
          ? `Completed on ${machineName}`
          : `Process exited with code ${code} on ${machineName}`,
      exitCode: typeof code === 'number' ? code : undefined,
      errorMessage: status === 'Failed' ? tail || `Exit code ${code}` : undefined,
      endTime: new Date().toISOString(),
      logs: entry.logBuffer.splice(0),
    });

    console.log(`[JOB ${status.toUpperCase()}] ${job.id}\n`);
  });
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let polling = false;

async function pollOnce() {
  if (polling || !state.machineToken) return;
  polling = true;
  try {
    const response = await apiRequest(
      `/api/runner/poll?capacity=${config.maxConcurrentJobs}&activeCount=${activeJobs.size}`,
      { method: 'GET' }
    );
    if (!response || !response.success) return;

    for (const jobId of response.cancelJobIds || []) {
      const entry = activeJobs.get(jobId);
      if (entry) {
        if (!entry.cancelled) {
          entry.cancelled = true;
          console.log(`[CANCEL] Killing process tree for ${jobId} (PID ${entry.pid})`);
          await killProcessTree(entry.pid);
        }
      } else if (pendingSpawns.has(jobId)) {
        cancelledBeforeSpawn.add(jobId);
      }
    }

    for (const job of response.pendingJobs || []) {
      if (activeJobs.size >= config.maxConcurrentJobs) break;
      if (activeJobs.has(job.id) || pendingSpawns.has(job.id)) continue;
      pendingSpawns.add(job.id);
      try {
        const claimed = await apiRequest('/api/runner/claim', {
          method: 'POST',
          body: { jobId: job.id },
        });
        if (claimed && claimed.success) {
          executeJob(claimed.job, claimed.automation).catch((err) => {
            pendingSpawns.delete(job.id);
            console.warn(`[JOB] ${job.id} failed: ${err.message}`);
          });
        } else {
          pendingSpawns.delete(job.id);
        }
      } catch (err) {
        pendingSpawns.delete(job.id);
        if (err.statusCode !== 409) {
          console.warn(`[CLAIM] ${job.id}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    if (!/timed out|ECONNREFUSED|ENOTFOUND/i.test(err.message || '')) {
      console.warn(`[POLL] ${err.message}`);
    }
  } finally {
    polling = false;
  }
}

// ---------------------------------------------------------------------------
// Localhost discovery agent (the dashboard probes this on the same PC)
// ---------------------------------------------------------------------------

function isAllowedDashboardOrigin(origin) {
  if (!origin) return false;
  // Any loopback origin is acceptable for local development.
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) return true;
  try {
    const configured = new URL(config.cloudUrl);
    return origin === configured.origin;
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Machine-Id, X-Machine-Token, X-Runner-Token',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  // Only expose the machine token to the dashboard this runner was configured
  // for (plus loopback development origins). Arbitrary websites cannot read it.
  if (isAllowedDashboardOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function identityPayload() {
  return {
    ok: true,
    version: RUNNER_VERSION,
    machineId: state.machineId,
    machineName,
    token: state.machineToken,
    pairingCode: state.pairingCode,
    cloudUrl: config.cloudUrl,
    agentPort: actualAgentPort,
    platform: `${os.type()} ${os.release()}`,
    user: os.userInfo().username,
    activeJobs: activeJobs.size,
    online,
  };
}

let actualAgentPort = config.agentPort;

function startAgent(port, attempt = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const headers = {
        ...corsHeaders(req),
        'Content-Type': 'application/json',
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${AGENT_HOST}:${port}`);
      if (req.method === 'GET' && url.pathname === '/identity') {
        res.writeHead(200, headers);
        res.end(JSON.stringify(identityPayload()));
        return;
      }
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
        res.writeHead(200, headers);
        res.end(
          JSON.stringify({
            ok: true,
            service: 'nexus-runner-agent',
            version: RUNNER_VERSION,
            machineId: state.machineId,
            machineName,
            online,
            activeJobs: activeJobs.size,
          })
        );
        return;
      }

      res.writeHead(404, headers);
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    });

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < 10) {
        resolve(startAgent(port + 1, attempt + 1));
        return;
      }
      reject(err);
    });

    server.listen(port, AGENT_HOST, () => {
      actualAgentPort = port;
      resolve({ server, port });
    });
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main() {
  console.log('================================================================');
  console.log('        NEXUS AUTOMATION HUB — LOCAL WINDOWS RUNNER v2.0.0      ');
  console.log('================================================================');
  console.log(` Machine:        ${machineName}`);
  console.log(` Machine ID:     ${state.machineId}`);
  console.log(` Cloud control:  ${config.cloudUrl}`);
  console.log(` OS:             ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(` CPU cores:      ${os.cpus().length}`);
  console.log(` RAM:            ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`);
  console.log(` Agent port:     ${config.agentPort}`);
  console.log('----------------------------------------------------------------');
  console.log(' JOB ISOLATION:  jobs are pinned to THIS machine only.');
  console.log(' Chrome, ports and processes are created locally per job.');
  console.log('================================================================\n');

  let agent;
  try {
    agent = await startAgent(config.agentPort);
  } catch (err) {
    console.error(`[FATAL] Could not start the local identity agent: ${err.message}`);
    process.exit(1);
  }

  console.log(`[AGENT] Local discovery endpoint: http://${AGENT_HOST}:${agent.port}/identity`);
  console.log(`[PAIRING] Code: ${formatPairingCode(state.pairingCode)}`);
  console.log('[AGENT] Open the dashboard on THIS PC; it will detect this runner automatically.');
  console.log('');

  if (!state.machineToken) {
    console.log('[AUTH] No machine token yet — waiting for the first heartbeat registration...');
  }

  await heartbeat();
  if (state.machineToken) await pollOnce();

  setInterval(heartbeat, config.heartbeatIntervalMs).unref?.();
  setInterval(pollOnce, config.pollIntervalMs).unref?.();

  // Keep the process alive because of the agent server, even if timers unref.
  agent.server.unref();

  const shutdown = async (signal) => {
    console.log(`\n[SHUTDOWN] ${signal} received. Stopping active jobs...`);
    const jobs = [...activeJobs.values()];
    for (const entry of jobs) {
      // eslint-disable-next-line no-await-in-loop
      await killProcessTree(entry.pid);
      // eslint-disable-next-line no-await-in-loop
      await reportUpdate(entry.job.id, {
        status: 'Disconnected',
        step: 'Runner was shut down before the job finished',
        endTime: new Date().toISOString(),
        logs: [{ level: 'warn', message: 'Local runner stopped; process was terminated.' }],
      });
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep alive explicitly.
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
