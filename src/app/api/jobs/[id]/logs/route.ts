import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');
    const logs = await db.getLogs(params.id);
    const filtered = since
      ? logs.filter((log) => new Date(log.timestamp).getTime() > new Date(since).getTime())
      : logs;

    return NextResponse.json({
      success: true,
      total: filtered.length,
      logs: filtered,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
