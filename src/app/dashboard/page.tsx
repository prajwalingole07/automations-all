"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Cpu,
  Layers,
  MonitorSmartphone,
  Play,
  Radio,
  ShieldCheck,
  Terminal,
  Timer,
  Zap,
} from "lucide-react";
import { Automation, ExecutionJob } from "@/lib/types";
import { useRunner } from "@/components/runner-context";
import RunnerGate from "@/components/RunnerGate";
import {
  Badge,
  CategoryIcon,
  EmptyState,
  PageHeader,
  Panel,
  Progress,
  SectionTitle,
  Spinner,
  StatCard,
  StatusBadge,
  cn,
} from "@/components/ui";
import { formatDuration, formatRelative, formatTime } from "@/lib/format";

interface LogLine {
  id: string;
  level: string;
  message: string;
  timestamp: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { runner, startJob, status: runnerStatus, cloudMismatch } = useRunner();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const machineId = runner?.machineId;

  useEffect(() => {
    let alive = true;
    const loadAutomations = async () => {
      try {
        const res = await fetch("/api/automations", { cache: "no-store" });
        const data = await res.json();
        if (alive && data.automations) setAutomations(data.automations);
      } catch {
        /* ignore */
      } finally {
        if (alive) setLoading(false);
      }
    };
    loadAutomations();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadMachines = async () => {
      try {
        const res = await fetch("/api/machines", { cache: "no-store" });
        const data = await res.json();
        if (alive && data.machines) setMachines(data.machines);
      } catch {}
    };
    loadMachines();
    const timer = setInterval(loadMachines, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!machineId) {
      setJobs([]);
      return;
    }
    const loadJobs = async () => {
      try {
        const res = await fetch(`/api/jobs?machineId=${encodeURIComponent(machineId)}&limit=100`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (alive && data.jobs) setJobs(data.jobs);
      } catch {}
    };
    loadJobs();
    const timer = setInterval(loadJobs, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [machineId]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => ["Queued", "Starting", "Running"].includes(j.status)),
    [jobs]
  );
  const focusJob = activeJobs[0] || jobs[0];

  useEffect(() => {
    let alive = true;
    setLogs([]);
    if (!focusJob) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/jobs/${focusJob.id}`, { cache: "no-store" });
        const data = await res.json();
        if (alive && data.logs) setLogs(data.logs.slice(-40));
      } catch {}
    };
    load();
    const timer = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [focusJob?.id]);

  const completedToday = jobs.filter((j) => {
    if (j.status !== "Completed") return false;
    const stamp = new Date(j.endTime || j.createdAt);
    return stamp.toDateString() === new Date().toDateString();
  }).length;
  const onlineMachines = machines.filter((m) => m.status === "online");
  const canRun = Boolean(runner?.token) && !cloudMismatch;

  const quickStart = async (automation: Automation) => {
    if (!canRun) {
      setMessage({
        type: "error",
        text: "Connect the runner on this PC first (top-right runner button), then start the automation.",
      });
      return;
    }
    setStartingId(automation.id);
    setMessage(null);
    try {
      const inputs = Object.fromEntries(
        (automation.requiredInputs || []).map((input) => [input.name, input.defaultValue ?? ""])
      );
      const job = await startJob(automation.id, inputs);
      setMessage({
        type: "success",
        text: `Queued on ${job.machineName}. The runner will open Chrome locally in a few seconds.`,
      });
      router.push(`/live?jobId=${job.id}`);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command center"
        title="Your automations, on your PC."
        description="The dashboard is the control plane. Every job is pinned to the runner on the computer where you click Start — nothing executes in the cloud."
        actions={
          <>
            <Link href="/automations" className="btn btn-ghost">
              <Layers className="h-3.5 w-3.5" /> Registry
            </Link>
            <Link href="/live" className="btn btn-primary">
              <Radio className="h-3.5 w-3.5" /> Live runs
            </Link>
          </>
        }
      />

      <RunnerGate />

      {message && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs",
            message.type === "success"
              ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200"
              : "border-rose-400/25 bg-rose-400/[0.07] text-rose-200"
          )}
        >
          <span className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <Bot className="h-4 w-4 text-rose-300" />
            )}
            {message.text}
          </span>
          <Link href="/live" className="flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline">
            Open monitor <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Automation registry"
          value={loading ? "—" : automations.length}
          hint="Validated packages available"
          icon={Layers}
          tone="aqua"
          progress={100}
        />
        <StatCard
          label="Active on this PC"
          value={activeJobs.length}
          hint={runner ? `Pinned to ${runner.machineName}` : "Runner not connected"}
          icon={Activity}
          tone="mint"
          progress={activeJobs.length ? 68 : 0}
        />
        <StatCard
          label="Completed today"
          value={completedToday}
          hint="Runs finished on this PC"
          icon={CheckCircle2}
          tone="iris"
          progress={Math.min(100, completedToday * 12)}
        />
        <StatCard
          label="Fleet online"
          value={`${onlineMachines.length}/${machines.length}`}
          hint={machines.length ? "Registered runner PCs" : "No PCs registered yet"}
          icon={MonitorSmartphone}
          tone="amber"
          progress={machines.length ? (onlineMachines.length / machines.length) * 100 : 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <SectionTitle
            title="Start an automation"
            description="One click queues the job for this PC's runner only."
            action={
              <Link href="/automations" className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-200">
                View all {automations.length}
              </Link>
            }
          />

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="panel h-44 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {automations.slice(0, 4).map((automation) => (
                <Panel key={automation.id} hover className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <CategoryIcon category={automation.category} />
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          {automation.category}
                        </div>
                        <h3 className="mt-1 line-clamp-2 text-[12.5px] font-semibold leading-snug text-white">
                          {automation.name}
                        </h3>
                      </div>
                    </div>
                    <Badge tone="slate" className="shrink-0">
                      v{automation.version}
                    </Badge>
                  </div>

                  <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                    {automation.description}
                  </p>

                  <div className="mt-3 flex items-center gap-2 border-t border-slate-800/60 pt-2.5 text-[9px] text-slate-500">
                    <span className="font-mono">{automation.language}</span>
                    <span className="text-slate-700">·</span>
                    <span>{automation.requiredBrowser}</span>
                    {automation.requiredInputs?.length > 0 && (
                      <>
                        <span className="text-slate-700">·</span>
                        <span>{automation.requiredInputs.length} inputs</span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => quickStart(automation)}
                      disabled={startingId === automation.id || !canRun}
                      className="btn btn-primary flex-1 py-2"
                      title={!canRun ? "Connect this PC's runner first" : "Queue on this PC"}
                    >
                      {startingId === automation.id ? (
                        <Spinner className="text-slate-950" />
                      ) : (
                        <Play className="h-3 w-3 fill-current" />
                      )}
                      {startingId === automation.id ? "Queuing" : "Run"}
                    </button>
                    <Link href={`/automations/${automation.id}`} className="btn btn-ghost px-2.5 py-2">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </Panel>
              ))}
            </div>
          )}

          <SectionTitle
            title="Recent runs"
            description="Only jobs executed on this PC are shown here."
            action={
              <Link href="/history" className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-200">
                Full history
              </Link>
            }
          />

          <Panel className="overflow-hidden">
            {jobs.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Zap}
                  title={runner ? "No runs yet on this PC" : "Connect this PC's runner to see runs"}
                  description={
                    runner
                      ? "Start an automation above. The local runner will allocate a free port, launch the process, and open Chrome."
                      : "Start START_AUTOMATION_HUB.bat on this PC and use the runner chip in the top bar."
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {jobs.slice(0, 6).map((job) => (
                  <Link
                    key={job.id}
                    href={`/live?jobId=${job.id}`}
                    className="row-hover flex items-center gap-3 px-4 py-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60">
                      <Terminal className="h-3.5 w-3.5 text-cyan-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] font-medium text-slate-100">
                        {job.automationName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-500">
                        <span className="font-mono">{job.id.slice(-8)}</span>
                        <span>·</span>
                        <span>{formatRelative(job.createdAt)}</span>
                        {job.allocatedPort && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-emerald-400/80">:{job.allocatedPort}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <span className="flex items-center gap-1 text-[9px] text-slate-500">
                        <Timer className="h-3 w-3" />
                        {formatDuration(job.durationSeconds)}
                      </span>
                    </div>
                    <StatusBadge status={job.status} />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                <Cpu className="h-3.5 w-3.5 text-cyan-300" /> This PC
              </div>
              <StatusBadge status={runner && canRun ? "online" : cloudMismatch ? "paused" : "offline"} />
            </div>

            <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-300/20 via-cyan-400/20 to-indigo-500/20 text-cyan-200">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-white">
                    {runner?.machineName || (runnerStatus === "probing" ? "Detecting…" : "No runner")}
                  </div>
                  <div className="truncate font-mono text-[9px] text-slate-500">
                    {runner?.machineId || "start the .bat on this PC"}
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-[9px] text-slate-500">
                  <span>Active jobs</span>
                  <span className="font-mono text-slate-300">{activeJobs.length}</span>
                </div>
                <Progress value={activeJobs.length ? 75 : 4} tone={activeJobs.length ? "mint" : "slate"} />
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {activeJobs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-[10px] text-slate-500">
                  Idle — no local processes running.
                </div>
              ) : (
                activeJobs.slice(0, 4).map((job) => (
                  <Link
                    key={job.id}
                    href={`/live?jobId=${job.id}`}
                    className="block rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2.5 transition hover:border-cyan-400/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10.5px] font-medium text-slate-200">
                        {job.automationName}
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                    <div className="mt-1 truncate text-[9px] text-slate-500">{job.step}</div>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                <Terminal className="h-3.5 w-3.5 text-emerald-300" /> Live signal
              </div>
              {focusJob && <StatusBadge status={focusJob.status} />}
            </div>

            <div className="terminal m-3 max-h-[330px] min-h-[220px] overflow-y-auto p-3 text-[10px] leading-relaxed">
              {!focusJob ? (
                <div className="space-y-1.5 font-mono text-slate-500">
                  <div>[SYSTEM] NEXUS control plane ready.</div>
                  <div>[RUNNER] Waiting for a local runner on this PC…</div>
                  <div>[PORTS] Local allocation range 3100–3998.</div>
                  <div>[ISOLATION] Jobs are pinned to one machine.</div>
                </div>
              ) : logs.length === 0 ? (
                <div className="space-y-1.5 font-mono text-slate-500">
                  <div>[JOB] {focusJob.id}</div>
                  <div>[STATUS] {focusJob.status} — waiting for the runner…</div>
                  <div>[STEP] {focusJob.step}</div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log) => (
                    <div key={log.id} className="flex gap-2">
                      <span className="shrink-0 font-mono text-[9px] text-slate-600">
                        {formatTime(log.timestamp)}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 break-words font-mono",
                          log.level === "error"
                            ? "text-rose-300"
                            : log.level === "warn"
                              ? "text-amber-300"
                              : log.level === "success"
                                ? "text-emerald-300"
                                : log.level === "step"
                                  ? "text-cyan-300"
                                  : "text-slate-300"
                        )}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/70 px-4 py-2 text-[9px] text-slate-600">
              <span className="font-mono">{focusJob ? focusJob.id.slice(-12) : "no active job"}</span>
              <Link href="/live" className="flex items-center gap-1 hover:text-cyan-300">
                Full console <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
