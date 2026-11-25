"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Download,
  ExternalLink,
  Filter,
  Play,
  Search,
  Sparkles,
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

const CATEGORIES = [
  "All",
  "Engineering Admissions",
  "Choice Filling",
  "Data Extraction",
  "Alerts & Monitoring",
  "Document Processing",
];

export default function AutomationsPage() {
  const { startJob } = useRunner();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/automations", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setAutomations(data.automations || []))
      .catch(() => {});
  }, []);

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
        text: `Launched "${automation.name}"! Opening execution console in new tab.`,
      });
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
      <PageHeader
        eyebrow="Automation catalog"
        title="Automations & Production Packages"
        description="All 7 pre-configured MHT-CET, CAP round, and data processing automation packages. Launch directly in a new tab."
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
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-xs",
            message.type === "success"
              ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200"
              : "border-rose-400/25 bg-rose-400/[0.07] text-rose-200"
          )}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
          {message.text}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Pills */}
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

        {/* Search input */}
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
          const isStarting = startingId === automation.id;
          return (
            <div
              key={automation.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 backdrop-blur-sm transition hover:border-cyan-500/40 hover:bg-slate-900/50 hover:shadow-xl hover:shadow-cyan-500/5"
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
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white hover:text-cyan-200">
                    {automation.name}
                  </h3>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-400">
                    {automation.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2 border-t border-slate-800/60 pt-4">
                {/* Launch in New Tab Button */}
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
                  <span>{isStarting ? "Queuing…" : "Launch in New Tab"}</span>
                  <ExternalLink className="h-3 w-3 text-cyan-400/60" />
                </button>

                {/* Configure in New Tab Link */}
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
