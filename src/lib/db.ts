import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { INITIAL_AUTOMATIONS } from './registry';

const DEFAULT_USERS: User[] = [
  {
    id: "usr_prajwal",
    name: "Prajwal (Admin)",
    email: "prajwal@automationhub.internal",
    role: "admin",
    token: "tok_admin_prajwal"
  },
  {
    id: "usr_operator1",
    name: "Admission Desk 1",
    email: "operator1@automationhub.internal",
    role: "user",
    token: "tok_user_op1"
  },
  {
    id: "usr_operator2",
    name: "Admission Desk 2",
    email: "operator2@automationhub.internal",
    role: "user",
    token: "tok_user_op2"
  }
];
import { Automation, ExecutionJob, ExecutionLog, Machine, User, UploadedPackage } from './types';

interface DatabaseSchema {
  automations: Automation[];
  jobs: ExecutionJob[];
  logs: Record<string, ExecutionLog[]>;
  machines: Machine[];
  users: User[];
  uploadedPackages: UploadedPackage[];
}

export type StorageMode = 'supabase' | 'file' | 'memory';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
);
const useSupabase = Boolean(
  SUPABASE_URL && SUPABASE_KEY && /^https?:\/\//.test(SUPABASE_URL)
);

export const storageMode: StorageMode = useSupabase
  ? 'supabase'
  : isServerless
    ? 'memory'
    : 'file';

const DATA_DIR = isServerless ? path.join('/tmp', 'automation_hub_data') : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function seedState(): DatabaseSchema {
  return {
    automations: [...INITIAL_AUTOMATIONS],
    jobs: [],
    logs: {},
    machines: [],
    users: [...DEFAULT_USERS],
    uploadedPackages: []
  };
}

function checkHeartbeats(db: DatabaseSchema) {
  const now = Date.now();
  for (const m of db.machines) {
    const last = new Date(m.lastHeartbeat).getTime();
    if (!Number.isFinite(last) || now - last > 45000) {
      m.status = 'offline';
    }
  }
}

function withLiveStatus(machine: Machine): Machine {
  const last = new Date(machine.lastHeartbeat).getTime();
  const stale = !Number.isFinite(last) || Date.now() - last > 45000;
  return stale ? { ...machine, status: 'offline' } : machine;
}

let memoryDb: DatabaseSchema | null = null;

function loadLocalDb(): DatabaseSchema {
  if (memoryDb) {
    checkHeartbeats(memoryDb);
    return memoryDb;
  }

  if (storageMode === 'file' || isServerless) {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        memoryDb = JSON.parse(raw) as DatabaseSchema;
      }
    } catch (err) {
      console.warn('[DB] Could not read db.json, using bundled seed:', (err as Error).message);
    }
  }

  if (!memoryDb) memoryDb = seedState();
  checkHeartbeats(memoryDb);
  return memoryDb;
}

