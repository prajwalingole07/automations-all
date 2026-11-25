"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Cpu,
  HardDrive,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { ExecutionJob, Machine } from "@/lib/types";
import { useRunner } from "@/components/runner-context";
import RunnerGate from "@/components/RunnerGate";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Progress,
  SectionTitle,
  StatusBadge,
  cn,
} from "@/components/ui";
import { formatRelative } from "@/lib/format";

export default function MachinesPage() {
  const { runner, refresh: refreshRunner } = useRunner();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [machinesRes, jobsRes] = await Promise.all([
        fetch("/api/machines", { cache: "no-store" }),
        fetch("/api/jobs?limit=300", { cache: "no-store" }),
      ]);
      const machinesData = await machinesRes.json();
      const jobsData = await jobsRes.json();
      if (machinesData.machines) setMachines(machinesData.machines);
      if (jobsData.jobs) setJobs(jobsData.jobs);
    } catch {
      /* keep last state */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const activeByMachine = useMemo(() => {
    const map = new Map<string, ExecutionJob[]>();
    for (const job of jobs) {
      if (!["Queued", "Starting", "Running"].includes(job.status)) continue;
      const list = map.get(job.machineId) || [];
      list.push(job);
      map.set(job.machineId, list);
    }
    return map;
  }, [jobs]);

  const online = machines.filter((machine) => machine.status === "online").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations · fleet"
        title="Runner fleet"
        description="Every PC that has connected to this control plane. Each machine has its own identity, token, job queue and local execution environment."
        actions={
          <>
            <button
              onClick={() => {
                load();
                refreshRunner();
              }}
              className="btn btn-ghost"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <Link href="/settings" className="btn btn-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Connect a PC
            </Link>
          </>
        }
      />

      <RunnerGate compact />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Registered", machines.length],
          ["Online", online],
          ["This PC", runner?.machineName || "not bound"],
          ["Active jobs", [...activeByMachine.values()].reduce((sum, list) => sum + list.length, 0)],
        ].map(([label, value]) => (
          <Panel key={String(label)} className="p-3.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {label}
            </div>
            <div className="mt-1 truncate text-lg font-bold text-white">{value}</div>
          </Panel>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="panel h-72 animate-pulse" />
          ))}
        </div>
      ) : machines.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="No runner has registered yet"
          description="Start START_AUTOMATION_HUB.bat on a Windows PC and choose Cloud dashboard + local runner. The PC appears here within a few seconds."
          action={
            <Link href="/settings" className="btn btn-primary">
              <Terminal className="h-3.5 w-3.5" /> Setup instructions
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {machines.map((machine) => {
            const isOnline = machine.status === "online";
            const isThisPc = runner?.machineId === machine.id;
            const activeJobs = activeByMachine.get(machine.id) || [];
            return (
              <Panel key={machine.id} className={cn("p-4", !isOnline && "opacity-75")}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-800/60 pb-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl border",
                        isOnline
                          ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
                          : "border-slate-800 bg-slate-900/60 text-slate-500"
                      )}
                    >
                      <MonitorSmartphone className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-white">{machine.name}</h3>
                        {isThisPc && <Badge tone="mint">this PC</Badge>}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[9px] text-slate-500">
                        {machine.id}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={machine.status} />
                </div>

                <div className="grid grid-cols-2 gap-3 border-b border-slate-800/60 py-3 text-[10px]">
                  <div className="min-w-0">
                    <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">OS</div>
                    <div className="truncate text-slate-300">{machine.os}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">Operator</div>
                    <div className="truncate text-slate-300">{machine.loggedInUser}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">Runner</div>
                    <div className="truncate font-mono text-cyan-300">v{machine.runnerVersion}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">Heartbeat</div>
                    <div className="truncate text-slate-300">{formatRelative(machine.lastHeartbeat)}</div>
                  </div>
                </div>

                <div className="space-y-3 border-b border-slate-800/60 py-3">
                  <div>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="flex items-center gap-1 text-slate-500">
                        <Cpu className="h-3 w-3 text-indigo-300" /> CPU
                      </span>
                      <span className="font-mono text-slate-300">{machine.cpuUsage ?? 0}%</span>
                    </div>
                    <div className="mt-1">
                      <Progress value={machine.cpuUsage || 0} tone="iris" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="flex items-center gap-1 text-slate-500">
                        <HardDrive className="h-3 w-3 text-cyan-300" /> RAM ({machine.totalRamGb || 16} GB)
                      </span>
                      <span className="font-mono text-slate-300">{machine.ramUsage ?? 0}%</span>
                    </div>
                    <div className="mt-1">
                      <Progress value={machine.ramUsage || 0} tone="aqua" />
                    </div>
                  </div>
                </div>

                <div className="pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-300">
                      <Activity className="h-3.5 w-3.5 text-emerald-300" /> Active on this PC
                    </span>
                    <span className="font-mono text-[9px] text-slate-500">
                      {activeJobs.length} / {machine.activeJobsCount ?? 0} reported
                    </span>
                  </div>
                  {activeJobs.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-800 px-3 py-3 text-center text-[10px] text-slate-600">
                      Idle
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {activeJobs.slice(0, 3).map((job) => (
                        <Link
                          key={job.id}
                          href={`/live?jobId=${job.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 transition hover:border-cyan-400/20"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[10.5px] font-medium text-slate-200">
                              {job.automationName}
                            </div>
                            <div className="truncate text-[9px] text-slate-500">{job.step}</div>
                          </div>
                          <StatusBadge status={job.status} />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Panel className="p-4">
        <SectionTitle title="How PC isolation works" />
        <div className="grid gap-3 md:grid-cols-3">
          {[
            [
              "1 · Pair the browser",
              "The dashboard probes 127.0.0.1 for the runner on the PC it is open on. Each browser tab binds to that PC only.",
            ],
            [
              "2 · Pin every job",
              "A job is stored with the target machineId. No other runner can claim it, even if it is online.",
            ],
            [
              "3 · Execute locally",
              "That PC allocates its own free port, starts the process, opens Chrome, and streams logs back.",
            ],
          ].map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
              <div className="text-[10px] font-semibold text-cyan-200">{title}</div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
