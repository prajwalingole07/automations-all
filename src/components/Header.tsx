"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Cloud,
  Cpu,
  Download,
  ExternalLink,
  Laptop,
  Layers,
  LayoutDashboard,
  Loader2,
  Menu,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "./ui";
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
  const { runner, availableMachines, switchMachine, refresh, probing } = useRunner();
  const [clock, setClock] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [automations, setAutomations] = useState<any[]>([]);
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const downloadBat = () => {
    window.location.href = "/api/download/start-bat";
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-[#060b15]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        {/* Left: Mobile Menu & Breadcrumbs */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenu}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] font-bold uppercase tracking-widest text-slate-500 sm:inline-block">
              {page.section}
            </span>
            <span className="hidden text-slate-700 sm:inline-block">/</span>
            <h1 className="text-sm font-semibold tracking-tight text-white">{page.title}</h1>
          </div>

          {/* Render Cloud Badge */}
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1 text-[10px] md:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-semibold text-emerald-300">Render Cloud</span>
            <span className="text-slate-600">·</span>
            <span className="font-mono text-slate-400">Live</span>
          </div>
        </div>

        {/* Right: Search, Engine Switcher, Download BAT button */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Engine Selector Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 px-2.5 py-1.5">
            {runner?.source === "cloud" ? (
              <Cloud className="h-3.5 w-3.5 text-cyan-300" />
            ) : (
              <Laptop className="h-3.5 w-3.5 text-emerald-300" />
            )}
            <select
              value={runner?.machineId || ""}
              onChange={(e) => switchMachine(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none"
            >
              {availableMachines.length > 0 ? (
                availableMachines.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                    {m.id.includes("cloud") ? `☁️ ${m.name}` : `💻 ${m.name}`}
                  </option>
                ))
              ) : (
                <option value="mach_render_cloud" className="bg-slate-900 text-slate-200">
                  ☁️ Render Cloud Engine
                </option>
              )}
            </select>
          </div>

          {/* Download START_AUTOMATION.bat Button */}
          <button
            onClick={downloadBat}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/15 to-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 shadow-sm transition hover:border-cyan-400/50 hover:bg-cyan-500/25"
            title="Download Windows direct launcher script"
          >
            <Download className="h-3.5 w-3.5 text-cyan-300" />
            <span className="hidden sm:inline">Download</span>
            <span className="font-mono text-[11px] text-cyan-100">START_AUTOMATION.bat</span>
          </button>

          {/* Quick Search trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 lg:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
            <kbd className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[9px] font-mono text-slate-500">
              ⌘K
            </kbd>
          </button>

          {/* Live Clock */}
          <div className="hidden font-mono text-xs text-slate-500 xl:block">{clock}</div>
        </div>
      </header>

      {/* Global Command Palette Modal */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-20 backdrop-blur-md"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Search className="h-4 w-4 text-cyan-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search automations, runs, docs..."
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {QUICK_LINKS.map((item) => (
                <button
                  key={item.href}
                  onClick={() => {
                    setPaletteOpen(false);
                    router.push(item.href);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <item.icon className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{item.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