function saveLocalDb(db: DatabaseSchema) {
  memoryDb = db;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[DB] Local write failed:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Supabase REST (PostgREST) adapter
// ---------------------------------------------------------------------------

async function sbRequest<T = any>(endpoint: string, init: RequestInit = {}): Promise<T> {
  if (!useSupabase) throw new Error('Supabase is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Supabase ${res.status}: ${text.slice(0, 400) || res.statusText}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    clearTimeout(timeout);
  }
}

let cloudSeedPromise: Promise<void> | null = null;

function ensureCloudSeed(): Promise<void> {
  if (!useSupabase) return Promise.resolve();
  if (cloudSeedPromise) return cloudSeedPromise;

  cloudSeedPromise = (async () => {
    const existingAutomations = await sbRequest<any[]>('automations?select=id&limit=1');
    if (!existingAutomations || existingAutomations.length === 0) {
      const rows = INITIAL_AUTOMATIONS.map(toAutomationRow);
      await sbRequest('automations', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
    }

    const existingUsers = await sbRequest<any[]>('users?select=id&limit=1');
    if (!existingUsers || existingUsers.length === 0) {
      const users = DEFAULT_USERS;
      await sbRequest('users', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(users),
      });
    }
  })().catch((err) => {
    cloudSeedPromise = null;
    throw err;
  });

  return cloudSeedPromise;
}

// Row mappers ---------------------------------------------------------------

function toAutomationRow(a: Automation) {
  return {
    id: a.id,
    name: a.name,
    description: a.description || '',
    category: a.category,
    original_zip: a.originalZip || '',
    entry_point: a.entryPoint,
    command_template: a.commandTemplate || '',
    language: a.language,
    dependencies: a.dependencies || [],
    required_inputs: a.requiredInputs || [],
    required_browser: a.requiredBrowser || 'None',
    execution_requirements: a.executionRequirements || '',
    status: a.status || 'ready',
    version: a.version || '1.0.0',
    last_updated: a.lastUpdated || new Date().toISOString().slice(0, 10),
    requires_local_server: Boolean(a.requiresLocalServer),
    default_port: a.defaultPort ?? null,
    package_dir: a.packageDir,
  };
}

function fromAutomationRow(r: any): Automation {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    category: r.category,
    originalZip: r.original_zip || '',
    entryPoint: r.entry_point,
    commandTemplate: r.command_template || '',
    language: r.language,
    dependencies: r.dependencies || [],
    requiredInputs: r.required_inputs || [],
    requiredBrowser: r.required_browser || 'None',
    executionRequirements: r.execution_requirements || '',
    status: r.status || 'ready',
    version: r.version || '1.0.0',
    lastUpdated: (r.last_updated || '').toString().slice(0, 10),
    requiresLocalServer: Boolean(r.requires_local_server),
    defaultPort: r.default_port ?? undefined,
    packageDir: r.package_dir,
  };
}

function toJobRow(j: ExecutionJob) {
  return {
    id: j.id,
    automation_id: j.automationId,
    automation_name: j.automationName,
    user_id: j.userId,
    user_name: j.userName,
    machine_id: j.machineId,
    machine_name: j.machineName,
    status: j.status,
    progress: j.progress ?? 0,
    step: j.step || '',
    start_time: j.startTime,
    end_time: j.endTime ?? null,
    duration_seconds: j.durationSeconds ?? null,
    process_id: j.processId ?? null,
    allocated_port: j.allocatedPort ?? null,
    browser_tab_url: j.browserTabUrl ?? null,
    exit_code: j.exitCode ?? null,
    error_message: j.errorMessage ?? null,
    inputs: j.inputs || {},
    created_at: j.createdAt || j.startTime,
    cancel_requested: Boolean(j.cancelRequested),
  };
}

function fromJobRow(r: any): ExecutionJob {
  return {
    id: r.id,
    automationId: r.automation_id,
    automationName: r.automation_name,
    userId: r.user_id,
    userName: r.user_name,
    machineId: r.machine_id,
    machineName: r.machine_name,
    status: r.status,
    progress: r.progress ?? 0,
    step: r.step || '',
    startTime: r.start_time,
    endTime: r.end_time ?? undefined,
    durationSeconds: r.duration_seconds ?? undefined,
    processId: r.process_id ?? undefined,
    allocatedPort: r.allocated_port ?? undefined,
    browserTabUrl: r.browser_tab_url ?? undefined,
    exitCode: r.exit_code ?? undefined,
    errorMessage: r.error_message ?? undefined,
    inputs: r.inputs || {},
    createdAt: r.created_at || r.start_time,
    cancelRequested: Boolean(r.cancel_requested),
  };
}

function toMachineRow(m: Machine) {
  return {
    id: m.id,
    name: m.name,
    os: m.os,
    logged_in_user: m.loggedInUser,
    runner_version: m.runnerVersion,
    status: m.status,
    last_heartbeat: m.lastHeartbeat,
    active_jobs_count: m.activeJobsCount ?? 0,
    cpu_usage: m.cpuUsage ?? 0,
    ram_usage: m.ramUsage ?? 0,
    total_ram_gb: m.totalRamGb ?? 16,
    ip_address: m.ipAddress || '127.0.0.1',
    token: m.token,
    pairing_code: m.pairingCode || null,
  };
}

