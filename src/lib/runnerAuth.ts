import crypto from 'crypto';
import { db } from './db';
import { Machine } from './types';

export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.CF_PAGES
  );
}

/**
 * Shared secret used only while a runner registers itself / sends heartbeats.
 * The browser dashboard never sees this value. After registration each machine
 * receives its own long-lived token, used for poll/claim/update/cancel.
 */
export function expectedRunnerSecret(): string | null {
  if (process.env.RUNNER_SECRET_TOKEN) return process.env.RUNNER_SECRET_TOKEN;
  // Zero-config build: Vercel Drop deployments work without any environment
  // variables, using the same default the Windows launcher offers. Override it
  // by setting RUNNER_SECRET_TOKEN in Vercel Project Settings.
  return 'local-dev-runner';
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function headerValue(request: Request, name: string): string {
  return request.headers.get(name) || '';
}

export function runnerSecretFromRequest(request: Request): string {
  return (
    headerValue(request, 'x-runner-token') ||
    headerValue(request, 'x-runner-secret') ||
    ''
  );
}

export function verifyRunnerSecret(request: Request): {
  ok: boolean;
  error?: string;
  status?: number;
} {
  const expected = expectedRunnerSecret();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error:
        'RUNNER_SECRET_TOKEN is not configured on the cloud dashboard. Add it in Vercel Project Settings → Environment Variables, then redeploy.',
    };
  }
  const provided = runnerSecretFromRequest(request);
  if (!provided || !safeEqual(provided, expected)) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid runner registration secret. Re-run START_AUTOMATION_HUB.bat and enter the same token configured on Vercel.',
    };
  }
  return { ok: true };
}

export function machineCredentialsFromRequest(request: Request): {
  machineId: string;
  token: string;
} {
  return {
    machineId:
      headerValue(request, 'x-machine-id') ||
      new URL(request.url).searchParams.get('machineId') ||
      '',
    token:
      headerValue(request, 'x-machine-token') ||
      headerValue(request, 'x-runner-token') ||
      '',
  };
}

export async function authenticateMachine(
  request: Request
): Promise<{ machine?: Machine; error?: string; status?: number }> {
  const { machineId, token } = machineCredentialsFromRequest(request);
  if (!machineId) {
    return { error: 'Missing machine identity. Open the dashboard from the PC that runs the automation.', status: 401 };
  }
  const machine = await db.getMachine(machineId);
  if (!machine) {
    return {
      error:
        'This PC is not registered on the cloud dashboard. Start START_AUTOMATION_HUB.bat in Cloud mode on this PC.',
      status: 401,
    };
  }
  if (!token || !safeEqual(token, machine.token)) {
    return {
      error: 'Machine token is invalid. Reconnect this PC (runner identity changed or was reset).',
      status: 401,
    };
  }
  if (machine.status !== 'online') {
    return {
      error: `Runner "${machine.name}" is offline. Keep START_AUTOMATION_HUB.bat open on this PC.`,
      status: 409,
    };
  }
  return { machine };
}

export function requestIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
