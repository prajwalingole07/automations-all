"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Command,
  Cpu,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link2,
  Loader2,
  Menu,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Unplug,
  X,
} from "lucide-react";
import { cn, Modal, Notice } from "./ui";
import { useRunner } from "./runner-context";

const PAGE_TITLES: Record<string, { title: string; section: string }> = {
  "/dashboard": { title: "Overview", section: "Command" },
  "/automations": { title: "Automation registry", section: "Command" },
  "/live": { title: "Live runs", section: "Command" },
  "/machines": { title: "Fleet", section: "Operations" },
  "/history": { title: "History", section: "Operations" },
  "/upload": { title: "Upload package", section: "Operations" },
  "/settings": { title: "Settings", section: "Control" },
  "/admin": { title: "Admin", section: "Control" },
};

const QUICK_LINKS = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, hint: "Command center" },
  { label: "Automation registry", href: "/automations", icon: Layers, hint: "All packages" },
  { label: "Live runs", href: "/live", icon: Radio, hint: "Real-time console" },
  { label: "Fleet", href: "/machines", icon: MonitorSmartphone, hint: "Runner PCs" },
  { label: "Upload package", href: "/upload", icon: Sparkles, hint: "Scan ZIP" },
  { label: "Settings", href: "/settings", icon: SlidersHorizontal, hint: "Tokens & ports" },
];

