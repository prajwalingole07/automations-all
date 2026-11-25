import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { INITIAL_AUTOMATIONS } from './registry';
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

const DEFAULT_USERS: User[] = [
  {
    id: 'usr_prajwal',
    name: 'Prajwal (Admin)',
    email: 'prajwal@automationhub.internal',
    role: 'admin',
    token: 'tok_admin_prajwal',
  },
  {
    id: 'usr_operator1',
    name: 'Admission Desk 1',
    email: 'operator1@automationhub.internal',
    role: 'user',
    token: 'tok_user_op1',
  },
  {
    id: 'usr_operator2',
    name: 'Admission Desk 2',
    email: 'operator2@automationhub.internal',
    role: 'user',
    token: 'tok_user_op2',
  },
];

function seedState(): DatabaseSchema {
  return {
    automations: [...INITIAL_AUTOMATIONS],
    jobs: [],
    logs: {},
    machines: [],
    users: [...DEFAULT_USERS],
    uploadedPackages: [],
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
      await sbRequest('users', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(DEFAULT_USERS),
      });
    }
  })().catch((err) => {
    cloudSeedPromise = null;
    throw err;
  });

  return cloudSeedPromise;
}

function toAutomationRow(a: Automation): any {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    category: a.category,
    original_zip: a.originalZip,
    package_dir: a.packageDir,
    entry_point: a.entryPoint,
    command_template: a.commandTemplate,
    language: a.language,
    dependencies: a.dependencies || [],
    required_inputs: a.requiredInputs || [],
    required_browser: a.requiredBrowser,
    execution_requirements: a.executionRequirements,
    status: a.status,
    version: a.version,
    last_updated: a.lastUpdated,
    requires_local_server: a.requiresLocalServer,
    default_port: a.defaultPort,
  };
}

function fromAutomationRow(r: any): Automation {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    originalZip: r.original_zip,
    packageDir: r.package_dir,
    entryPoint: r.entry_point,
    commandTemplate: r.command_template,
    language: r.language,
    dependencies: r.dependencies || [],
    requiredInputs: r.required_inputs || [],
    requiredBrowser: r.required_browser,
    executionRequirements: r.execution_requirements,
    status: r.status,
    version: r.version,
    lastUpdated: r.last_updated,
    requiresLocalServer: r.requires_local_server,
    defaultPort: r.default_port,
  };
}

function toJobRow(j: ExecutionJob): any {
  return {
    id: j.id,
    automation_id: j.automationId,
    automation_name: j.automationName,
    user_id: j.userId,
    user_name: j.userName,
    machine_id: j.machineId,
    machine_name: j.machineName,
    status: j.status,
    progress: j.progress,
    step: j.step,
    start_time: j.startTime,
    end_time: j.endTime,
    duration_seconds: j.durationSeconds,
    process_id: j.processId,
    allocated_port: j.allocatedPort,
    browser_tab_url: j.browserTabUrl,
    exit_code: j.exitCode,
    error_message: j.errorMessage,
    inputs: j.inputs || {},
    created_at: j.createdAt,
    cancel_requested: j.cancelRequested || false,
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
    progress: r.progress,
    step: r.step,
    startTime: r.start_time,
    endTime: r.end_time,
    durationSeconds: r.duration_seconds,
    processId: r.process_id,
    allocatedPort: r.allocated_port,
    browserTabUrl: r.browser_tab_url,
    exitCode: r.exit_code,
    errorMessage: r.error_message,
    inputs: r.inputs || {},
    createdAt: r.created_at,
    cancelRequested: r.cancel_requested,
  };
}

function toMachineRow(m: Machine): any {
  return {
    id: m.id,
    name: m.name,
    os: m.os,
    logged_in_user: m.loggedInUser,
    runner_version: m.runnerVersion,
    status: m.status,
    last_heartbeat: m.lastHeartbeat,
    active_jobs_count: m.activeJobsCount,
    cpu_usage: m.cpuUsage,
    ram_usage: m.ramUsage,
    total_ram_gb: m.totalRamGb,
    ip_address: m.ipAddress,
    token: m.token,
    pairing_code: m.pairingCode,
  };
}

