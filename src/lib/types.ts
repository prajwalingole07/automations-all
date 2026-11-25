export type AutomationStatus = 'ready' | 'running' | 'disabled' | 'error';

export interface RequiredInput {
  name: string;
  label: string;
  type: 'text' | 'number' | 'file' | 'select' | 'boolean' | 'date';
  required: boolean;
  defaultValue?: string | number | boolean;
  options?: string[];
  description?: string;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  category: 'Engineering Admissions' | 'Data Extraction' | 'Choice Filling' | 'Alerts & Monitoring' | 'Document Processing' | 'General';
  originalZip: string;
  entryPoint: string;
  commandTemplate: string;
  language: 'TypeScript/Node.js' | 'Python' | 'Batch/CLI' | 'Hybrid';
  dependencies: string[];
  requiredInputs: RequiredInput[];
  requiredBrowser: 'Chrome/Chromium' | 'Microsoft Edge' | 'Playwright Headless/Headed' | 'None';
  executionRequirements: string;
  status: AutomationStatus;
  version: string;
  lastUpdated: string;
  requiresLocalServer: boolean;
  defaultPort?: number;
  packageDir: string;
}

export type JobStatus = 
  | 'Waiting'
  | 'Queued'
  | 'Starting'
  | 'Running'
  | 'Paused'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | 'Disconnected';

export interface ExecutionJob {
  id: string;
  automationId: string;
  automationName: string;
  userId: string;
  userName: string;
  machineId: string;
  machineName: string;
  status: JobStatus;
  progress: number; // 0 - 100, only when measurable
  step: string;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
  processId?: number;
  allocatedPort?: number;
  browserTabUrl?: string;
  exitCode?: number;
  errorMessage?: string;
  inputs: Record<string, any>;
  createdAt: string;
  cancelRequested?: boolean;
}

export interface ExecutionLog {
  id: string;
  jobId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'step';
  message: string;
}

export interface Machine {
  id: string;
  name: string;
  os: string;
  loggedInUser: string;
  runnerVersion: string;
  status: 'online' | 'offline';
  lastHeartbeat: string;
  activeJobsCount: number;
  cpuUsage?: number;
  ramUsage?: number;
  totalRamGb?: number;
  ipAddress?: string;
  token: string;
  pairingCode?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  token: string;
}

export interface UploadedPackage {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  status: 'pending_review' | 'approved' | 'rejected';
  detectedLanguage: string;
  entryPoint: string;
  dependencies: string[];
  requiredBrowsers: string[];
  portsFound: number[];
  scanReport: {
    safe: boolean;
    issues: string[];
    fileCount: number;
  };
}
