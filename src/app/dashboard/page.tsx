"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
  ExternalLink,
  Laptop,
  Layers,
  OctagonX,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
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
import { getAutomationPort } from "@/lib/registry";

interface LogLine {
  id: string;
  level: string;
  message: string;
  timestamp: string;
}

interface ConflictState {
  targetAutomation: Automation;
  conflictingJob: ExecutionJob;
  port: number;
  newTab?: Window | null;
}

export default function DashboardPage() {
  const { runner, startJob, cancelJob } = useRunner();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error" | "warn"; text: string } | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const loadAutomations = async () => {
    try {
      const res = await fetch("/api/automations", { cache: "no-store" });
      const data = await res.json();
      if (data.automations) setAutomations(data.automations);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async () => {
    try {
      const res = await fetch(`/api/jobs?limit=100`, { cache: "no-store" });
      const data = await res.json();
      if (data.jobs) setJobs(data.jobs);
    } catch {}
  };

  const loadMachines = async () => {
    try {
      const res = await fetch("/api/machines", { cache: "no-store" });
      const data = await res.json();
      if (data.machines) setMachines(data.machines);
    } catch {}
  };

  useEffect(() => {
    loadAutomations();
    loadJobs();
    loadMachines();
    const timer = setInterval(() => {
      loadJobs();
      loadMachines();
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const activeJobs = useMemo(
    () => jobs.filter((j) => ["Queued", "Starting", "Running"].includes(j.status)),
    [jobs]
  );
  const focusJob = activeJobs[0] || jobs[0];

  useEffect(() => {
    let alive = true;
    if (!focusJob) {
      setLogs([]);
      return;
    }
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

  // Map of automationId -> currently active job (if running)
  const activeJobByAutomation = useMemo(() => {
    const map = new Map<string, ExecutionJob>();
    for (const job of activeJobs) {
      if (!map.has(job.automationId)) map.set(job.automationId, job);
    }
    return map;
  }, [activeJobs]);

  // Handle Launch with Port Conflict Check & Immediate New Tab
  const handleLaunch = async (automation: Automation, forceStopConflict = false, existingTab?: Window | null) => {
    // 1. Immediately open a new tab synchronously (to prevent popup blocker)
    const newTab = existingTab || window.open("about:blank", "_blank");

    // 2. Check for port conflict client-side if not forcing
    const targetPort = getAutomationPort(automation.id);
    if (!forceStopConflict) {
      const activeConflicting = activeJobs.find(
        (j) => getAutomationPort(j.automationId) === targetPort || j.automationId === automation.id
      );

      if (activeConflicting) {
        // Show conflict modal asking user to stop previous job
        setConflict({
          targetAutomation: automation,
          conflictingJob: activeConflicting,
          port: targetPort,
          newTab,
        });
        return;
      }
    }

    setStartingId(automation.id);
    setMessage(null);
    try {
      const inputs = Object.fromEntries(
        (automation.requiredInputs || []).map((input) => [input.name, input.defaultValue ?? ""])
      );
      const job = await startJob(automation.id, inputs, forceStopConflict);
      
      // Direct new tab to the live execution view
      if (newTab) {
        newTab.location.href = `/live?jobId=${job.id}`;
      } else {
        window.open(`/live?jobId=${job.id}`, "_blank");
      }

      setMessage({
        type: "success",
        text: `Launched "${automation.name}" on Port :${targetPort}! Execution running in new tab.`,
      });
      loadJobs();
    } catch (err: any) {
      if (newTab) newTab.close();
      if (err.portConflict && err.conflictingJob) {
        setConflict({
          targetAutomation: automation,
          conflictingJob: err.conflictingJob,
          port: err.port || targetPort,
        });
      } else {
        setMessage({ type: "error", text: err.message });
      }
    } finally {
      setStartingId(null);
      setConflict(null);
    }
  };

  // Handle Stop Automation
  const handleStop = async (jobId: string, automationName: string) => {
    setStoppingId(jobId);
    try {
      await cancelJob(jobId);
      setMessage({
        type: "warn",
        text: `Automation "${automationName}" stopped. Port has been released and process killed.`,
      });
      await loadJobs();
    } catch (err: any) {
      setMessage({ type: "error", text: `Could not stop automation: ${err.message}` });
    } finally {
      setStoppingId(null);
    }
  };

  // Resolve conflict: Stop previous automation and start new
  const resolveConflictAndLaunch = async () => {
    if (!conflict) return;
    const { targetAutomation, conflictingJob, newTab } = conflict;
    setStartingId(targetAutomation.id);
    try {
      // 1. Cancel previous job
      await cancelJob(conflictingJob.id);
      // 2. Start new automation with forceStopConflict flag
      await handleLaunch(targetAutomation, true, newTab);
    } catch (err: any) {
      setMessage({ type: "error", text: `Error switching automations: ${err.message}` });
      if (newTab) newTab.close();
    } finally {
      setConflict(null);
      setStartingId(null);
    }
  };

  const cancelConflict = () => {
    if (conflict?.newTab) {
      conflict.newTab.close();
    }
    setConflict(null);
  };

  const downloadBat = () => {
    window.location.href = "/api/download/start-bat";
  };

  return (
    <div className="space-y-6">
      {/* Port Conflict Modal Dialog */}
      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Port Conflict Detected</h3>
                <span className="font-mono text-xs text-amber-300">Port :{conflict.port} is already active</span>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate-300">
              <strong className="text-white">"{conflict.conflictingJob.automationName}"</strong> is currently using{" "}
              <span className="font-mono font-semibold text-cyan-300">Port :{conflict.port}</span>.
              <br /><br />
              At one time, only <strong>one automation can use this port</strong> to prevent socket collisions and browser port cache mixing.
            </p>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-400">
              <div className="flex items-center justify-between">
                <span>Active Automation:</span>
                <span className="font-mono text-amber-300">{conflict.conflictingJob.id.slice(-8)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Requested Automation:</span>
                <span className="font-semibold text-white">{conflict.targetAutomation.name}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                onClick={cancelConflict}
                className="btn btn-ghost h-9 px-4 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={resolveConflictAndLaunch}
                className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-600 to-red-700 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/20 hover:brightness-110"
              >
                <OctagonX className="h-4 w-4" />
                <span>Stop Previous & Start in New Tab</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner with One-Click Launcher Download */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-[#0a1020] to-indigo-950/40 p-6 shadow-2xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                <Zap className="h-3 w-3" /> Render Web Service Production
              </span>
              <span className="text-[10px] text-slate-500">Dedicated Port Engine</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              NEXUS Automation Command Center
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-400">
              Direct execution in isolated tabs. Automatic port conflict prevention and incognito browser isolation to eliminate port cache issues.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              onClick={downloadBat}
              className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110"
            >
              <Download className="h-4 w-4" />
              <span>Download START_AUTOMATION.bat</span>
            </button>
            <Link
              href="/live"
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              <Radio className="h-3.5 w-3.5 text-emerald-400" />
              <span>Live Console (New Tab)</span>
              <ExternalLink className="h-3 w-3 text-slate-500" />
            </Link>
          </div>
        </div>
      </div>

      {/* Runner Status Bar */}
      <RunnerGate />

      {/* Notification Toast */}
      {message && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs animate-fadeIn",
            message.type === "success"
              ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200"
              : message.type === "warn"
                ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-200"
                : "border-rose-400/25 bg-rose-400/[0.07] text-rose-200"
          )}
        >
          <span className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : message.type === "warn" ? (
              <AlertTriangle className="h-4 w-4 text-amber-300" />
            ) : (
              <OctagonX className="h-4 w-4 text-rose-300" />
            )}
            {message.text}
          </span>
          <Link
            href="/live"
            target="_blank"
            className="flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline"
          >
            Open Live Monitor <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Automations Ready"
          value={loading ? "—" : automations.length}
          hint="7 validated packages"
          icon={Layers}
          tone="aqua"
          progress={100}
        />
        <StatCard
          label="Active Execution Engine"
          value={runner?.source === "cloud" ? "Cloud Engine" : runner?.machineName || "Online"}
          hint={runner?.source === "cloud" ? "Render Linux Container" : "Local Windows PC"}
          icon={Cpu}
          tone="mint"
          progress={100}
        />
        <StatCard
          label="Runs Finished Today"
          value={completedToday}
          hint="Total completed batches"
          icon={CheckCircle2}
          tone="iris"
          progress={Math.min(100, completedToday * 15)}
        />
        <StatCard
          label="Currently Running"
          value={`${activeJobs.length} Active`}
          hint={activeJobs.length ? "Automations in progress" : "All ports idle"}
          icon={Activity}
          tone={activeJobs.length ? "amber" : "mint"}
          progress={activeJobs.length ? 75 : 0}
        />
      </div>

      {/* Main Grid: Automations + Live Console */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left 2 Cols: Automation Cards */}
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <SectionTitle
              title="Automations"
              description="Each package runs on its dedicated port with fresh incognito browser context."
            />
            <Link
              href="/automations"
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
            >
              View catalog →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {automations.map((automation) => {
              const activeJob = activeJobByAutomation.get(automation.id);
              const isRunning = Boolean(activeJob);
              const isStarting = startingId === automation.id;
              const isStopping = activeJob ? stoppingId === activeJob.id : false;
              const port = getAutomationPort(automation.id);

              return (
                <div
                  key={automation.id}
                  className={cn(
                    "group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 backdrop-blur-sm transition-all",
                    isRunning
                      ? "border-emerald-500/50 bg-emerald-950/20 shadow-lg shadow-emerald-500/10"
                      : "border-slate-800/80 bg-slate-950/60 hover:border-cyan-500/40 hover:bg-slate-900/60 hover:shadow-xl hover:shadow-cyan-500/5"
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CategoryIcon category={automation.category} className="h-9 w-9 shrink-0" />
                        <div>
                          <Badge tone="aqua">{automation.category}</Badge>
                          <span className="ml-2 font-mono text-[9px] text-slate-500">
                            v{automation.version}
                          </span>
                        </div>
                      </div>
                      
                      {/* Port Badge */}
                      <span className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                        :{port}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white group-hover:text-cyan-200">
                          {automation.name}
                        </h3>
                        {isRunning && (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                        {automation.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-slate-800/60 pt-4">
                    {/* If Running: Show STOP AUTOMATION button */}
                    {isRunning && activeJob ? (
                      <button
                        onClick={() => handleStop(activeJob.id, automation.name)}
                        disabled={isStopping}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-500/30"
                      >
                        {isStopping ? (
                          <Spinner className="h-3.5 w-3.5 text-rose-300" />
                        ) : (
                          <Square className="h-3.5 w-3.5 fill-current text-rose-400" />
                        )}
                        <span>{isStopping ? "Stopping…" : "⏹ Stop Automation"}</span>
                      </button>
                    ) : (
                      /* If Idle: Show LAUNCH IN NEW TAB button */
                      <button
                        onClick={() => handleLaunch(automation)}
                        disabled={isStarting}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/30"
                      >
                        {isStarting ? (
                          <Spinner className="h-3.5 w-3.5 text-cyan-300" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-current text-cyan-300" />
                        )}
                        <span>{isStarting ? "Queuing…" : "Launch in New Tab"}</span>
                        <ExternalLink className="h-3 w-3 text-cyan-400/60" />
                      </button>
                    )}

                    {/* Secondary Action: Open Details in New Tab */}
                    <Link
                      href={`/automations/${automation.id}`}
                      target="_blank"
                      className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                      title="Open configuration in new tab"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Live Console Output Stream */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle
              title="Live Console Stream"
              description={focusJob ? `Output for ${focusJob.automationName}` : "Standby mode"}
            />
            {focusJob && (
              <Link
                href={`/live?jobId=${focusJob.id}`}
                target="_blank"
                className="flex items-center gap-1 text-[10px] font-semibold text-cyan-400 hover:underline"
              >
                Expand <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            )}
          </div>

          <Panel className="flex h-[520px] flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[11px] font-semibold text-slate-200">
                  {focusJob ? focusJob.automationName : "Console Standby"}
                </span>
              </div>
              {focusJob && (
                <div className="flex items-center gap-2">
                  <StatusBadge status={focusJob.status} />
                  {["Queued", "Starting", "Running"].includes(focusJob.status) && (
                    <button
                      onClick={() => handleStop(focusJob.id, focusJob.automationName)}
                      className="rounded border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-[9px] font-bold text-rose-300 hover:bg-rose-500/30"
                    >
                      Stop
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto bg-[#03060c] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {logs.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-600">
                  <Terminal className="mb-2 h-8 w-8 text-slate-700" />
                  <p>Ready to execute.</p>
                  <p className="mt-1 text-[10px]">Click any "Launch in New Tab" button to begin.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="shrink-0 text-[10px] text-slate-600">
                        {new Date(line.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={cn(
                          "break-all",
                          line.level === "error"
                            ? "text-rose-400"
                            : line.level === "warn"
                              ? "text-amber-300"
                              : line.level === "step"
                                ? "font-semibold text-cyan-300"
                                : "text-slate-300"
                        )}
                      >
                        {line.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {focusJob && (
              <div className="border-t border-slate-800/80 bg-slate-950/80 px-4 py-3">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Current Step:</span>
                  <span className="font-semibold text-cyan-300">{focusJob.step}</span>
                </div>
                <div className="mt-2">
                  <Progress value={focusJob.progress} tone="aqua" />
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
