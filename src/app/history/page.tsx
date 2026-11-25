"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, History as HistoryIcon, Search, Timer } from "lucide-react";
import { ExecutionJob } from "@/lib/types";
import { useRunner } from "@/components/runner-context";
import RunnerGate from "@/components/RunnerGate";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
  cn,
} from "@/components/ui";
import { formatDuration, formatRelative } from "@/lib/format";

const STATUSES = ["All", "Running", "Completed", "Failed", "Cancelled"];
const RANGES = ["All time", "Today", "7 days", "30 days"];

export default function HistoryPage() {
  const { runner } = useRunner();
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [range, setRange] = useState("All time");
  const [loading, setLoading] = useState(true);

  const machineId = runner?.machineId;

  useEffect(() => {
    let alive = true;
    if (!machineId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`/api/jobs?machineId=${encodeURIComponent(machineId)}&limit=300`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (alive && data.jobs) setJobs(data.jobs);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [machineId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return jobs.filter((job) => {
      const matchesSearch =
        !q ||
        job.automationName.toLowerCase().includes(q) ||
        job.id.toLowerCase().includes(q) ||
        job.machineName.toLowerCase().includes(q) ||
        job.userName.toLowerCase().includes(q);
      const matchesStatus = status === "All" || job.status === status;
      let matchesRange = true;
      if (range === "Today") {
        matchesRange = new Date(job.createdAt).toDateString() === new Date().toDateString();
      } else if (range === "7 days") {
        matchesRange = now - new Date(job.createdAt).getTime() <= 7 * 86_400_000;
      } else if (range === "30 days") {
        matchesRange = now - new Date(job.createdAt).getTime() <= 30 * 86_400_000;
      }
      return matchesSearch && matchesStatus && matchesRange;
    });
  }, [jobs, search, status, range]);

  const stats = useMemo(() => {
    const completed = filtered.filter((job) => job.status === "Completed").length;
    const failed = filtered.filter((job) => job.status === "Failed").length;
    const totalSeconds = filtered.reduce((sum, job) => sum + (job.durationSeconds || 0), 0);
    return { completed, failed, totalSeconds };
  }, [filtered]);

  const exportCsv = () => {
    if (!filtered.length) return;
    const header = [
      "job_id",
      "automation",
      "machine",
      "user",
      "status",
      "port",
      "duration_seconds",
      "created_at",
      "started_at",
      "ended_at",
    ];
    const rows = filtered.map((job) => [
      job.id,
      job.automationName,
      job.machineName,
      job.userName,
      job.status,
      job.allocatedPort || "",
      job.durationSeconds || "",
      job.createdAt,
      job.startTime,
      job.endTime || "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexus_history_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations · audit"
        title="Execution history"
        description="Every run performed by this PC's runner, with durations, ports, statuses and a CSV audit export."
        actions={
          <button onClick={exportCsv} disabled={!filtered.length} className="btn btn-ghost">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        }
      />

      <RunnerGate compact />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Visible runs", filtered.length, "aqua"],
          ["Completed", stats.completed, "mint"],
          ["Failed", stats.failed, "rose"],
          ["Run time", formatDuration(stats.totalSeconds), "iris"],
        ].map(([label, value, tone]) => (
          <Panel key={String(label)} className="flex items-center justify-between p-3.5">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {label}
              </div>
              <div className="kpi-value mt-1 text-lg font-bold text-white">{value}</div>
            </div>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                tone === "mint"
                  ? "bg-emerald-400"
                  : tone === "rose"
                    ? "bg-rose-400"
                    : tone === "iris"
                      ? "bg-indigo-400"
                      : "bg-cyan-400"
              )}
            />
          </Panel>
        ))}
      </div>

      <Panel className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full xl:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job ID, automation, PC, operator…"
            className="input pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {STATUSES.map((item) => (
              <button
                key={item}
                onClick={() => setStatus(item)}
                className={cn("chip", status === item && "chip-active")}
              >
                {item}
              </button>
            ))}
          </div>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="select w-auto">
            {RANGES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      {!machineId ? (
        <EmptyState
          icon={HistoryIcon}
          title="No runner connected on this PC"
          description="History is scoped to the PC that executed the jobs. Start the local runner and retry detection."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title={loading ? "Loading history…" : "No runs match these filters"}
          description={
            loading
              ? "Fetching execution records from the cloud control plane."
              : "Adjust the status, date range, or search term."
          }
        />
      ) : (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-[11px]">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-semibold">Job</th>
                  <th className="px-4 py-3 font-semibold">Automation</th>
                  <th className="px-4 py-3 font-semibold">Operator</th>
                  <th className="px-4 py-3 font-semibold">Machine</th>
                  <th className="px-4 py-3 font-semibold">Port</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 text-right font-semibold">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filtered.map((job) => (
                  <tr key={job.id} className="row-hover">
                    <td className="px-4 py-3 font-mono text-[10px] text-cyan-300">{job.id.slice(-10)}</td>
                    <td className="max-w-[230px] truncate px-4 py-3 font-medium text-slate-100">
                      {job.automationName}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{job.userName}</td>
                    <td className="px-4 py-3 text-slate-400">{job.machineName}</td>
                    <td className="px-4 py-3 font-mono text-emerald-400/80">
                      {job.allocatedPort ? `:${job.allocatedPort}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-slate-400">
                        <Timer className="h-3 w-3" /> {formatDuration(job.durationSeconds)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-[10px] text-slate-500">{formatRelative(job.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/live?jobId=${job.id}`}
                        className="btn btn-ghost h-7 px-2 text-[9px]"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div className="flex items-center justify-between text-[9px] text-slate-600">
        <span>Showing {filtered.length} of {jobs.length} runs on this PC</span>
        <Badge tone="slate">retained by cloud persistence</Badge>
      </div>
    </div>
  );
}