function fromMachineRow(r: any): Machine {
  const machine: Machine = {
    id: r.id,
    name: r.name,
    os: r.os,
    loggedInUser: r.logged_in_user,
    runnerVersion: r.runner_version,
    status: r.status,
    lastHeartbeat: r.last_heartbeat,
    activeJobsCount: r.active_jobs_count ?? 0,
    cpuUsage: Number(r.cpu_usage ?? 0),
    ramUsage: Number(r.ram_usage ?? 0),
    totalRamGb: r.total_ram_gb ?? 16,
    ipAddress: r.ip_address || '127.0.0.1',
    token: r.token,
    pairingCode: r.pairing_code || undefined,
  };
  return withLiveStatus(machine);
}

function fromLogRow(r: any): ExecutionLog {
  return {
    id: r.id,
    jobId: r.job_id,
    timestamp: r.timestamp,
    level: r.level,
    message: r.message,
  };
}

function toUploadedPackageRow(p: UploadedPackage) {
  return {
    id: p.id,
    file_name: p.fileName,
    file_size: p.fileSize,
    uploaded_at: p.uploadedAt,
    uploaded_by: p.uploadedBy,
    status: p.status,
    detected_language: p.detectedLanguage,
    entry_point: p.entryPoint,
    dependencies: p.dependencies || [],
    required_browsers: p.requiredBrowsers || [],
    ports_found: p.portsFound || [],
    scan_report: p.scanReport,
  };
}

function fromUploadedPackageRow(r: any): UploadedPackage {
  return {
    id: r.id,
    fileName: r.file_name,
    fileSize: Number(r.file_size || 0),
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by,
    status: r.status,
    detectedLanguage: r.detected_language || 'Unknown',
    entryPoint: r.entry_point || '',
    dependencies: r.dependencies || [],
    requiredBrowsers: r.required_browsers || [],
    portsFound: r.ports_found || [],
    scanReport: r.scan_report,
  };
}

const STATUS_CANONICAL: Record<string, string> = {
  waiting: 'Waiting',
  queued: 'Queued',
  starting: 'Starting',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  disconnected: 'Disconnected',
};

const TERMINAL_STATUSES = ['Completed', 'Failed', 'Cancelled'];
const ACTIVE_STATUSES = ['Starting', 'Running', 'Queued'];

const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePairingCode(): string {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i += 1) out += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  return out;
}

export function generateMachineToken(): string {
  return `runner_${crypto.randomBytes(24).toString('hex')}`;
}

