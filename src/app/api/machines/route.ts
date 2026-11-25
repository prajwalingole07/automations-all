import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const machines = await db.getMachines();
    // Never expose control tokens or pairing codes to unauthenticated callers.
    const safe = machines.map(({ token, pairingCode, ...rest }) => rest);
    return NextResponse.json({
      success: true,
      total: safe.length,
      machines: safe,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
