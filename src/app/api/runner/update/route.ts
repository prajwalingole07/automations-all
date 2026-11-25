import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateMachine } from '@/lib/runnerAuth';

export const dynamic = 'force-dynamic';

const TERMINAL = ['Completed', 'Failed', 'Cancelled', 'Disconnected'];
const ALLOWED_STATUS = [
  'Starting',
  'Running',
  'Paused',
  'Completed',
  'Failed',
  'Cancelled',
  'Disconnected',
];

export async function POST(request: Request) {
  try {
    const auth = await authenticateMachine(request);
    if (auth.error || !auth.machine) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Runner authentication failed' },
        { status: auth.status || 401 }
      );
    }
    const machine = auth.machine;

    const body = await request.json();
    const { jobId, status, progress, step, processId, allocatedPort, browserTabUrl, logs, exitCode, errorMessage, endTime } =
      body || {};

    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId is required' }, { status: 400 });
    }

    const job = await db.getJob(String(jobId));
    if (!job) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }
    if (job.machineId !== machine.id) {
      return NextResponse.json(
        { success: false, error: 'This job belongs to a different PC; refusing cross-machine update' },
        { status: 403 }
      );
    }

    const logEntries = Array.isArray(logs)
      ? logs
          .filter((l: any) => l && l.message)
          .slice(0, 400)
          .map((l: any) => ({
            level: ['info', 'warn', 'error', 'success', 'step'].includes(l.level)
              ? l.level
              : 'info',
            message: String(l.message).slice(0, 8000),
            timestamp: l.timestamp || new Date().toISOString(),
          }))
      : [];

    // A late callback can never overwrite a terminal state (e.g. Cancelled → Completed).
    if (TERMINAL.includes(job.status)) {
      if (logEntries.length) await db.addLogs(job.id, logEntries);
      return NextResponse.json({ success: true, job, ignored: true });
    }

    const updates: Record<string, any> = {};
    let nextStatus = status && ALLOWED_STATUS.includes(status) ? status : undefined;

    if (nextStatus === 'Completed' && job.cancelRequested) {
      nextStatus = 'Cancelled';
    }
    if (nextStatus) {
      updates.status = nextStatus;
      if (TERMINAL.includes(nextStatus)) {
        updates.cancelRequested = false;
        updates.endTime = endTime || new Date().toISOString();
      }
    }
    if (progress !== undefined) {
      const value = Number(progress);
      if (Number.isFinite(value)) updates.progress = Math.max(0, Math.min(100, Math.round(value)));
    }
    if (step !== undefined) updates.step = String(step).slice(0, 400);
    if (processId !== undefined) updates.processId = Number(processId) || undefined;
    if (allocatedPort !== undefined) updates.allocatedPort = Number(allocatedPort) || undefined;
    if (browserTabUrl !== undefined) updates.browserTabUrl = String(browserTabUrl);
    if (exitCode !== undefined) updates.exitCode = Number(exitCode);
    if (errorMessage !== undefined) updates.errorMessage = String(errorMessage).slice(0, 4000);
    if (endTime !== undefined && !updates.endTime) updates.endTime = endTime;

    const updatedJob = await db.updateJob(job.id, updates);
    if (logEntries.length) await db.addLogs(job.id, logEntries);

    return NextResponse.json({ success: true, job: updatedJob });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