export default function Header({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { runner, status, cloudMismatch, refresh, pair, unpair, probing } = useRunner();
  const [clock, setClock] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [automations, setAutomations] = useState<any[]>([]);
  const [cursor, setCursor] = useState(0);
  const [connectOpen, setConnectOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const page = useMemo(() => {
    if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
    if (pathname.startsWith("/automations/")) {
      return { title: "Automation detail", section: "Command" };
    }
    return { title: "Nexus", section: "Automation Hub" };
  }, [pathname]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString(undefined, { hour12: false }));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setConnectOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    setQuery("");
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 30);
    if (automations.length === 0) {
      fetch("/api/automations")
        .then((r) => r.json())
        .then((d) => setAutomations(d.automations || []))
        .catch(() => {});
    }
  }, [paletteOpen, automations.length]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const links = QUICK_LINKS.filter(
      (l) => !q || l.label.toLowerCase().includes(q) || l.hint.toLowerCase().includes(q)
    ).map((l) => ({ ...l, type: "link" as const }));
    const autos = automations
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
      .slice(0, 6)
      .map((a) => ({
        label: a.name,
        href: `/automations/${a.id}`,
        icon: Layers,
        hint: `${a.category} · ${a.language}`,
        type: "automation" as const,
      }));
    return [...links, ...autos];
  }, [query, automations]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const navigate = (href: string) => {
    setPaletteOpen(false);
    router.push(href);
  };

  const runnerLabel = runner
    ? runner.source === "local"
      ? runner.machineName
      : `${runner.machineName} (paired)`
    : status === "probing"
      ? "Detecting this PC…"
      : status === "unregistered"
        ? "Registering this PC…"
        : "Runner offline on this PC";

  const runnerColor =
    status === "connected"
      ? cloudMismatch
        ? "border-amber-400/25 bg-amber-400/10 text-amber-300 hover:bg-amber-400/15"
        : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15"
      : status === "probing" || status === "unregistered"
        ? "border-indigo-400/25 bg-indigo-400/10 text-indigo-300 hover:bg-indigo-400/15"
        : "border-rose-400/20 bg-rose-400/10 text-rose-300 hover:bg-rose-400/15";

  const handlePair = async () => {
    setPairing(true);
    setPairError(null);
    try {
      await pair(code);
      setConnectOpen(false);
      setCode("");
      await refresh();
    } catch (err: any) {
      setPairError(err.message);
    } finally {
      setPairing(false);
    }
  };

  const refetch = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-800/60 bg-[#050912]/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onMenu}
              className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-400 transition hover:text-white lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="hidden min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500 sm:flex">
              <span>{page.section}</span>
              <span className="text-slate-700">/</span>
              <span className="truncate text-slate-300">{page.title}</span>
            </div>
          </div>

          <button
            onClick={() => setPaletteOpen(true)}
            className="group flex h-9 flex-1 items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 text-left text-[11px] text-slate-500 transition hover:border-slate-700 hover:text-slate-300 sm:max-w-md"
          >
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <span className="flex-1 truncate">Search automations, runs, machines…</span>
            <span className="hidden items-center gap-1 rounded border border-slate-700/70 bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-slate-500 sm:flex">
              <Command className="h-2.5 w-2.5" /> K
            </span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1.5 font-mono text-[10px] text-slate-500 xl:flex">
              <Cpu className="h-3 w-3 text-slate-600" />
              <span suppressHydrationWarning>{clock}</span>
            </div>

            <button
              onClick={() => setConnectOpen(true)}
              className={cn(
                "flex h-8 max-w-[190px] items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold transition",
                runnerColor
              )}
              title="This browser starts jobs only on this PC"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  status === "connected"
                    ? cloudMismatch
                      ? "bg-amber-400"
                      : "animate-pulse bg-emerald-400"
                    : status === "probing" || status === "unregistered"
                      ? "animate-pulse bg-indigo-400"
                      : "bg-rose-400"
                )}
              />
              <span className="truncate">{runnerLabel}</span>
            </button>

            <div className="flex items-center gap-2 border-l border-slate-800/70 pl-2 sm:pl-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-500 text-[11px] font-bold text-white shadow-lg shadow-indigo-500/20">
                O
              </div>
              <div className="hidden leading-tight sm:block">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-white">
                  Operator <ShieldCheck className="h-3 w-3 text-cyan-300" />
                </div>
                <div className="text-[9px] uppercase tracking-wider text-slate-500">This PC</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title="This PC's automation runner"
        description="Jobs are pinned to the PC that starts them. This dashboard never runs automations in the cloud."
        width="max-w-xl"
      >
        <div className="space-y-4">
          {status === "connected" && runner ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                Connected to {runner.machineName}
              </div>
              <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-400">
                <div>machine: {runner.machineId}</div>
                <div>source: {runner.source === "local" ? "auto-detected on localhost" : "manual pairing code"}</div>
                <div>runner: v{runner.version || "2.0.0"}</div>
              </div>
            </div>
          ) : (
            <Notice tone={status === "unregistered" ? "iris" : "amber"} title={runnerLabel}>
              {status === "unregistered"
                ? "The runner is running but has not completed cloud registration yet. Wait a few seconds, then retry."
                : "Start START_AUTOMATION_HUB.bat on this PC in Cloud mode. It will register this PC and the dashboard will detect it automatically."}
            </Notice>
          )}

          {cloudMismatch && runner && (
            <Notice tone="rose" title="Runner points to a different dashboard URL">
              This PC's runner is connected to <code className="font-mono">{runner.cloudUrl}</code>, but
              you are viewing <code className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}</code>.
              Restart the runner and enter this dashboard URL, otherwise jobs will stay queued.
            </Notice>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={refetch} className="btn btn-ghost" disabled={probing}>
              {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Retry detection
            </button>
            {runner?.source === "paired" && (
              <button onClick={unpair} className="btn btn-danger">
                <Unplug className="h-3.5 w-3.5" /> Forget paired PC
              </button>
            )}
            <button onClick={() => router.push("/settings")} className="btn btn-ghost">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Setup guide
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <KeyRound className="h-3.5 w-3.5 text-cyan-300" /> Cannot auto-detect? Pair manually
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Use the 8-character code printed by the runner window (for example{" "}
              <span className="font-mono text-cyan-300">K7M2-P9QX</span>). Pairing only lets this
              browser start jobs on that PC.
            </p>
            {pairError && (
              <div className="mt-2 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
                {pairError}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code.trim()) handlePair();
                }}
                placeholder="ABCD-EFGH"
                className="input font-mono tracking-[0.18em]"
                maxLength={12}
              />
              <button
                onClick={handlePair}
                disabled={pairing || code.trim().length < 6}
                className="btn btn-primary shrink-0"
              >
                {pairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Pair
              </button>
            </div>
          </div>

          <div className="text-[10px] leading-relaxed text-slate-500">
            Each PC keeps its own runner identity, token, job queue, ports and Chrome tabs. Other
            operators opening the same dashboard link get their own runner — your jobs never run on
            their PC and theirs never run on yours.
          </div>
        </div>
      </Modal>

      {paletteOpen && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[12vh]">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPaletteOpen(false)} />
          <div className="panel relative w-full max-w-xl overflow-hidden shadow-2xl animate-fadeUp">
            <div className="flex items-center gap-2 border-b border-slate-800/70 px-4 py-3">
              <Search className="h-4 w-4 text-cyan-300" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, results.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  }
                  if (e.key === "Enter" && results[cursor]) {
                    e.preventDefault();
                    navigate(results[cursor].href);
                  }
                }}
                placeholder="Jump to a page or automation…"
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
              />
              <button
                onClick={() => setPaletteOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2">
              {results.length === 0 && (
                <div className="px-3 py-8 text-center text-xs text-slate-500">No matches found.</div>
              )}
              {results.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.href}-${index}`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => navigate(item.href)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                      cursor === index ? "bg-slate-800/70" : "hover:bg-slate-800/40"
                    )}
                  >
                    <span className="icon-tile h-8 w-8">
                      <Icon className="h-3.5 w-3.5 text-cyan-300" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-slate-100">
                        {item.label}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">{item.hint}</span>
                    </span>
                    {item.type === "automation" ? (
                      <span className="badge border-indigo-400/20 bg-indigo-400/10 text-indigo-300">
                        automation
                      </span>
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-slate-800/70 px-4 py-2 text-[9px] text-slate-600">
              <span>↑↓ navigate · ↵ open · esc close</span>
              <span className="font-mono">NEXUS COMMAND</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
