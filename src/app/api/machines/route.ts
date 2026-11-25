import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Machine } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let machines = await db.getMachines();
    
    // Seed Render Cloud Engine if no machine exists yet
    if (!machines || machines.length === 0) {
      const defaultMachine = await db.registerOrHeartbeatMachine({
        id: 'mach_render_cloud',
        name: 'Render Cloud Engine',
        os: 'Linux (Render Container)',
        loggedInUser: 'root',
        runnerVersion: '2.0.0',
        ipAddress: '127.0.0.1',
        pairingCode: 'RENDER01',
      }).catch(() => null);

      if (defaultMachine) {
        machines = [defaultMachine];
      }
    }

    const safe = machines.map(({ token, ...rest }) => rest);
    return NextResponse.json({
      success: true,
      total: safe.length,
      machines: safe,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
