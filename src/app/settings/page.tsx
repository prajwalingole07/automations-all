"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  ClipboardCopy,
  Cloud,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Laptop,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Zap,
} from "lucide-react";
import { useRunner } from "@/components/runner-context";
import RunnerGate from "@/components/RunnerGate";
import {
  Badge,
  InfoRow,
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
  const { runner, availableMachines, switchMachine, refresh, probing } = useRunner();
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  const downloadBat = () => {
    window.location.href = "/api/download/start-bat";
  };

  const cloudUrl = typeof window !== "undefined" ? window.location.origin : "https://automations-all-4.onrender.com";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Control · Settings"
        title="Render Cloud & Runner Configuration"
        description="Manage your Render web service, switch execution runners, and download the direct Windows launcher script."
        actions={
          <button onClick={downloadBat} className="btn btn-primary">
            <Download className="h-3.5 w-3.5" />
            <span>Download START_AUTOMATION.bat</span>
          </button>
        }
      />

      <RunnerGate />

      {/* Direct Windows Launcher Card */}
      <Panel className="relative overflow-hidden p-6 border-cyan-500/30 bg-gradient-to-r from-slate-950 via-[#07101e] to-indigo-950/30">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="badge border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                <Laptop className="h-3.5 w-3.5" /> Windows Direct Runner
              </span>
              <span className="font-mono text-[10px] text-slate-500">START_AUTOMATION.bat</span>
            </div>
            <h2 className="text-lg font-bold text-white">Run Automations Directly on Your Windows PC</h2>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
              Download this batch file to your PC. Double-clicking it automatically connects your computer to this Render hub, launches Chrome to the dashboard, and lets you run Playwright automations locally with browser tabs.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={downloadBat}
              className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500 to-indigo-600 px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110"
            >
              <Download className="h-4 w-4" />
              <span>Download .BAT File</span>
            </button>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-800/80 pt-4">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Target Render Cloud Hub URL:
          </label>
          <div className="mt-1.5 max-w-xl">
            <CopyField value={cloudUrl} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Active Engine Card */}
        <Panel className="p-4">
          <SectionTitle
            title="Active Execution Engine"
            description="The runner currently selected for your automation jobs."
            action={
              <StatusBadge status="online" />
            }
          />

          <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                {runner?.source === "cloud" ? <Cloud className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">
                  {runner?.source === "cloud" ? "Render Cloud Engine" : runner?.machineName}
                </div>
                <div className="truncate font-mono text-[9px] text-slate-500">
                  {runner?.machineId || "mach_render_cloud"}
                </div>
              </div>
              <span className="badge border-emerald-400/20 bg-emerald-400/10 text-emerald-300 text-[9px]">
                Connected
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <InfoRow label="Engine Type" value={runner?.source === "cloud" ? "Render Linux Docker Container" : "Local Windows PC Runner"} />
            <InfoRow label="Operating System" value={runner?.os || "Linux x86_64"} />
            <InfoRow label="Version" value={runner?.version ? `v${runner.version}` : "v2.0.0"} mono />
            <InfoRow label="Hub Target" value={cloudUrl} mono />
          </div>

          {availableMachines.length > 1 && (
            <div className="mt-4 border-t border-slate-800/60 pt-3">
              <label className="text-[10px] font-semibold text-slate-400">Switch Execution Engine:</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {availableMachines.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => switchMachine(m.id)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                      runner?.machineId === m.id
                        ? "border border-cyan-400/30 bg-cyan-400/15 text-cyan-200"
                        : "border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                    )}
                  >
                    {m.id.includes("cloud") ? `☁️ ${m.name}` : `💻 ${m.name}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Render Cloud Control Plane Info */}
        <Panel className="p-4">
          <SectionTitle
            title="Render Cloud Web Service"
            description="Live status of the cloud container on Render.com."
          />
          <div className="space-y-1">
            <InfoRow label="Deployment Host" value="Render.com" />
            <InfoRow label="Container Port" value="10000 (Render Dynamic Port)" mono />
            <InfoRow label="Service Status" value={<span className="text-emerald-300 font-semibold">Live & Healthy</span>} />
            <InfoRow label="Node Runtime" value="Node.js 20 (Bookworm)" />
            <InfoRow label="Python Runtime" value="Python 3.11 with pandas, openpyxl, pdfplumber" />
            <InfoRow label="Browser Binaries" value="Playwright Chromium 159.0" />
            <InfoRow label="Storage Mode" value="Persistent JSON File" />
          </div>

          <div className="mt-5 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 text-[11px] text-slate-400 leading-relaxed">
            <div className="font-semibold text-white mb-1">💡 How Execution Works:</div>
            When you click <strong className="text-cyan-300">"Launch in New Tab"</strong>, the job opens in a new browser tab with real-time logs and progress. If a local web server is started, a button will appear to open the automation interface directly.
          </div>
        </Panel>
      </div>
    </div>
  );
}
