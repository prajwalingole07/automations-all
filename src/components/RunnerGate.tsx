"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, SlidersHorizontal, Unplug } from "lucide-react";
import { useRunner } from "./runner-context";
import { cn, Notice } from "./ui";

export default function RunnerGate({ compact = false }: { compact?: boolean }) {
  const { runner, status, cloudMismatch, probing, refresh, unpair } = useRunner();

  if (status === "connected" && runner && !cloudMismatch) {
    if (compact) {
      return (
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-semibold text-emerald-300">{runner.machineName}</span>
          <span className="text-slate-600">·</span>
          <span>jobs run only on this PC</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-slate-600">{runner.machineId}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <div>
            <div className="text-xs font-semibold text-emerald-200">
              This browser is bound to {runner.machineName}
            </div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-slate-300/90">
              Every job started here executes on this PC only. Other operators on the same link
              use their own runner and cannot touch your jobs.
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="chip cursor-default font-mono text-[9px]">{runner.machineId}</span>
          {runner.source === "paired" && (
            <button onClick={unpair} className="btn btn-ghost h-8 px-2.5 text-[10px]">
              <Unplug className="h-3 w-3" /> Unpair
            </button>
          )}
        </div>
      </div>
    );
  }

  if (cloudMismatch && runner) {
    return (
      <Notice
        tone="rose"
        title="Runner is connected to a different dashboard URL"
        action={
          <Link href="/settings" className="btn btn-ghost h-8 shrink-0 px-3 text-[10px]">
            <SlidersHorizontal className="h-3 w-3" /> Fix setup
          </Link>
        }
      >
        This PC's runner points to <span className="font-mono">{runner.cloudUrl}</span>. Restart it
        with this exact dashboard URL, otherwise jobs stay queued.
      </Notice>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        status === "unregistered"
          ? "border-indigo-400/25 bg-indigo-400/[0.06]"
          : "border-amber-400/25 bg-amber-400/[0.07]"
      )}
    >
      <div className="flex items-start gap-2.5">
        {status === "unregistered" ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-300" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        )}
        <div>
          <div className="text-xs font-semibold text-slate-100">
            {status === "unregistered"
              ? "Runner found on this PC — completing cloud registration…"
              : status === "probing"
                ? "Detecting the runner on this PC…"
                : "No runner detected on this PC"}
          </div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-slate-300/90">
            Start{" "}
            <code className="rounded bg-slate-900/80 px-1 py-0.5 font-mono text-[10px] text-cyan-200">
              START_AUTOMATION_HUB.bat
            </code>{" "}
            on this PC and choose <strong>Cloud dashboard + local runner</strong>. Use the runner
            button in the top bar to pair manually if auto-detection is blocked.
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={refresh} disabled={probing} className="btn btn-ghost h-8 px-3 text-[10px]">
          {probing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Retry
        </button>
        <Link href="/settings" className="btn btn-primary h-8 px-3 text-[10px]">
          Setup
        </Link>
      </div>
    </div>
  );
}
