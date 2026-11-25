"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ExternalLink,
  Globe,
  Play,
  ShieldCheck,
  Terminal,
  Timer,
} from "lucide-react";
import { Automation, ExecutionJob } from "@/lib/types";
import { useRunner } from "@/components/runner-context";
import RunnerGate from "@/components/RunnerGate";
import {
  Badge,
  CategoryIcon,
  EmptyState,
  InfoRow,
  PageHeader,
  Panel,
  SectionTitle,
  Spinner,
  StatusBadge,
  cn,
} from "@/components/ui";
import { formatDuration, formatRelative } from "@/lib/format";

export default function AutomationDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { runner, startJob, cloudMismatch } = useRunner();
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [recentJobs, setRecentJobs] = useState<ExecutionJob[]>([]);
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const machineId = runner?.machineId;

  useEffect(() => {
    setLoading(true);
    const query = machineId ? `?machineId=${encodeURIComponent(machineId)}` : "";
    fetch(`/api/automations/${params.id}${query}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.automation) {
          setAutomation(data.automation);
          const initial: Record<string, any> = {};
          for (const input of data.automation.requiredInputs || []) {
            initial[input.name] = input.defaultValue ?? (input.type === "boolean" ? false : "");
          }
          setInputs(initial);
        }
        setRecentJobs(data.recentJobs || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id, machineId]);

  const canRun = true;

  const handleStart = async () => {
    if (!automation) return;
    setStarting(true);
    setMessage(null);
    try {
      const job = await startJob(automation.id, inputs);
      setMessage({
        type: "success",
        text: `Queued on ${job.machineName}. Execution started in a new tab!`,
      });
      window.open(`/live?jobId=${job.id}`, "_blank");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-xs text-slate-400">
        <Spinner className="mr-2" /> Loading automation…
      </div>
    );
  }

  if (!automation) {
    return (
      <EmptyState
        icon={Boxes}
        title="Automation not found"
        description="The package may have been removed from the registry."
        action={
          <Link href="/automations" className="btn btn-ghost">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to registry
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/automations"
        className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> Automation registry
      </Link>

      <Panel className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <CategoryIcon category={automation.category} className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="aqua">{automation.category}</Badge>
                <Badge tone="slate">v{automation.version}</Badge>
                <Badge tone="iris">{automation.language}</Badge>
                <span className="text-[9px] text-slate-600">Updated {automation.lastUpdated}</span>
              </div>
              <h1 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
                {automation.name}
              </h1>
              <p className="mt-2 max-w-3xl text-[11.5px] leading-relaxed text-slate-400">
                {automation.description}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row lg:flex-col">
            <button onClick={handleStart} disabled={starting} className="btn btn-primary px-5 py-3">
              {starting ? <Spinner className="text-slate-950" /> : <Play className="h-4 w-4 fill-current" />}
              {starting ? "Queuing…" : "Launch in New Tab"}
            </button>
            <div className="text-center text-[9px] text-slate-500">
              {runner ? `Engine: ${runner.machineName}` : "Render Cloud Engine"}
            </div>
          </div>
        </div>
      </Panel>

      <RunnerGate compact />

      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-[11px]",
            message.type === "success"
              ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200"
              : "border-rose-400/25 bg-rose-400/[0.07] text-rose-200"
          )}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel className="p-5">
            <SectionTitle
              title="Execution parameters"
              description="These values are sent to the local runner with the job. Defaults are prefilled."
              action={
                <Badge tone="mint">
                  <ShieldCheck className="h-3 w-3" /> local only
                </Badge>
              }
            />

            {automation.requiredInputs?.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {automation.requiredInputs.map((input) => (
                  <div key={input.name} className={input.type === "boolean" ? "sm:col-span-2" : ""}>
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
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(inputs[input.name])}
                          onChange={(e) => setInputs({ ...inputs, [input.name]: e.target.checked })}
                          className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                        />
                        {input.description || "Enable this option"}
                      </label>
                    ) : (
                      <input
                        type={input.type === "number" ? "number" : input.type === "date" ? "date" : "text"}
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
              <div className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center text-[11px] text-slate-500">
                No configurable inputs. The package launches its local workflow directly.
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-slate-800/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <Globe className="h-3 w-3" />
                Ports are allocated on this PC at runtime, never in the cloud.
              </div>
              <button onClick={handleStart} disabled={starting} className="btn btn-primary px-5">
                {starting ? <Spinner className="text-slate-950" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                {starting ? "Queuing…" : "Launch in New Tab"}
              </button>
            </div>
          </Panel>

          <div>
            <SectionTitle
              title="Runs on this PC"
              description="Scoped to the current runner; other PCs' jobs are never mixed in."
              action={<Badge tone="slate">{recentJobs.length} recent</Badge>}
            />
            <Panel className="overflow-hidden">
              {recentJobs.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={Terminal}
                    title="No runs yet"
                    description="Start this automation to see its live logs and local port."
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {recentJobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/live?jobId=${job.id}`}
                      className="row-hover flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-cyan-300">
                            {job.id.slice(-8)}
                          </span>
                          <StatusBadge status={job.status} />
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-slate-500">{job.step}</div>
                      </div>
                      <div className="hidden items-center gap-3 text-[9px] text-slate-500 sm:flex">
                        {job.allocatedPort && (
                          <span className="font-mono text-emerald-400/80">:{job.allocatedPort}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {formatDuration(job.durationSeconds)}
                        </span>
                        <span>{formatRelative(job.createdAt)}</span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-600" />
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <SectionTitle title="Execution environment" />
            <InfoRow label="Runtime" value={automation.language} />
            <InfoRow label="Browser" value={automation.requiredBrowser} />
            <InfoRow
              label="Port policy"
              value={automation.requiresLocalServer || automation.defaultPort ? "Dynamic local port" : "Direct CLI"}
            />
            <InfoRow label="Local server" value={automation.requiresLocalServer ? "Yes" : "No"} />
            <InfoRow label="Entry point" value={automation.entryPoint} mono />
            <InfoRow label="Package folder" value={automation.packageDir} mono />
            <InfoRow label="Original ZIP" value={automation.originalZip} mono />
          </Panel>

          <Panel className="p-4">
            <SectionTitle title="Verified dependencies" />
            <div className="flex flex-wrap gap-1.5">
              {(automation.dependencies || []).length ? (
                automation.dependencies.map((dependency) => (
                  <span
                    key={dependency}
                    className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1 font-mono text-[9px] text-slate-300"
                  >
                    {dependency}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-slate-500">Standard runtime only</span>
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle title="Requirements" />
            <p className="text-[11px] leading-relaxed text-slate-400">
              {automation.executionRequirements || "No additional requirements documented."}
            </p>
            <div className="mt-3 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.05] px-3 py-2.5 text-[10px] leading-relaxed text-cyan-100/80">
              The package must exist in this PC's <code className="font-mono">packages/</code> folder.
              The cloud dashboard only stores metadata and job state.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