export function normalizePairingCode(code: string): string {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Public repository ---------------------------------------------------------

export const db = {
  storageMode,

  // Automations
  getAutomations: async (): Promise<Automation[]> => {
    if (useSupabase) {
      await ensureCloudSeed();
      const rows = await sbRequest<any[]>('automations?select=*&order=name.asc');
      return (rows || []).map(fromAutomationRow);
    }
    return loadLocalDb().automations;
  },

  getAutomation: async (id: string): Promise<Automation | undefined> => {
    if (useSupabase) {
      await ensureCloudSeed();
      const rows = await sbRequest<any[]>(
        `automations?select=*&id=eq.${encodeURIComponent(id)}&limit=1`
      );
      return rows?.[0] ? fromAutomationRow(rows[0]) : undefined;
    }
    return loadLocalDb().automations.find((a) => a.id === id);
  },

  addAutomation: async (automation: Automation): Promise<void> => {
    if (useSupabase) {
      await ensureCloudSeed();
      await sbRequest('automations?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(toAutomationRow(automation)),
      });
      return;
    }
    const d = loadLocalDb();
    const idx = d.automations.findIndex((a) => a.id === automation.id);
    if (idx >= 0) d.automations[idx] = automation;
    else d.automations.push(automation);
    saveLocalDb(d);
  },

  // Jobs
  getJobs: async (filters?: {
    machineId?: string;
    userId?: string;
    status?: string;
    limit?: number;
  }): Promise<ExecutionJob[]> => {
    if (useSupabase) {
      await ensureCloudSeed();
      let query = 'execution_jobs?select=*&order=created_at.desc';
      if (filters?.machineId) query += `&machine_id=eq.${encodeURIComponent(filters.machineId)}`;
      if (filters?.userId) query += `&user_id=eq.${encodeURIComponent(filters.userId)}`;
      if (filters?.status) {
        const canonical =
          STATUS_CANONICAL[filters.status.toLowerCase()] || filters.status;
        query += `&status=eq.${encodeURIComponent(canonical)}`;
      }
      if (filters?.limit) query += `&limit=${Math.max(1, Math.min(500, filters.limit))}`;
      const rows = await sbRequest<any[]>(query);
      return (rows || []).map(fromJobRow);
    }

    let jobs = loadLocalDb().jobs;
    if (filters?.machineId) jobs = jobs.filter((j) => j.machineId === filters.machineId);
    if (filters?.userId) jobs = jobs.filter((j) => j.userId === filters.userId);
    if (filters?.status) {
      jobs = jobs.filter(
        (j) => j.status.toLowerCase() === filters.status!.toLowerCase()
      );
    }
    const sorted = [...jobs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return filters?.limit ? sorted.slice(0, filters.limit) : sorted;
  },

  getJob: async (id: string): Promise<ExecutionJob | undefined> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `execution_jobs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`
      );
      return rows?.[0] ? fromJobRow(rows[0]) : undefined;
    }
    return loadLocalDb().jobs.find((j) => j.id === id);
  },

  createJob: async (job: ExecutionJob): Promise<void> => {
    if (useSupabase) {
      await ensureCloudSeed();
      await sbRequest('execution_jobs', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(toJobRow(job)),
      });
      return;
    }

    const d = loadLocalDb();
    d.jobs.unshift(job);
    const machine = d.machines.find((m) => m.id === job.machineId);
    if (machine) {
      machine.activeJobsCount = d.jobs.filter(
        (j) =>
          j.machineId === machine.id &&
          ['Starting', 'Running', 'Queued'].includes(j.status)
      ).length;
    }
    saveLocalDb(d);
  },

  updateJob: async (
    id: string,
    updates: Partial<ExecutionJob>
  ): Promise<ExecutionJob | undefined> => {
    if (useSupabase) {
      const current = await db.getJob(id);
      if (!current) return undefined;

      const row: Record<string, any> = {};
      if (updates.status !== undefined) row.status = updates.status;
      if (updates.progress !== undefined) row.progress = updates.progress;
      if (updates.step !== undefined) row.step = updates.step;
      if (updates.processId !== undefined) row.process_id = updates.processId;
      if (updates.allocatedPort !== undefined) row.allocated_port = updates.allocatedPort;
      if (updates.browserTabUrl !== undefined) row.browser_tab_url = updates.browserTabUrl;
      if (updates.exitCode !== undefined) row.exit_code = updates.exitCode;
      if (updates.errorMessage !== undefined) row.error_message = updates.errorMessage;
      if (updates.inputs !== undefined) row.inputs = updates.inputs;
      if (updates.endTime !== undefined) row.end_time = updates.endTime;
      if (updates.cancelRequested !== undefined) row.cancel_requested = updates.cancelRequested;

      const terminal = TERMINAL_STATUSES.includes(updates.status || current.status);
      if (terminal && row.cancel_requested === undefined) row.cancel_requested = false;
      if (terminal && current.startTime) {
        const endMs = updates.endTime
          ? new Date(updates.endTime).getTime()
          : Date.now();
        row.duration_seconds = Math.max(
          1,
          Math.round((endMs - new Date(current.startTime).getTime()) / 1000)
        );
        if (!row.end_time) row.end_time = new Date(endMs).toISOString();
      }

      const rows = await sbRequest<any[]>(
        `execution_jobs?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(row),
        }
      );
      return rows?.[0] ? fromJobRow(rows[0]) : current;
    }

    const d = loadLocalDb();
    const job = d.jobs.find((j) => j.id === id);
    if (!job) return undefined;

    Object.assign(job, updates);
    if (TERMINAL_STATUSES.includes(job.status)) job.cancelRequested = false;
    if (TERMINAL_STATUSES.includes(job.status) && job.startTime) {
      const end = updates.endTime ? new Date(updates.endTime).getTime() : Date.now();
      const start = new Date(job.startTime).getTime();
      job.durationSeconds = Math.max(1, Math.round((end - start) / 1000));
      if (!job.endTime) job.endTime = new Date(end).toISOString();
    }

    const machine = d.machines.find((m) => m.id === job.machineId);
    if (machine) {
      machine.activeJobsCount = d.jobs.filter(
        (j) =>
          j.machineId === machine.id &&
          ['Starting', 'Running', 'Queued'].includes(j.status)
      ).length;
    }

    saveLocalDb(d);
    return job;
  },

  // Machine-scoped queue -----------------------------------------------------
  getQueuedJobsForMachine: async (
    machineId: string,
    limit = 4
  ): Promise<ExecutionJob[]> => {
    return db.getJobs({ machineId, status: 'Queued', limit });
  },

  getCancelJobIds: async (machineId: string): Promise<string[]> => {
    const jobs = await db.getJobs({ machineId });
    return jobs
      .filter((j) => j.cancelRequested && ACTIVE_STATUSES.includes(j.status))
      .map((j) => j.id);
  },

  claimJob: async (
    jobId: string,
    machineId: string
  ): Promise<ExecutionJob | undefined> => {
    const now = new Date().toISOString();

    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `execution_jobs?id=eq.${encodeURIComponent(
          jobId
        )}&machine_id=eq.${encodeURIComponent(
          machineId
        )}&status=eq.Queued`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status: 'Starting',
            start_time: now,
            cancel_requested: false,
            process_id: null,
            step: 'Runner claimed the job — preparing execution',
          }),
        }
      );
      if (!rows?.[0]) return undefined;
      const job = fromJobRow(rows[0]);
      await db.addLog(jobId, {
        level: 'step',
        message: `Runner on ${job.machineName} claimed this job`,
      });
      return job;
    }

    const d = loadLocalDb();
    const job = d.jobs.find((j) => j.id === jobId);
    if (!job || job.machineId !== machineId || job.status !== 'Queued') return undefined;
    job.status = 'Starting';
    job.startTime = now;
    job.cancelRequested = false;
    job.processId = undefined;
    job.step = 'Runner claimed the job — preparing execution';
    saveLocalDb(d);
    await db.addLog(jobId, {
      level: 'step',
      message: `Runner on ${job.machineName} claimed this job`,
    });
    return job;
  },

  requestCancel: async (jobId: string): Promise<ExecutionJob | undefined> => {
    const job = await db.getJob(jobId);
    if (!job) return undefined;
    if (TERMINAL_STATUSES.includes(job.status)) return job;

    if (job.status === 'Queued') {
      const updated = await db.updateJob(jobId, {
        status: 'Cancelled',
        step: 'Cancelled before the runner picked it up',
        endTime: new Date().toISOString(),
        cancelRequested: false,
      });
      await db.addLog(jobId, {
        level: 'warn',
        message: 'Job cancelled while queued — runner was never invoked',
      });
      return updated;
    }

    const updated = await db.updateJob(jobId, {
      cancelRequested: true,
      step: 'Cancellation requested — runner will stop the process',
    });
    await db.addLog(jobId, {
      level: 'warn',
      message: `Cancellation requested. Runner will terminate PID ${job.processId || 'pending'}.`,
    });
    return updated;
  },

  // Logs
  getLogs: async (jobId: string): Promise<ExecutionLog[]> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `execution_logs?select=*&job_id=eq.${encodeURIComponent(
          jobId
        )}&order=timestamp.asc`
      );
      return (rows || []).map(fromLogRow);
    }
    return loadLocalDb().logs[jobId] || [];
  },

  addLog: async (
    jobId: string,
    log: { level: ExecutionLog['level']; message: string; timestamp?: string }
  ): Promise<ExecutionLog> => {
    const fullLog: ExecutionLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      jobId,
      timestamp: log.timestamp || new Date().toISOString(),
      level: log.level,
      message: log.message,
    };

    if (useSupabase) {
      await sbRequest('execution_logs', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          id: fullLog.id,
          job_id: fullLog.jobId,
          timestamp: fullLog.timestamp,
          level: fullLog.level,
          message: fullLog.message,
        }),
      });
      return fullLog;
    }

    const d = loadLocalDb();
    if (!d.logs[jobId]) d.logs[jobId] = [];
    d.logs[jobId].push(fullLog);
    saveLocalDb(d);
    return fullLog;
  },

  addLogs: async (
    jobId: string,
    entries: Array<{ level?: ExecutionLog['level']; message: string; timestamp?: string }>
  ): Promise<ExecutionLog[]> => {
    if (!entries?.length) return [];
    const fullLogs: ExecutionLog[] = entries
      .filter((entry) => entry && entry.message)
      .map((entry) => ({
        id: `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        jobId,
        timestamp: entry.timestamp || new Date().toISOString(),
        level: entry.level || 'info',
        message: entry.message,
      }));
    if (!fullLogs.length) return [];

    if (useSupabase) {
      await sbRequest('execution_logs', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(
          fullLogs.map((log) => ({
            id: log.id,
            job_id: log.jobId,
            timestamp: log.timestamp,
            level: log.level,
            message: log.message,
          }))
        ),
      });
      return fullLogs;
    }

    const d = loadLocalDb();
    if (!d.logs[jobId]) d.logs[jobId] = [];
    d.logs[jobId].push(...fullLogs);
    saveLocalDb(d);
    return fullLogs;
  },

  // Machines
  getMachines: async (): Promise<Machine[]> => {
    if (useSupabase) {
      await ensureCloudSeed();
      const rows = await sbRequest<any[]>('machines?select=*&order=name.asc');
      return (rows || []).map(fromMachineRow);
    }
    checkHeartbeats(loadLocalDb());
    return loadLocalDb().machines;
  },

  getMachine: async (id: string): Promise<Machine | undefined> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `machines?select=*&id=eq.${encodeURIComponent(id)}&limit=1`
      );
      return rows?.[0] ? fromMachineRow(rows[0]) : undefined;
    }
    const machine = loadLocalDb().machines.find((m) => m.id === id);
    return machine ? withLiveStatus(machine) : undefined;
  },

  getMachineByPairingCode: async (code: string): Promise<Machine | undefined> => {
    const normalized = normalizePairingCode(code);
    if (!normalized) return undefined;
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `machines?select=*&pairing_code=eq.${encodeURIComponent(normalized)}&limit=1`
      );
      return rows?.[0] ? fromMachineRow(rows[0]) : undefined;
    }
    const machine = loadLocalDb().machines.find(
      (m) => normalizePairingCode(m.pairingCode || '') === normalized
    );
    return machine ? withLiveStatus(machine) : undefined;
  },

  registerOrHeartbeatMachine: async (data: {
    id: string;
    name: string;
    os?: string;
    loggedInUser?: string;
    runnerVersion?: string;
    cpuUsage?: number;
    ramUsage?: number;
    totalRamGb?: number;
    ipAddress?: string;
    activeJobsCount?: number;
    pairingCode?: string;
  }): Promise<Machine> => {
    const now = new Date().toISOString();

    if (useSupabase) {
      const existingRows = await sbRequest<any[]>(
        `machines?select=*&id=eq.${encodeURIComponent(data.id)}&limit=1`
      );
      const existing = existingRows?.[0];

      if (existing) {
        const rows = await sbRequest<any[]>(
          `machines?id=eq.${encodeURIComponent(data.id)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              name: data.name,
              os: data.os || existing.os,
              logged_in_user: data.loggedInUser || existing.logged_in_user,
              runner_version: data.runnerVersion || existing.runner_version,
              status: 'online',
              last_heartbeat: now,
              active_jobs_count: data.activeJobsCount ?? existing.active_jobs_count ?? 0,
              cpu_usage: data.cpuUsage ?? existing.cpu_usage ?? 0,
              ram_usage: data.ramUsage ?? existing.ram_usage ?? 0,
              total_ram_gb: data.totalRamGb ?? existing.total_ram_gb ?? 16,
              ip_address: data.ipAddress || existing.ip_address || '127.0.0.1',
              pairing_code:
                normalizePairingCode(data.pairingCode || '') ||
                existing.pairing_code ||
                generatePairingCode(),
            }),
          }
        );
        return fromMachineRow(rows[0]);
      }

      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const token = generateMachineToken();
        const pairingCode =
          normalizePairingCode(data.pairingCode || '') || generatePairingCode();
        try {
          const rows = await sbRequest<any[]>('machines', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              id: data.id,
              name: data.name,
              os: data.os || 'Windows',
              logged_in_user: data.loggedInUser || 'Operator',
              runner_version: data.runnerVersion || '2.0.0',
              status: 'online',
              last_heartbeat: now,
              active_jobs_count: data.activeJobsCount ?? 0,
              cpu_usage: data.cpuUsage ?? 0,
              ram_usage: data.ramUsage ?? 0,
              total_ram_gb: data.totalRamGb ?? 16,
              ip_address: data.ipAddress || '127.0.0.1',
              token,
              pairing_code: pairingCode,
            }),
          });
          return fromMachineRow(rows[0]);
        } catch (err) {
          lastError = err as Error;
          const message = (err as Error).message || '';
          if (!/duplicate|unique|conflict/i.test(message)) break;
        }
      }
      throw lastError || new Error('Machine registration failed');
    }

    const d = loadLocalDb();
    let machine = d.machines.find((m) => m.id === data.id);
    if (!machine) {
      machine = {
        id: data.id,
        name: data.name,
        os: data.os || 'Windows',
        loggedInUser: data.loggedInUser || 'Operator',
        runnerVersion: data.runnerVersion || '2.0.0',
        status: 'online',
        lastHeartbeat: now,
        activeJobsCount: 0,
        cpuUsage: 0,
        ramUsage: 0,
        totalRamGb: data.totalRamGb ?? 16,
        ipAddress: data.ipAddress || '127.0.0.1',
        token: generateMachineToken(),
        pairingCode: normalizePairingCode(data.pairingCode || '') || generatePairingCode(),
      };
      d.machines.push(machine);
    } else {
      machine.status = 'online';
      machine.lastHeartbeat = now;
      if (!machine.token) machine.token = generateMachineToken();
      if (data.pairingCode) machine.pairingCode = normalizePairingCode(data.pairingCode);
      if (!machine.pairingCode) machine.pairingCode = generatePairingCode();
      if (data.name) machine.name = data.name;
      if (data.os) machine.os = data.os;
      if (data.loggedInUser) machine.loggedInUser = data.loggedInUser;
      if (data.runnerVersion) machine.runnerVersion = data.runnerVersion;
      if (data.cpuUsage !== undefined) machine.cpuUsage = data.cpuUsage;
      if (data.ramUsage !== undefined) machine.ramUsage = data.ramUsage;
      if (data.totalRamGb !== undefined) machine.totalRamGb = data.totalRamGb;
      if (data.ipAddress) machine.ipAddress = data.ipAddress;
      if (data.activeJobsCount !== undefined) machine.activeJobsCount = data.activeJobsCount;
    }
    saveLocalDb(d);
    return machine;
  },

  // Users
  getUsers: async (): Promise<User[]> => {
    if (useSupabase) {
      await ensureCloudSeed();
      const rows = await sbRequest<any[]>('users?select=*&order=name.asc');
      return rows || [];
    }
    return loadLocalDb().users;
  },

  getUserByToken: async (token: string): Promise<User | undefined> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `users?select=*&token=eq.${encodeURIComponent(token)}&limit=1`
      );
      return rows?.[0];
    }
    return loadLocalDb().users.find((u) => u.token === token);
  },

  // Uploaded packages
  getUploadedPackages: async (): Promise<UploadedPackage[]> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        'uploaded_packages?select=*&order=uploaded_at.desc'
      );
      return (rows || []).map(fromUploadedPackageRow);
    }
    return loadLocalDb().uploadedPackages;
  },

  addUploadedPackage: async (pkg: UploadedPackage): Promise<void> => {
    if (useSupabase) {
      await sbRequest('uploaded_packages', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(toUploadedPackageRow(pkg)),
      });
      return;
    }
    const d = loadLocalDb();
    d.uploadedPackages.unshift(pkg);
    saveLocalDb(d);
  },
};
