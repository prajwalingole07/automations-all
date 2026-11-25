"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
  ExternalLink,
  Laptop,
  Layers,
  Play,
  Radio,
  RefreshCw,
  Search,
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
import { formatDuration, formatRelative } from "@/lib/format";

interface LogLine {
  id: string;
  level: string;
  message: string;
  timestamp: string;
}

export default function DashboardPage() {
  const { runner, startJob, availableMachines, switchMachine } = useRunner();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
    const loadJobs = async () => {
      try {
        const res = await fetch(`/api/jobs?limit=100`, { cache: "no-store" });
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

  // Launch Automation in a NEW TAB
  const launchInNewTab = async (automation: Automation) => {
    setStartingId(automation.id);
    setMessage(null);
    try {
      const inputs = Object.fromEntries(
        (automation.requiredInputs || []).map((input) => [input.name, input.defaultValue ?? ""])
      );
      const job = await startJob(automation.id, inputs);
      setMessage({
        type: "success",
        text: `Launched "${automation.name}" on ${job.machineName}. Opened execution in a new tab!`,
      });
      // Open in a new tab as requested
      window.open(`/live?jobId=${job.id}`, "_blank");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setStartingId(null);
    }
  };

  const downloadBat = () => {
    window.location.href = "/api/download/start-bat";
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome with Quick Download */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-[#0a1020] to-indigo-950/40 p-6 shadow-2xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                <Zap className="h-3 w-3" /> Render Cloud Web Service
              </span>
              <span className="text-[10px] text-slate-500">v2.0.0 Production</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              NEXUS Automation Command Center
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-400">
              Run college admissions, cutoff extractors, and option form automations. Launch any automation directly in a new tab or run locally on your PC.
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
              <span>Live Monitor (New Tab)</span>
              <ExternalLink className="h-3 w-3 text-slate-500" />
            </Link>
          </div>
        </div>
      </div>

      {/* Runner Status Bar */}
      <RunnerGate />

      {/* Action Notification */}
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
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
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

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Automation Registry"
          value={loading ? "—" : automations.length}
          hint="Validated packages ready to launch"
          icon={Layers}
          tone="aqua"
          progress={100}
        />
        <StatCard
          label="Active Engine"
          value={runner?.source === "cloud" ? "Cloud Engine" : runner?.machineName || "Online"}
          hint={runner?.source === "cloud" ? "Render Linux Container" : "Local Windows Runner"}
          icon={Cpu}
          tone="mint"
          progress={100}
        />
        <StatCard
          label="Runs Completed Today"
          value={completedToday}
          hint="Total automated jobs finished"
          icon={CheckCircle2}
          tone="iris"
          progress={Math.min(100, completedToday * 15)}
        />
        <StatCard
          label="Fleet Online"
          value={`${onlineMachines.length || 1} Active`}
          hint="Connected execution runners"
          icon={Activity}
          tone="amber"
          progress={100}
        />
      </div>

      {/* Main Grid: Automations (2 Cols) + Live Stream (1 Col) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left 2 Cols: Automation Cards */}
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <SectionTitle
              title="Launch an Automation"
              description="Click any automation to immediately queue and start it in a new browser tab."
            />
            <Link
              href="/automations"
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
            >
              View all 7 packages →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {automations.map((automation) => {
              const isStarting = startingId === automation.id;
              return (
                <div
                  key={automation.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 backdrop-blur-sm transition-all hover:border-cyan-500/40 hover:bg-slate-900/60 hover:shadow-xl hover:shadow-cyan-500/5"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CategoryIcon category={automation.category} className="h-9 w-9 shrink-0" />
                        <div>
                          <Badge tone="aqua">{automation.category}</Badge>
                          <span className="ml-2 font-mono text-[10px] text-slate-500">
                            v{automation.version}
                          </span>
                        </div>
                      </div>
                      <span className="rounded-md border border-slate-800 bg-slate-900/90 px-2 py-0.5 font-mono text-[9px] text-slate-400">
                        {automation.language}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-cyan-200">
                        {automation.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                        {automation.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-slate-800/60 pt-4">
                    {/* Primary Button: Launch in New Tab */}
                    <button
                      onClick={() => launchInNewTab(automation)}
                      disabled={isStarting}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/30"
                    >
                      {isStarting ? (
                        <Spinner className="h-3.5 w-3.5 text-cyan-300" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current text-cyan-300" />
                      )}
                      <span>{isStarting ? "Starting…" : "Launch in New Tab"}</span>
                      <ExternalLink className="h-3 w-3 text-cyan-400/60" />
                    </button>

                    {/* Secondary Button: Configure & Run in New Tab */}
                    <Link
                      href={`/automations/${automation.id}`}
                      target="_blank"
                      className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                      title="Open parameters configuration in new tab"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Live Terminal Output Stream */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle
              title="Live Execution Console"
              description={focusJob ? `Stream for ${focusJob.automationName}` : "No active jobs"}
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
              {focusJob && <StatusBadge status={focusJob.status} />}
            </div>

            <div className="flex-1 overflow-y-auto bg-[#03060c] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {logs.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-600">
                  <Terminal className="mb-2 h-8 w-8 text-slate-700" />
                  <p>Waiting for automation launch...</p>
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
