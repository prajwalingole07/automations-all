import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateMachine } from '@/lib/runnerAuth';
import { ExecutionJob } from '@/lib/types';

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
    const machine = auth.machine;

    const automation = await db.getAutomation(params.id);
    if (!automation) {
      return NextResponse.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const rawInputs = (body.inputs || {}) as Record<string, any>;
    const inputs: Record<string, any> = { ...rawInputs };

    for (const input of automation.requiredInputs || []) {
      if (inputs[input.name] === undefined && input.defaultValue !== undefined) {
        inputs[input.name] = input.defaultValue;
      }
      if (
        input.required &&
        input.type !== 'file' &&
        (inputs[input.name] === undefined || inputs[input.name] === '')
      ) {
        return NextResponse.json(
          { success: false, error: `Missing required input: ${input.label}` },
          { status: 400 }
        );
      }
    }

    const users = await db.getUsers().catch(() => []);
    const user =
      users.find((u) => u.id === body.userId) ||
      users[0] || {
        id: 'usr_operator',
        name: body.userName || 'Operator',
        email: 'operator@local',
        role: 'user' as const,
        token: '',
      };

    const now = new Date().toISOString();
    const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const newJob: ExecutionJob = {
      id: jobId,
      automationId: automation.id,
      automationName: automation.name,
      userId: user.id,
      userName: user.name,
      machineId: machine.id,
      machineName: machine.name,
      status: 'Queued',
      progress: 0,
      step: `Queued for ${machine.name} — waiting for the runner on this PC`,
      startTime: now,
      inputs,
      createdAt: now,
      cancelRequested: false,
    };

    await db.createJob(newJob);
    await db.addLogs(jobId, [
      {
        level: 'info',
        message: `Job initiated for "${automation.name}" by ${user.name}`,
      },
      {
        level: 'info',
        message: `Pinned to this PC only: ${machine.name} (${machine.id}). No other PC can claim it.`,
      },
      {
        level: 'step',
        message: `Runner will allocate a free local port on ${machine.name} and open the workflow in Chrome.`,
      },
    ]);

    return NextResponse.json({
      success: true,
      message: 'Job queued on this PC. The local runner will pick it up within a few seconds.',
      job: newJob,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
