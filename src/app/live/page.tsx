"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CircleStop,
  Download,
  ExternalLink,
  Play,
  Radio,
  RefreshCw,
  RotateCw,
  SquareTerminal,
  Timer,
  Zap,
} from "lucide-react";
import { ExecutionJob, ExecutionLog } from "@/lib/types";
import { useRunner } from "@/components/runner-context";
import RunnerGate from "@/components/RunnerGate";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Progress,
  SectionTitle,
  Spinner,
  StatusBadge,
  cn,
} from "@/components/ui";
import { formatDuration, formatRelative, formatTime } from "@/lib/format";

const ACTIVE = ["Queued", "Starting", "Running", "Paused"];

function LiveMonitor() {
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("jobId");
  const { runner, startJob, cancelJob } = useRunner();
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId);
  const [currentJob, setCurrentJob] = useState<ExecutionJob | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const machineId = runner?.machineId;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const query = machineId ? `?machineId=${encodeURIComponent(machineId)}&limit=100` : `?limit=100`;
        const res = await fetch(`/api/jobs${query}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!alive || !data.jobs) return;
        setJobs(data.jobs);
        setSelectedId((current) => {
          if (current && data.jobs.some((j: ExecutionJob) => j.id === current)) return current;
          if (initialJobId && data.jobs.some((j: ExecutionJob) => j.id === initialJobId)) {
            return initialJobId;
          }
          const active = data.jobs.find((j: ExecutionJob) => ACTIVE.includes(j.status));
          return active?.id || data.jobs[0]?.id || null;
        });
      } catch {}
    };
    load();
    const timer = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [machineId, initialJobId]);

  useEffect(() => {
    let alive = true;
    if (!selectedId) {
      setCurrentJob(null);
      setLogs([]);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`/api/jobs/${selectedId}`, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (data.job) {
          setCurrentJob(data.job);
          setLogs((data.logs || []).slice(-1000));
        }
      } catch {}
    };
    load();
    const timer = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selectedId]);

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  const activeJobs = useMemo(() => jobs.filter((j) => ACTIVE.includes(j.status)), [jobs]);
  const isLive = currentJob ? ACTIVE.includes(currentJob.status) : false;

  const handleCancel = async () => {
    if (!currentJob) return;
    setCancelling(true);
    setMessage(null);
    try {
      await cancelJob(currentJob.id);
      setMessage("Cancellation sent to the runner on this PC.");
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleRetry = async () => {
    if (!currentJob) return;
    setRetrying(true);
    setMessage(null);
    try {
      const job = await startJob(currentJob.automationId, currentJob.inputs || {});
      setSelectedId(job.id);
      setMessage(`Re-queued on ${job.machineName} as ${job.id}.`);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setRetrying(false);
    }
  };

  const downloadLogs = () => {
    if (!currentJob || !logs.length) return;
    const text = logs
      .map((log) => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexus_${currentJob.id}_logs.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations · live"
        title="Local execution console"
        description="Live stdout and process telemetry from this PC's runner. Other PCs' runs are isolated and never appear here."
        actions={
          <>
            <button onClick={downloadLogs} disabled={!logs.length} className="btn btn-ghost">
              <Download className="h-3.5 w-3.5" /> Logs
            </button>
            {isLive ? (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-500"
              >
                {cancelling ? <Spinner className="h-3.5 w-3.5" /> : <CircleStop className="h-4 w-4" />}
                {cancelling ? "Stopping…" : "⏹ Stop Automation"}
              </button>
            ) : (
              <button onClick={handleRetry} disabled={retrying || !runner} className="btn btn-primary">
                {retrying ? <Spinner className="text-slate-950" /> : <RotateCw className="h-3.5 w-3.5" />}
                {retrying ? "Queuing…" : "Run again"}
              </button>
            )}
          </>
        }
      />

      <RunnerGate compact />

      {message && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-2.5 text-[11px] text-cyan-100">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                <Radio className="h-3.5 w-3.5 text-emerald-300" /> This PC's runs
              </div>
              <Badge tone={activeJobs.length ? "mint" : "slate"}>{activeJobs.length} active</Badge>
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              {jobs.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11px] text-slate-500">
                  No jobs queued yet. Launch an automation to begin.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/40">
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => setSelectedId(job.id)}
                      className={cn(
                        "block w-full px-4 py-3 text-left transition",
                        selectedId === job.id
                          ? "bg-gradient-to-r from-cyan-400/10 to-transparent"
                          : "hover:bg-slate-800/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium text-slate-100">
                          {job.automationName}
                        </span>
                        <StatusBadge status={job.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[9px] text-slate-500">
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
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <Zap className="h-3.5 w-3.5 text-amber-300" /> Runner
            </div>
            <div className="mt-2 text-[11px] font-medium text-white">
              {runner?.machineName || "not connected"}
            </div>
            <div className="mt-1 font-mono text-[9px] text-slate-500">
              {runner?.machineId || "start the launcher on this PC"}
            </div>
            <div className="mt-3 flex items-center justify-between text-[9px] text-slate-500">
              <span>Active processes</span>
              <span className="font-mono text-slate-300">{activeJobs.length}</span>
            </div>
            <Progress value={activeJobs.length ? 70 : 3} tone={activeJobs.length ? "mint" : "slate"} />
            <div className="mt-3 text-[9px] leading-relaxed text-slate-600">
              Ports and Chrome windows are created by this PC's runner only.
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {currentJob ? (
            <>
              <Panel className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={currentJob.status} />
                      <span className="font-mono text-[9px] text-slate-500">{currentJob.id}</span>
                      {currentJob.cancelRequested && <Badge tone="amber">cancel requested</Badge>}
                    </div>
                    <h2 className="mt-2 text-base font-bold text-white">{currentJob.automationName}</h2>
                    <p className="mt-1 font-mono text-[10px] text-slate-400">{currentJob.step}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {currentJob.browserTabUrl && (
                      <a
                        href={currentJob.browserTabUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 px-3.5 py-1.5 text-xs font-bold text-cyan-200 shadow-sm transition hover:bg-cyan-500/30"
                      >
                        <span>Open Automation App (New Tab)</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {currentJob.allocatedPort && (
                      <span className="chip cursor-default font-mono text-emerald-300">
                        :{currentJob.allocatedPort}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[9px] text-slate-500">
                    <span>Execution progress</span>
                    <span className="font-mono text-slate-300">{currentJob.progress || 0}%</span>
                  </div>
                  <Progress
                    value={currentJob.progress || (isLive ? 35 : currentJob.status === "Completed" ? 100 : 0)}
                    tone={currentJob.status === "Failed" ? "rose" : currentJob.status === "Completed" ? "mint" : "aqua"}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {[
                    ["Machine", currentJob.machineName],
                    ["Process ID", currentJob.processId ? String(currentJob.processId) : "—"],
                    ["Started", formatRelative(currentJob.startTime)],
                    ["Duration", formatDuration(currentJob.durationSeconds)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2"
                    >
                      <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">{label}</div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-slate-200">{value}</div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    <SquareTerminal className="h-3.5 w-3.5 text-cyan-300" /> stdout / stderr
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-slate-500">
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                      />
                      auto-scroll
                    </label>
                    <span className="font-mono">{logs.length} lines</span>
                  </div>
                </div>

                <div className="terminal m-3 h-[460px] overflow-y-auto p-3 text-[10.5px] leading-relaxed">
                  {logs.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center font-mono text-slate-500">
                      <RefreshCw className="h-4 w-4 animate-spin text-slate-600" />
                      {isLive ? "Waiting for runner output…" : "No log lines recorded."}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2">
                          <span className="shrink-0 font-mono text-[8.5px] text-slate-600">
                            {formatTime(log.timestamp)}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1 py-px font-mono text-[8px] font-bold uppercase",
                              log.level === "error"
                                ? "bg-rose-500/15 text-rose-300"
                                : log.level === "warn"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : log.level === "success"
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : log.level === "step"
                                      ? "bg-cyan-500/15 text-cyan-300"
                                      : "bg-slate-800 text-slate-400"
                            )}
                          >
                            {log.level}
                          </span>
                          <span
                            className={cn(
                              "min-w-0 break-words font-mono",
                              log.level === "error"
                                ? "text-rose-200"
                                : log.level === "warn"
                                  ? "text-amber-200"
                                  : log.level === "success"
                                    ? "text-emerald-200"
                                    : log.level === "step"
                                      ? "text-cyan-200"
                                      : "text-slate-300"
                            )}
                          >
                            {log.message}
                          </span>
                        </div>
                      ))}
                      <div ref={endRef} />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/70 px-4 py-2 text-[9px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" /> started{" "}
                    {currentJob.startTime ? new Date(currentJob.startTime).toLocaleString() : "—"}
                  </span>
                  <span className="font-mono">machine: {currentJob.machineId}</span>
                </div>
              </Panel>
            </>
          ) : (
            <Panel className="p-6">
              <EmptyState
                icon={Play}
                title={machineId ? "No run selected" : "No runner on this PC"}
                description={
                  machineId
                    ? "Start an automation from the registry and its live console will appear here."
                    : "Start START_AUTOMATION_HUB.bat on this PC, then retry detection from the runner chip."
                }
                action={
                  machineId ? (
                    <Link href="/automations" className="btn btn-primary">
                      <Play className="h-3.5 w-3.5" /> Open registry
                    </Link>
                  ) : undefined
                }
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-xs text-slate-400">
          <Spinner className="mr-2" /> Loading live monitor…
        </div>
      }
    >
      <LiveMonitor />
    </Suspense>
  );
}
