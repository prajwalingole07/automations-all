import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateMachine } from '@/lib/runnerAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await authenticateMachine(request);
    if (auth.error || !auth.machine) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Runner authentication failed' },
        { status: auth.status || 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!body.jobId) {
      return NextResponse.json({ success: false, error: 'jobId is required' }, { status: 400 });
    }

    const job = await db.claimJob(String(body.jobId), auth.machine.id);
    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: 'Job is no longer queued or is pinned to a different PC',
        },
        { status: 409 }
      );
    }

    const automation = await db.getAutomation(job.automationId);
    if (!automation) {
      await db.updateJob(job.id, {
        status: 'Failed',
        step: 'Automation definition missing from cloud registry',
        errorMessage: 'Automation not found in registry',
        endTime: new Date().toISOString(),
      });
      return NextResponse.json(
        { success: false, error: 'Automation definition missing from cloud registry' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, job, automation });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
