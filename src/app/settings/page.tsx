"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  ClipboardCopy,
  Cloud,
  Cpu,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Unplug,
} from "lucide-react";
import { useRunner } from "@/components/runner-context";
import RunnerGate from "@/components/RunnerGate";
import {
  Badge,
  InfoRow,
  Notice,
  PageHeader,
  Panel,
  SectionTitle,
  StatusBadge,
  cn,
} from "@/components/ui";

function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code
        className={cn(
          "min-w-0 flex-1 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] text-cyan-200",
          mono && "font-mono"
        )}
      >
        {value}
      </code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="btn btn-ghost h-8 shrink-0 px-2.5 text-[9px]"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <ClipboardCopy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { runner, status, cloudMismatch, refresh, probing, unpair } = useRunner();
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  const persistence =
    health?.persistence === "supabase"
      ? "Supabase (persistent)"
      : health?.persistence === "file"
        ? "Local JSON file"
        : health?.persistence === "memory"
          ? "In-memory (ephemeral)"
          : "checking…";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Control · system"
        title="Runner & cloud setup"
        description="This deployment is a cloud control plane. Automations execute only on the PC whose browser starts them, using the local runner."
        actions={
          <button onClick={refresh} disabled={probing} className="btn btn-ghost">
            {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Detect runner
          </button>
        }
      />

      <RunnerGate />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-4">
          <SectionTitle
            title="This PC"
            description="The browser starts jobs only on this machine."
            action={
              <StatusBadge
                status={
                  status === "connected" && !cloudMismatch
                    ? "online"
                    : status === "unregistered"
                      ? "starting"
                      : "offline"
                }
              />
            }
          />

          <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <Cpu className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">
                  {runner?.machineName || "No runner on this PC"}
                </div>
                <div className="truncate font-mono text-[9px] text-slate-500">
                  {runner?.machineId || "start START_AUTOMATION_HUB.bat"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <InfoRow label="Connection" value={runner?.source === "local" ? "auto-detected (localhost)" : runner?.source === "paired" ? "manual pairing code" : "—"} />
            <InfoRow label="Runner version" value={runner?.version ? `v${runner.version}` : "—"} />
            <InfoRow label="Agent port" value={runner?.agentPort ? String(runner.agentPort) : "3199"} mono />
            <InfoRow label="Cloud target" value={runner?.cloudUrl || health?.environment || "—"} mono />
            <InfoRow
              label="Pairing code"
              value={
                runner?.pairingCode
                  ? `${runner.pairingCode.slice(0, 4)}-${runner.pairingCode.slice(4)}`
                  : "shown in the runner window"
              }
              mono
            />
          </div>

          {cloudMismatch && runner && (
            <Notice tone="rose" title="Wrong dashboard URL">
              Restart the runner and enter <code className="font-mono">{health?.environment === "vercel" ? "this Vercel URL" : "this URL"}</code>.
              It currently points to <code className="font-mono">{runner.cloudUrl}</code>.
            </Notice>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={refresh} disabled={probing} className="btn btn-ghost">
              {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Retry detection
            </button>
            {runner?.source === "paired" && (
              <button onClick={unpair} className="btn btn-danger">
                <Unplug className="h-3.5 w-3.5" /> Forget this pairing
              </button>
            )}
          </div>
        </Panel>

        <Panel className="p-4">
          <SectionTitle title="Cloud control plane" description="Live state of this dashboard deployment." />
          <InfoRow label="Health" value={health?.status || "checking"} />
          <InfoRow label="Environment" value={health?.environment || "—"} />
          <InfoRow
            label="Persistence"
            value={
              <span
                className={cn(
                  health?.persistence === "supabase"
                    ? "text-emerald-300"
                    : health?.persistence === "memory"
                      ? "text-rose-300"
                      : "text-amber-300"
                )}
              >
                {persistence}
              </span>
            }
          />
          <InfoRow label="Runner secret" value={health?.runnerSecretConfigured ? "configured" : "missing"} />
          <InfoRow label="Manual pairing" value={health?.pairingEnabled ? "enabled" : "disabled"} />
          <InfoRow label="Version" value={health?.version || "2.0.0"} mono />
          <InfoRow
            label="Counts"
            value={
              health?.counts
                ? `${health.counts.automations} automations · ${health.counts.onlineMachines}/${health.counts.machines} PCs · ${health.counts.activeJobs} active`
                : "—"
            }
          />

          {health?.persistence === "memory" && (
            <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5 text-[10px] leading-relaxed text-amber-100">
              This deployment has no database. Jobs, machines and logs are kept in
              temporary cloud memory, so they reset when Vercel sleeps or redeploys.
              The PC runner reconnects automatically within a few seconds. Use the full
              Supabase build if you need permanent history.
            </div>
          )}
        </Panel>
      </div>

      <Panel className="p-4">
        <SectionTitle
          title="Vercel deployment checklist"
          description="Four steps. No database or environment variables required."
          action={<Badge tone="iris">zero-config</Badge>}
        />
        <div className="grid gap-3 md:grid-cols-2">
          {[
            {
              icon: Cloud,
              title: "1 · Deploy the dashboard",
              body: "Open vercel.com/drop in a browser, drop AUTOMATION_HUB_VERCEL_NO_DB.zip, name the project and press Deploy. Vercel detects Next.js and builds it.",
              code: "vercel.com/drop",
            },
            {
              icon: KeyRound,
              title: "2 · Copy the live URL",
              body: "When the build finishes, Vercel shows a URL like the example below. Keep it; every PC uses the same dashboard URL.",
              code: "https://your-project.vercel.app",
            },
            {
              icon: Terminal,
              title: "3 · Start the runner on this PC",
              body: "Extract the full Automation Hub ZIP, run START_AUTOMATION_HUB.bat, choose option 1, paste the URL and press Enter for the default secret.",
              code: "START_AUTOMATION_HUB.bat",
            },
            {
              icon: Cpu,
              title: "4 · Run an automation",
              body: "Press Run on the dashboard. The job is pinned to this PC, opens Chrome locally, and streams logs through the temporary cloud memory.",
              code: "Dashboard → Run",
            },
          ].map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-white">
                  <Icon className="h-3.5 w-3.5 text-cyan-300" /> {step.title}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{step.body}</p>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-800 bg-[#04070e] p-2 font-mono text-[9px] leading-relaxed text-cyan-200/90">
                  {step.code}
                </pre>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-4">
          <SectionTitle title="Execution policy" />
          <InfoRow label="Port range" value="3100 – 3998 on the runner PC" mono />
          <InfoRow label="Discovery agent" value="127.0.0.1:3199 (CORS loopback only)" mono />
          <InfoRow label="Job routing" value="pinned by machineId + machine token" />
          <InfoRow label="Cancellation" value="polled by runner, kills the process tree" />
          <InfoRow label="Browser" value="Chrome / Edge, one window per job" />
          <InfoRow label="Cloud execution" value="disabled by design" />
        </Panel>

        <Panel className="p-4">
          <SectionTitle title="Security model" />
          <p className="text-[10.5px] leading-relaxed text-slate-400">
            Runner registration uses a shared secret that never leaves your
            Vercel environment and the runner PC. After registration, each machine receives its own
            random control token. Job creation, cancellation, polling and log updates all verify
            that token, so one operator cannot start or stop jobs on another PC.
          </p>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 font-mono text-[9px] text-slate-400">
              RUNNER_SECRET_TOKEN = shared registration secret
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 font-mono text-[9px] text-slate-400">
              machines.token = per-PC random control token
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 font-mono text-[9px] text-slate-400">
              pairing_code = 8-char manual fallback, rate-limited
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.05] px-3 py-2 text-[10px] text-cyan-100/80">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The service-role key stays server-side. Browsers never receive it.
          </div>
        </Panel>
      </div>

      <Panel className="p-4">
        <SectionTitle
          title="Runner identity reset"
          description="Only needed if a PC was cloned from a disk image."
          action={<Badge tone="amber">advanced</Badge>}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-relaxed text-slate-400">
            Delete <code className="font-mono text-cyan-200">runner/state.json</code> on that PC and
            restart the launcher. It gets a fresh machine ID, control token and pairing code; the old
            entry becomes stale and can be ignored.
          </p>
          <div className="flex shrink-0 gap-2">
            <div className="chip cursor-default">
              <Server className="h-3 w-3" /> agent-only
            </div>
            <div className="chip cursor-default">
              <Link2 className="h-3 w-3" /> loopback CORS
            </div>
            <div className="chip cursor-default">
              <SlidersHorizontal className="h-3 w-3" /> {"<"} 8 jobs
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
