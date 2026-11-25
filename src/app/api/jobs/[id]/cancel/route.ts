import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateMachine } from '@/lib/runnerAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateMachine(request);
    if (auth.error || !auth.machine) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Runner authentication failed' },
        { status: auth.status || 401 }
      );
    }

    const job = await db.getJob(params.id);
    if (!job) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }
    if (job.machineId !== auth.machine.id) {
      return NextResponse.json(
        { success: false, error: 'You can only control jobs running on your own PC' },
        { status: 403 }
      );
    }
    if (['Completed', 'Failed', 'Cancelled', 'Disconnected'].includes(job.status)) {
      return NextResponse.json(
        { success: false, error: `Job is already ${job.status}` },
        { status: 400 }
      );
    }

    const updatedJob = await db.requestCancel(params.id);
    return NextResponse.json({
      success: true,
      message:
        job.status === 'Queued'
          ? 'Queued job cancelled before it started.'
          : 'Cancellation sent. The runner on this PC will stop the process within a few seconds.',
      job: updatedJob,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
