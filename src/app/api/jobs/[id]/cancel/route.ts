import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const job = await db.getJob(params.id);
    if (!job) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    if (['Completed', 'Failed', 'Cancelled', 'Disconnected'].includes(job.status)) {
      return NextResponse.json(
        { success: false, error: `Job is already ${job.status}` },
        { status: 400 }
      );
    }

    // Set cancelRequested and update job status
    const updatedJob = await db.requestCancel(params.id);
    await db.addLogs(params.id, [
      {
        level: 'warn',
        message: 'Stop command initiated by operator. Terminating process tree and releasing port.',
      },
    ]);

    // If job was still Queued, immediately set to Cancelled
    if (job.status === 'Queued') {
      await db.updateJob(params.id, {
        status: 'Cancelled',
        step: 'Stopped by operator before starting',
        endTime: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Automation stopped. Process terminated and port freed.',
      job: updatedJob,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
