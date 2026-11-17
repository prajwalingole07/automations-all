import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const users = await db.getUsers();
    // Never expose operator tokens; they are only used server-side.
    const safe = users.map(({ token, ...rest }) => rest);
    return NextResponse.json({ success: true, total: safe.length, users: safe });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
