import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyRunnerSecret } from '@/lib/runnerAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const secretCheck = verifyRunnerSecret(request);
    if (!secretCheck.ok) {
      return NextResponse.json(
        { success: false, error: secretCheck.error },
        { status: secretCheck.status || 401 }
      );
    }

    const body = await request.json();
    if (!body.id || !body.name) {
      return NextResponse.json({ success: false, error: 'id and name are required' }, { status: 400 });
    }

    const machine = await db.registerOrHeartbeatMachine({
      id: String(body.id),
      name: String(body.name),
      os: body.os,
      loggedInUser: body.loggedInUser,
      runnerVersion: body.runnerVersion,
      cpuUsage: body.cpuUsage,
      ramUsage: body.ramUsage,
      totalRamGb: body.totalRamGb,
      ipAddress: body.ipAddress,
      activeJobsCount: body.activeJobsCount,
      pairingCode: body.pairingCode,
    });

    return NextResponse.json({
      success: true,
      machine,
      // This response is authenticated with the shared runner secret, so it is
      // safe to return the machine-scoped control token here. It is stored only
      // on the runner PC and in the dashboard's local identity probe.
      token: machine.token,
      pairingCode: machine.pairingCode,
      cloudUrl: process.env.NEXT_PUBLIC_APP_URL || undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
