import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const automation = await db.getAutomation(params.id);
    if (!automation) {
      return NextResponse.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId') || undefined;
    const jobs = await db.getJobs({ machineId });
    const recentJobs = jobs.filter((j) => j.automationId === params.id).slice(0, 12);

    return NextResponse.json({
      success: true,
      automation,
      recentJobs,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
