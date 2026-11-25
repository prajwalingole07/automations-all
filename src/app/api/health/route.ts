import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { expectedRunnerSecret, isServerlessRuntime } from '@/lib/runnerAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = {
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    platform: 'NEXUS Automation Hub',
    execution: 'local-runner',
    persistence: db.storageMode,
    environment: isServerlessRuntime() ? 'vercel' : process.env.NODE_ENV || 'production',
    runnerSecretConfigured: Boolean(expectedRunnerSecret()),
    pairingEnabled: process.env.DISABLE_PAIRING !== '1',
  };

  try {
    const [automations, machines, jobs] = await Promise.all([
      db.getAutomations(),
      db.getMachines(),
      db.getJobs({ limit: 500 }),
    ]);

    return NextResponse.json({
      status: 'healthy',
      ...base,
      counts: {
        automations: automations.length,
        machines: machines.length,
        onlineMachines: machines.filter((m) => m.status === 'online').length,
        activeJobs: jobs.filter((j) => ['Starting', 'Running', 'Queued'].includes(j.status)).length,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'degraded',
        ...base,
        error: err.message,
      },
      { status: 200 }
    );
  }
}
