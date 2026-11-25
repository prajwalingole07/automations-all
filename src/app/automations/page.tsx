"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Filter,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Automation, ExecutionJob } from "@/lib/types";
import { useRunner } from "@/components/runner-context";
import RunnerGate from "@/components/RunnerGate";
import {
  Badge,
  CategoryIcon,
  EmptyState,
  Modal,
  PageHeader,
  Panel,
  StatusBadge,
  cn,
  Spinner,
} from "@/components/ui";
import { formatRelative } from "@/lib/format";

const CATEGORIES = [
  "All",
  "Engineering Admissions",
  "Choice Filling",
  "Data Extraction",
  "Alerts & Monitoring",
  "Document Processing",
  "General",
];

export default function AutomationsPage() {
  const router = useRouter();
  const { runner, startJob, cloudMismatch } = useRunner();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<Automation | null>(null);
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const machineId = runner?.machineId;

  useEffect(() => {
    fetch("/api/automations", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setAutomations(data.automations || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!machineId) {
      setJobs([]);
      return;
    }
    const load = () =>
      fetch(`/api/jobs?machineId=${encodeURIComponent(machineId)}&limit=200`, { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => setJobs(data.jobs || []))
        .catch(() => {});
    load();
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [machineId]);

  const lastJobByAutomation = useMemo(() => {
    const map = new Map<string, ExecutionJob>();
    for (const job of jobs) {
      if (!map.has(job.automationId)) map.set(job.automationId, job);
    }
    return map;
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return automations.filter((automation) => {
      const matchesSearch =
        !q ||
        automation.name.toLowerCase().includes(q) ||
        automation.description.toLowerCase().includes(q) ||
        automation.language.toLowerCase().includes(q) ||
        automation.entryPoint.toLowerCase().includes(q);
      const matchesCategory = category === "All" || automation.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [automations, search, category]);

  const canRun = Boolean(runner?.token) && !cloudMismatch;

  const openLaunch = (automation: Automation) => {
    setSelected(automation);
    setMessage(null);
    const initial: Record<string, any> = {};
    for (const input of automation.requiredInputs || []) {
      initial[input.name] = input.defaultValue ?? (input.type === "boolean" ? false : "");
    }
    setInputs(initial);
  };

  const launch = async () => {
    if (!selected) return;
    if (!canRun) {
      setMessage({ type: "error", text: "Connect this PC's runner first." });
      return;
    }
    setLaunching(true);
    setMessage(null);
    try {
      const job = await startJob(selected.id, inputs);
      setMessage({ type: "success", text: `Queued on ${job.machineName}. Opening monitor…` });
      setTimeout(() => router.push(`/live?jobId=${job.id}`), 700);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Registry"
        title="Automation packages"
        description="Validated local workflows. Each run is queued for the runner on this PC, with its own port, process tree, and Chrome window."
        actions={
          <Link href="/upload" className="btn btn-ghost">
            <Boxes className="h-3.5 w-3.5" /> Upload package
          </Link>
        }
      />

      <RunnerGate compact />

      <Panel className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, runtime, entry point…"
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <Filter className="mr-1 h-3.5 w-3.5 shrink-0 text-slate-500" />
          {CATEGORIES.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={cn("chip whitespace-nowrap", category === item && "chip-active")}
            >
              {item}
            </button>
          ))}
        </div>
      </Panel>

      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>
          <span className="font-mono text-slate-300">{filtered.length}</span> of {automations.length} packages
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-emerald-400" /> execution stays local
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No automations match"
          description="Try a different search term or category."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((automation) => {
            const lastJob = lastJobByAutomation.get(automation.id);
            return (
              <Panel key={automation.id} hover className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <CategoryIcon category={automation.category} />
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {automation.category}
                      </div>
                      <Link
                        href={`/automations/${automation.id}`}
                        className="mt-1 line-clamp-2 block text-[13px] font-semibold leading-snug text-white hover:text-cyan-200"
                      >
                        {automation.name}
                      </Link>
                    </div>
                  </div>
                  <Badge tone="slate" className="shrink-0">
                    v{automation.version}
                  </Badge>
                </div>

                <p className="mt-3 line-clamp-3 flex-1 text-[11px] leading-relaxed text-slate-400">
                  {automation.description}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 p-2.5 text-[9px]">
                  <div className="min-w-0">
                    <div className="text-slate-600">Runtime</div>
                    <div className="truncate font-medium text-slate-300">{automation.language}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-slate-600">Browser</div>
                    <div className="truncate font-medium text-indigo-300">{automation.requiredBrowser}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-slate-600">Entry</div>
                    <div className="truncate font-mono text-slate-400">{automation.entryPoint}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-slate-600">Port policy</div>
                    <div className="truncate font-medium text-emerald-300">
                      {automation.requiresLocalServer || automation.defaultPort ? "dynamic local" : "direct CLI"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800/60 pt-3">
                  {lastJob ? (
                    <Link
                      href={`/live?jobId=${lastJob.id}`}
                      className="flex min-w-0 items-center gap-1.5 text-[9px] text-slate-500 hover:text-slate-300"
                    >
                      <StatusBadge status={lastJob.status} />
                      <span className="truncate">{formatRelative(lastJob.createdAt)}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] text-slate-600">
                      <Sparkles className="h-3 w-3" /> not run on this PC yet
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link
                      href={`/automations/${automation.id}`}
                      className="btn btn-ghost h-8 px-2.5 text-[10px]"
                    >
                      Details
                    </Link>
                    <button
                      onClick={() => openLaunch(automation)}
                      disabled={!canRun}
                      className="btn btn-primary h-8 px-2.5 text-[10px]"
                      title={!canRun ? "Connect this PC's runner first" : "Run on this PC"}
                    >
                      <Play className="h-3 w-3 fill-current" /> Run
                    </button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name || "Run automation"}
        description="The job is pinned to this PC. No other operator's runner can claim it."
        width="max-w-xl"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="mint">
                <ShieldCheck className="h-3 w-3" /> this PC only
              </Badge>
              <span className="chip cursor-default font-mono">
                {runner?.machineName || "no runner"}
              </span>
              <span className="chip cursor-default">{selected.language}</span>
              {selected.requiredBrowser !== "None" && (
                <span className="chip cursor-default">{selected.requiredBrowser}</span>
              )}
            </div>

            {message && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px]",
                  message.type === "success"
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                    : "border-rose-400/25 bg-rose-400/10 text-rose-200"
                )}
              >
                {message.type === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <span className="mt-0.5 h-3.5 w-3.5 shrink-0">!</span>
                )}
                {message.text}
              </div>
            )}

            {selected.requiredInputs?.length ? (
              <div className="space-y-3">
                {selected.requiredInputs.map((input) => (
                  <div key={input.name}>
                    <label className="label">
                      {input.label} {input.required && <span className="text-rose-400">*</span>}
                    </label>
                    {input.type === "select" ? (
                      <select
                        value={inputs[input.name] ?? ""}
                        onChange={(e) => setInputs({ ...inputs, [input.name]: e.target.value })}
                        className="select"
                      >
                        {(input.options || []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : input.type === "boolean" ? (
                      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(inputs[input.name])}
                          onChange={(e) =>
                            setInputs({ ...inputs, [input.name]: e.target.checked })
                          }
                          className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                        />
                        {input.description || "Enable this option"}
                      </label>
                    ) : (
                      <input
                        type={input.type === "number" ? "number" : "text"}
                        value={inputs[input.name] ?? ""}
                        onChange={(e) => setInputs({ ...inputs, [input.name]: e.target.value })}
                        placeholder={input.description || ""}
                        className="input"
                      />
                    )}
                    {input.description && input.type !== "boolean" && (
                      <p className="mt-1 text-[10px] text-slate-500">{input.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-[11px] text-slate-400">
                This package has no configurable inputs. The runner will launch its local workflow
                directly and open Chrome when the server is ready.
              </p>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-slate-800/70 pt-4">
              <Link href={`/automations/${selected.id}`} className="text-[10px] text-slate-500 hover:text-slate-300">
                <span className="flex items-center gap-1">
                  Full specification <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(null)} className="btn btn-ghost">
                  Cancel
                </button>
                <button onClick={launch} disabled={launching || !canRun} className="btn btn-primary">
                  {launching ? <Spinner className="text-slate-950" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  {launching ? "Queuing…" : "Run on this PC"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
