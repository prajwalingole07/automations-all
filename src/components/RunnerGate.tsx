"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Cpu, Cloud, Laptop, RefreshCw, SlidersHorizontal, Loader2 } from "lucide-react";
import { useRunner } from "./runner-context";
import { cn } from "./ui";

export default function RunnerGate({ compact = false }: { compact?: boolean }) {
  const { runner, availableMachines, switchMachine, probing, refresh } = useRunner();

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-semibold text-emerald-300">
            {runner?.source === "cloud" ? "☁️ Render Cloud Engine" : `💻 ${runner?.machineName}`}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">Execution ready</span>
        </div>

        {availableMachines.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[9px]">Engine:</span>
            <select
              value={runner?.machineId || ""}
              onChange={(e) => switchMachine(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[9px] text-cyan-200 focus:outline-none"
            >
              {availableMachines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id.includes("cloud") ? `☁️ ${m.name}` : `💻 ${m.name}`} ({m.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 via-slate-950/50 to-indigo-950/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          {runner?.source === "cloud" ? <Cloud className="h-4.5 w-4.5" /> : <Laptop className="h-4.5 w-4.5" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">
              Active Execution Engine:{" "}
              <span className="text-cyan-300">
                {runner?.source === "cloud" ? "Render Cloud Engine (Linux Container)" : runner?.machineName}
              </span>
            </span>
            <span className="badge border-emerald-400/20 bg-emerald-400/10 text-[9px] text-emerald-300">
              Active
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {runner?.source === "cloud"
              ? "Running in Render high-performance cloud container. Automations launch in a new tab instantly."
              : `Bound to ${runner?.machineName}. Automations execute locally on your Windows PC and open Chrome.`}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {availableMachines.length > 1 && (
          <select
            value={runner?.machineId || ""}
            onChange={(e) => switchMachine(e.target.value)}
            className="rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-xs text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          >
            {availableMachines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id.includes("cloud") ? `☁️ ${m.name}` : `💻 ${m.name}`}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={refresh}
          disabled={probing}
          className="btn btn-ghost h-8 px-2.5 text-[10px]"
          title="Refresh runner fleet"
        >
          {probing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
        <Link href="/settings" className="btn btn-ghost h-8 px-2.5 text-[10px]">
          <SlidersHorizontal className="h-3 w-3" /> Setup
        </Link>
      </div>
    </div>
  );
}
