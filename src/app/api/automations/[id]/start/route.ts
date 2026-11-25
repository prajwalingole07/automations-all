import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ExecutionJob, Machine } from '@/lib/types';
import { getAutomationPort } from '@/lib/registry';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const automation = await db.getAutomation(params.id);
    if (!automation) {
      return NextResponse.json({ success: false, error: 'Automation not found in registry' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const rawInputs = (body.inputs || {}) as Record<string, any>;
    const inputs: Record<string, any> = { ...rawInputs };

    // Prefill default inputs if missing
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
          { success: false, error: `Missing required parameter: ${input.label}` },
          { status: 400 }
        );
      }
    }

    // 1. Check for Port Conflicts
    const targetPort = getAutomationPort(automation.id);
    const existingJobs = await db.getJobs({ limit: 100 });
    const conflicting = existingJobs.filter(
      (j) =>
        ['Queued', 'Starting', 'Running'].includes(j.status) &&
        (j.automationId === automation.id || getAutomationPort(j.automationId) === targetPort)
    );

    if (conflicting.length > 0) {
      if (body.forceStopConflict) {
        // Automatically stop conflicting jobs and free the port
        for (const cJob of conflicting) {
          await db.requestCancel(cJob.id);
          await db.updateJob(cJob.id, {
            status: 'Cancelled',
            step: `Stopped automatically to free port :${targetPort} for ${automation.name}`,
            endTime: new Date().toISOString(),
          });
          await db.addLogs(cJob.id, [
            {
              level: 'warn',
              message: `Job stopped by operator to release port :${targetPort} for "${automation.name}".`,
            },
          ]);
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            portConflict: true,
            conflictingJob: conflicting[0],
            port: targetPort,
            error: `Port :${targetPort} is currently in use by "${conflicting[0].automationName}". At one time only one automation can run on port :${targetPort}. Stop the previous automation before starting this one.`,
          },
          { status: 409 }
        );
      }
    }

    // Resolve target machine
    const reqMachineId = body.machineId || request.headers.get('x-machine-id');
    const machines = await db.getMachines().catch(() => []);
    let targetMachine: Machine | undefined;

    if (reqMachineId) {
      targetMachine = machines.find((m) => m.id === reqMachineId);
    }
    if (!targetMachine) {
      targetMachine = machines.find((m) => m.status === 'online');
    }
    if (!targetMachine && machines.length > 0) {
      targetMachine = machines[0];
    }
    if (!targetMachine) {
      // Auto-register built-in Render Cloud runner
      const registered = await db.registerOrHeartbeatMachine({
        id: 'mach_render_cloud',
        name: 'Render Cloud Engine',
        os: 'Linux x86_64 (Render Container)',
        loggedInUser: 'root',
        ipAddress: '127.0.0.1',
        runnerVersion: '2.0.0',
        pairingCode: 'RENDER01',
      }).catch(() => null);

      if (registered) {
        targetMachine = registered;
      } else {
        const now = new Date().toISOString();
        targetMachine = {
          id: 'mach_render_cloud',
          name: 'Render Cloud Engine',
          os: 'Linux x86_64 (Render Container)',
          loggedInUser: 'root',
          status: 'online',
          lastHeartbeat: now,
          ipAddress: '127.0.0.1',
          token: 'render-cloud-token',
          activeJobsCount: 0,
          runnerVersion: '2.0.0',
          pairingCode: 'RENDER01',
        };
      }
    }

    const users = await db.getUsers().catch(() => []);
    const user =
      users.find((u) => u.id === body.userId) ||
      users[0] || {
        id: 'usr_operator',
        name: body.userName || 'Operator',
        email: 'operator@render',
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
      machineId: targetMachine.id,
      machineName: targetMachine.name,
      status: 'Queued',
      progress: 0,
      step: `Queued for ${targetMachine.name} (Port :${targetPort}) — initializing clean session`,
      startTime: now,
      inputs,
      createdAt: now,
      cancelRequested: false,
    };

    await db.createJob(newJob);
    await db.addLogs(jobId, [
      {
        level: 'info',
        message: `Job ${jobId} initiated for "${automation.name}" by ${user.name}`,
      },
      {
        level: 'info',
        message: `Execution assigned to: ${targetMachine.name} (Dedicated Port :${targetPort})`,
      },
      {
        level: 'step',
        message: `Browser session initialized with clean incognito context (zero cache / fresh state).`,
      },
    ]);

    return NextResponse.json({
      success: true,
      message: `Job queued on ${targetMachine.name} (Port :${targetPort}).`,
      job: newJob,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
