import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requestIp } from '@/lib/runnerAuth';

export const dynamic = 'force-dynamic';

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

export async function POST(request: Request) {
  try {
    if (process.env.DISABLE_PAIRING === '1') {
      return NextResponse.json(
        { success: false, error: 'Manual pairing is disabled by the administrator.' },
        { status: 403 }
      );
    }

    const ip = requestIp(request);
    if (rateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many pairing attempts. Wait a minute and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const code = String(body.code || '').trim();
    if (!code) {
      return NextResponse.json({ success: false, error: 'Pairing code is required' }, { status: 400 });
    }

    const machine = await db.getMachineByPairingCode(code);
    if (!machine) {
      return NextResponse.json(
        { success: false, error: 'Pairing code not recognised. Check the code printed by START_AUTOMATION_HUB.bat.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      machine: {
        id: machine.id,
        name: machine.name,
        os: machine.os,
        status: machine.status,
        lastHeartbeat: machine.lastHeartbeat,
      },
      token: machine.token,
      message: `Paired with ${machine.name}. Jobs will run only on that PC.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
