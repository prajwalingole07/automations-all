import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateMachine } from '@/lib/runnerAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await authenticateMachine(request);
    if (auth.error || !auth.machine) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Runner authentication failed' },
        { status: auth.status || 401 }
      );
    }
    const machine = auth.machine;

    const { searchParams } = new URL(request.url);
    const capacity = Math.max(
      1,
      Math.min(12, Number(searchParams.get('capacity') || 4) || 4)
    );
    const activeCount = Math.max(
      0,
      Math.min(capacity, Number(searchParams.get('activeCount') || 0) || 0)
    );
    const free = Math.max(0, capacity - activeCount);

    const pendingJobs = free > 0 ? await db.getQueuedJobsForMachine(machine.id, free) : [];
    const cancelJobIds = await db.getCancelJobIds(machine.id);

    return NextResponse.json({
      success: true,
      machineId: machine.id,
      machineName: machine.name,
      serverTime: new Date().toISOString(),
      pendingJobs,
      cancelJobIds,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
