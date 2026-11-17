"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CloudUpload,
  Cpu,
  History,
  LayoutDashboard,
  Layers,
  MonitorSmartphone,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import { cn } from "./ui";

const GROUPS = [
  {
    label: "Command",
    items: [
      { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { name: "Automations", href: "/automations", icon: Layers, countKey: "automations" },
      { name: "Live runs", href: "/live", icon: Radio, live: true, countKey: "jobs" },
    ],
  },
  {
    label: "Operations",
    items: [
      { name: "Fleet", href: "/machines", icon: MonitorSmartphone, countKey: "machines" },
      { name: "History", href: "/history", icon: History },
      { name: "Upload package", href: "/upload", icon: CloudUpload },
    ],
  },
  {
    label: "Control",
    items: [
      { name: "Settings", href: "/settings", icon: SlidersHorizontal },
      { name: "Admin", href: "/admin", icon: ShieldCheck },
    ],
  },
] as const;

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [machines, setMachines] = useState<any[]>([]);
  const [counts, setCounts] = useState({ automations: 0, jobs: 0, machines: 0 });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [mRes, aRes, jRes] = await Promise.all([
          fetch("/api/machines"),
          fetch("/api/automations"),
          fetch("/api/jobs"),
        ]);
        const [mData, aData, jData] = await Promise.all([mRes.json(), aRes.json(), jRes.json()]);
        if (!alive) return;
        const machineList = mData.machines || [];
        setMachines(machineList);
        setCounts({
          automations: (aData.automations || []).length,
          machines: machineList.filter((m: any) => m.status === "online").length,
          jobs: (jData.jobs || []).filter((j: any) =>
            ["Running", "Starting", "Queued"].includes(j.status)
          ).length,
        });
      } catch {
        /* offline is surfaced in the header */
      }
    };
    load();
    const timer = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const online = useMemo(() => machines.filter((m) => m.status === "online"), [machines]);
  const primary = online[0];
  const isCloud =
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-slate-800/70 bg-[#060b15]/95 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 pb-5 pt-6">
          <Link href="/dashboard" className="group flex items-center gap-3" onClick={onClose}>
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/25 bg-gradient-to-br from-emerald-300 via-cyan-400 to-indigo-500 shadow-lg shadow-cyan-500/20">
              <Zap className="h-5 w-5 text-slate-950" strokeWidth={2.6} />
              <span className="absolute -inset-1 -z-10 rounded-2xl bg-cyan-400/20 blur-xl transition group-hover:bg-cyan-400/30" />
            </div>
            <div>
              <div className="text-[15px] font-black tracking-[0.14em] text-white">NEXUS</div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Automation Hub
              </div>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-6">
              <div className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.24em] text-slate-600">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const count =
                    "countKey" in item && item.countKey
                      ? counts[item.countKey as keyof typeof counts]
                      : undefined;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-[12px] font-medium transition-all",
                        active
                          ? "bg-gradient-to-r from-cyan-400/12 to-indigo-400/5 text-white"
                          : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-100"
                      )}
                    >
                      {active && (
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-emerald-300 to-cyan-400" />
                      )}
                      <span className="flex items-center gap-2.5">
                        <Icon
                          className={cn(
                            "h-[15px] w-[15px] transition",
                            active
                              ? "text-cyan-300"
                              : "text-slate-500 group-hover:text-slate-300"
                          )}
                        />
                        {item.name}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {"live" in item && item.live && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          </span>
                        )}
                        {typeof count === "number" && count > 0 && (
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold",
                              active
                                ? "bg-cyan-400/15 text-cyan-200"
                                : "bg-slate-800 text-slate-400"
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mx-3 mb-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <Cpu className="h-3.5 w-3.5 text-cyan-300" /> Local runner
            </span>
            <span
              className={cn(
                "badge",
                primary
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                  : "border-rose-400/20 bg-rose-400/10 text-rose-300"
              )}
            >
              {primary ? "online" : "offline"}
            </span>
          </div>
          <div className="mt-2 truncate text-[11px] font-medium text-slate-200">
            {primary ? primary.name : "No PC connected"}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-slate-500">
            <span>{primary ? "Polling for jobs" : "Run START_AUTOMATION_HUB.bat"}</span>
            <span className="font-mono">{online.length}/{machines.length || 0}</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 border-t border-slate-800/60 pt-2">
            <Activity className="h-3 w-3 text-indigo-300" />
            <span className="text-[9px] font-medium uppercase tracking-wider text-slate-500">
              {isCloud ? "Cloud control plane" : "Local control plane"}
            </span>
          </div>
        </div>

        <div className="border-t border-slate-800/60 px-5 py-3 text-[9px] text-slate-600">
          <span className="font-mono">v2.0.0</span> · Hybrid execution
        </div>
      </aside>
    </>
  );
}