function fromMachineRow(r: any): Machine {
  return withLiveStatus({
    id: r.id,
    name: r.name,
    os: r.os,
    loggedInUser: r.logged_in_user,
    runnerVersion: r.runner_version,
    status: r.status,
    lastHeartbeat: r.last_heartbeat,
    activeJobsCount: r.active_jobs_count || 0,
    cpuUsage: r.cpu_usage,
    ramUsage: r.ram_usage,
    totalRamGb: r.total_ram_gb,
    ipAddress: r.ip_address,
    token: r.token,
    pairingCode: r.pairing_code,
  });
}

function toUploadedPackageRow(p: UploadedPackage): any {
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
    fileSize: r.file_size,
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by,
    status: r.status,
    detectedLanguage: r.detected_language,
    entryPoint: r.entry_point,
    dependencies: r.dependencies || [],
    requiredBrowsers: r.required_browsers || [],
    portsFound: r.ports_found || [],
    scanReport: r.scan_report,
  };
}

function generateMachineToken(): string {
  return `runner_${crypto.randomBytes(24).toString('hex')}`;
}

function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function normalizePairingCode(code: string): string {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

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
      await sbRequest('automations', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(toAutomationRow(automation)),
      });
      return;
    }
    const d = loadLocalDb();
    const existing = d.automations.findIndex((a) => a.id === automation.id);
    if (existing >= 0) {
      d.automations[existing] = automation;
    } else {
      d.automations.push(automation);
    }
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
      const params = new URLSearchParams();
      params.set('select', '*');
      params.set('order', 'created_at.desc');
      if (filters?.machineId) params.set('machine_id', `eq.${filters.machineId}`);
      if (filters?.userId) params.set('user_id', `eq.${filters.userId}`);
      if (filters?.status) params.set('status', `eq.${filters.status}`);
      if (filters?.limit) params.set('limit', String(filters.limit));

      const rows = await sbRequest<any[]>(`jobs?${params.toString()}`);
      return (rows || []).map(fromJobRow);
    }

    const d = loadLocalDb();
    let jobs = [...d.jobs];
    if (filters?.machineId) jobs = jobs.filter((j) => j.machineId === filters.machineId);
    if (filters?.userId) jobs = jobs.filter((j) => j.userId === filters.userId);
    if (filters?.status) jobs = jobs.filter((j) => j.status === filters.status);
    jobs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (filters?.limit) jobs = jobs.slice(0, filters.limit);
    return jobs;
  },

  getJob: async (id: string): Promise<ExecutionJob | undefined> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `jobs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`
      );
      return rows?.[0] ? fromJobRow(rows[0]) : undefined;
    }
    return loadLocalDb().jobs.find((j) => j.id === id);
  },

  createJob: async (job: ExecutionJob): Promise<void> => {
    if (useSupabase) {
      await sbRequest('jobs', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(toJobRow(job)),
      });
      return;
    }
    const d = loadLocalDb();
    d.jobs.unshift(job);
    d.logs[job.id] = [];
    saveLocalDb(d);
  },

  updateJob: async (
    id: string,
    updates: Partial<ExecutionJob>
  ): Promise<ExecutionJob | undefined> => {
    if (useSupabase) {
      const payload: Record<string, any> = {};
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.progress !== undefined) payload.progress = updates.progress;
      if (updates.step !== undefined) payload.step = updates.step;
      if (updates.endTime !== undefined) payload.end_time = updates.endTime;
      if (updates.durationSeconds !== undefined)
        payload.duration_seconds = updates.durationSeconds;
      if (updates.processId !== undefined) payload.process_id = updates.processId;
      if (updates.allocatedPort !== undefined)
        payload.allocated_port = updates.allocatedPort;
      if (updates.browserTabUrl !== undefined)
        payload.browser_tab_url = updates.browserTabUrl;
      if (updates.exitCode !== undefined) payload.exit_code = updates.exitCode;
      if (updates.errorMessage !== undefined)
        payload.error_message = updates.errorMessage;
      if (updates.inputs !== undefined) payload.inputs = updates.inputs;
      if (updates.cancelRequested !== undefined)
        payload.cancel_requested = updates.cancelRequested;

      const rows = await sbRequest<any[]>(
        `jobs?id=eq.${encodeURIComponent(id)}&select=*`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(payload),
        }
      );
      return rows?.[0] ? fromJobRow(rows[0]) : undefined;
    }

    const d = loadLocalDb();
    const idx = d.jobs.findIndex((j) => j.id === id);
    if (idx === -1) return undefined;
    d.jobs[idx] = { ...d.jobs[idx], ...updates };
    saveLocalDb(d);
    return d.jobs[idx];
  },

  // Logs
  getJobLogs: async (jobId: string): Promise<ExecutionLog[]> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `logs?job_id=eq.${encodeURIComponent(jobId)}&select=*&order=timestamp.asc`
      );
      return (rows || []).map((r) => ({
        id: r.id,
        jobId: r.job_id,
        timestamp: r.timestamp,
        level: r.level,
        message: r.message,
      }));
    }
    return loadLocalDb().logs[jobId] || [];
  },

  addJobLog: async (jobId: string, log: ExecutionLog): Promise<void> => {
    if (useSupabase) {
      await sbRequest('logs', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          id: log.id,
          job_id: jobId,
          timestamp: log.timestamp,
          level: log.level,
          message: log.message,
        }),
      });
      return;
    }
    const d = loadLocalDb();
    if (!d.logs[jobId]) d.logs[jobId] = [];
    d.logs[jobId].push(log);
    if (d.logs[jobId].length > 500) {
      d.logs[jobId] = d.logs[jobId].slice(-500);
    }
    saveLocalDb(d);
  },

  // Machines
  getMachines: async (): Promise<Machine[]> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>('machines?select=*&order=name.asc');
      return (rows || []).map(fromMachineRow);
    }
    return loadLocalDb().machines.map(withLiveStatus);
  },

  getMachine: async (id: string): Promise<Machine | undefined> => {
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `machines?select=*&id=eq.${encodeURIComponent(id)}&limit=1`
      );
      return rows?.[0] ? fromMachineRow(rows[0]) : undefined;
    }
    const m = loadLocalDb().machines.find((x) => x.id === id);
    return m ? withLiveStatus(m) : undefined;
  },

  getMachineByPairingCode: async (code: string): Promise<Machine | undefined> => {
    const clean = normalizePairingCode(code);
    if (!clean) return undefined;
    if (useSupabase) {
      const rows = await sbRequest<any[]>(
        `machines?select=*&pairing_code=eq.${encodeURIComponent(clean)}&limit=1`
      );
      return rows?.[0] ? fromMachineRow(rows[0]) : undefined;
    }
    const m = loadLocalDb().machines.find(
      (x) => normalizePairingCode(x.pairingCode || '') === clean
    );
    return m ? withLiveStatus(m) : undefined;
  },

  upsertMachineHeartbeat: async (data: {
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
          `machines?id=eq.${encodeURIComponent(data.id)}&select=*`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              name: data.name || existing.name,
              os: data.os || existing.os || 'Windows',
              logged_in_user: data.loggedInUser || existing.logged_in_user || 'Operator',
              runner_version: data.runnerVersion || existing.runner_version || '2.0.0',
              status: 'online',
              last_heartbeat: now,
              active_jobs_count: data.activeJobsCount ?? existing.active_jobs_count ?? 0,
              cpu_usage: data.cpuUsage ?? 0,
              ram_usage: data.ramUsage ?? 0,
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
