"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Download,
  ExternalLink,
  Filter,
  OctagonX,
  Play,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
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
  StatusBadge,
  cn,
  Spinner,
} from "@/components/ui";
import { getAutomationPort } from "@/lib/registry";

const CATEGORIES = [
  "All",
  "Engineering Admissions",
  "Choice Filling",
  "Data Extraction",
  "Alerts & Monitoring",
  "Document Processing",
];

interface ConflictState {
  targetAutomation: Automation;
  conflictingJob: ExecutionJob;
  port: number;
  newTab?: Window | null;
}

export default function AutomationsPage() {
  const { startJob, cancelJob } = useRunner();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "warn"; text: string } | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const loadData = async () => {
    try {
      const [aRes, jRes] = await Promise.all([
        fetch("/api/automations", { cache: "no-store" }),
        fetch("/api/jobs?limit=100", { cache: "no-store" }),
      ]);
      const [aData, jData] = await Promise.all([aRes.json(), jRes.json()]);
      if (aData.automations) setAutomations(aData.automations);
      if (jData.jobs) setJobs(jData.jobs);
    } catch {}
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 4000);
    return () => clearInterval(timer);
  }, []);

  const activeJobs = useMemo(
    () => jobs.filter((j) => ["Queued", "Starting", "Running"].includes(j.status)),
    [jobs]
  );

  const activeJobByAutomation = useMemo(() => {
    const map = new Map<string, ExecutionJob>();
    for (const job of activeJobs) {
      if (!map.has(job.automationId)) map.set(job.automationId, job);
    }
    return map;
  }, [activeJobs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return automations.filter((automation) => {
      const matchesSearch =
        !q ||
        automation.name.toLowerCase().includes(q) ||
        automation.description.toLowerCase().includes(q) ||
        automation.language.toLowerCase().includes(q);
      const matchesCategory = category === "All" || automation.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [automations, search, category]);

  const handleLaunch = async (automation: Automation, forceStopConflict = false, existingTab?: Window | null) => {
    const newTab = existingTab || window.open("about:blank", "_blank");
    const targetPort = getAutomationPort(automation.id);

    if (!forceStopConflict) {
      const activeConflicting = activeJobs.find(
        (j) => getAutomationPort(j.automationId) === targetPort || j.automationId === automation.id
      );

      if (activeConflicting) {
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
      if (newTab) {
        newTab.location.href = `/live?jobId=${job.id}`;
      } else {
        window.open(`/live?jobId=${job.id}`, "_blank");
      }
      setMessage({
        type: "success",
        text: `Launched "${automation.name}" on Port :${targetPort}! New tab opened.`,
      });
      loadData();
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

  const handleStop = async (jobId: string, automationName: string) => {
    setStoppingId(jobId);
    try {
      await cancelJob(jobId);
      setMessage({
        type: "warn",
        text: `Automation "${automationName}" stopped. Port released.`,
      });
      await loadData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setStoppingId(null);
    }
  };

  const resolveConflict = async () => {
    if (!conflict) return;
    const { targetAutomation, conflictingJob, newTab } = conflict;
    setStartingId(targetAutomation.id);
    try {
      await cancelJob(conflictingJob.id);
      await handleLaunch(targetAutomation, true, newTab);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
      if (newTab) newTab.close();
    } finally {
      setConflict(null);
      setStartingId(null);
    }
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
              Only one automation can run on this port at a time. Do you want to stop the first automation and start this one?
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                onClick={() => {
                  if (conflict?.newTab) conflict.newTab.close();
                  setConflict(null);
                }}
                className="btn btn-ghost h-9 px-4 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={resolveConflict}
                className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-600 to-red-700 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/20 hover:brightness-110"
              >
                <OctagonX className="h-4 w-4" />
                <span>Stop Previous & Start in New Tab</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        eyebrow="Automation catalog"
        title="Automations & Production Packages"
        description="All 7 pre-configured MHT-CET, CAP round, and data processing automation packages with dedicated ports."
        actions={
          <button onClick={downloadBat} className="btn btn-primary">
            <Download className="h-3.5 w-3.5" />
            <span>Download START_AUTOMATION.bat</span>
          </button>
        }
      />

      <RunnerGate compact />

      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-xs animate-fadeIn",
            message.type === "success"
              ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200"
              : message.type === "warn"
                ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-200"
                : "border-rose-400/25 bg-rose-400/[0.07] text-rose-200"
          )}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
          ) : message.type === "warn" ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
          ) : (
            <OctagonX className="h-4 w-4 shrink-0 text-rose-300" />
          )}
          {message.text}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                category === cat
                  ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 shadow-sm"
                  : "border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search packages..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Packages Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((automation) => {
          const activeJob = activeJobByAutomation.get(automation.id);
          const isRunning = Boolean(activeJob);
          const isStarting = startingId === automation.id;
          const isStopping = activeJob ? stoppingId === activeJob.id : false;
          const port = getAutomationPort(automation.id);

          return (
            <div
              key={automation.id}
              className={cn(
                "flex flex-col justify-between rounded-2xl border p-5 backdrop-blur-sm transition",
                isRunning
                  ? "border-emerald-500/50 bg-emerald-950/20 shadow-lg shadow-emerald-500/10"
                  : "border-slate-800/80 bg-slate-950/60 hover:border-cyan-500/40 hover:bg-slate-900/50 hover:shadow-xl hover:shadow-cyan-500/5"
              )}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <CategoryIcon category={automation.category} className="h-10 w-10 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone="aqua">{automation.category}</Badge>
                        <span className="font-mono text-[9px] text-slate-500">v{automation.version}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{automation.language}</span>
                    </div>
                  </div>

                  <span className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                    :{port}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white hover:text-cyan-200">
                      {automation.name}
                    </h3>
                    {isRunning && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-400">
                    {automation.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2 border-t border-slate-800/60 pt-4">
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

                <Link
                  href={`/automations/${automation.id}`}
                  target="_blank"
                  className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                  title="Configure parameters in new tab"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
