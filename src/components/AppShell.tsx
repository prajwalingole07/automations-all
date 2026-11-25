"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { RunnerProvider } from "./runner-context";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [warningDismissed, setWarningDismissed] = useState(true);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      setWarningDismissed(sessionStorage.getItem("nexus_cloud_warning") === "1");
    } catch {
      setWarningDismissed(false);
    }
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => {});
  }, []);

  const isCloudHost =
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  const showPersistenceWarning =
    isCloudHost && health?.persistence === "memory" && !warningDismissed;

  return (
    <RunnerProvider>
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 z-0 grid-overlay opacity-50" />
      <div className="pointer-events-none fixed -left-40 top-[-10%] z-0 h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-[120px]" />
      <div className="pointer-events-none fixed -right-32 top-[12%] z-0 h-[380px] w-[380px] rounded-full bg-cyan-400/10 blur-[110px]" />
      <div className="pointer-events-none fixed bottom-[-20%] left-[35%] z-0 h-[420px] w-[420px] rounded-full bg-emerald-400/[0.06] blur-[130px]" />

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="relative z-10 flex min-h-screen flex-col lg:pl-[264px]">
        <Header onMenu={() => setMenuOpen(true)} />

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          {showPersistenceWarning && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div>
                  <div className="text-xs font-semibold text-amber-200">
                    Cloud persistence is not configured
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-300/90">
                    Jobs and runner heartbeats will disappear after a cold start. Add{" "}
                    <code className="rounded bg-slate-900/80 px-1 py-0.5 font-mono text-[10px] text-amber-200">
                      SUPABASE_URL
                    </code>{" "}
                    and{" "}
                    <code className="rounded bg-slate-900/80 px-1 py-0.5 font-mono text-[10px] text-amber-200">
                      SUPABASE_SERVICE_ROLE_KEY
                    </code>{" "}
                    in Vercel, then run the included SQL schema.
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/settings"
                  className="btn btn-ghost h-8 px-3 text-[10px]"
                  onClick={() => setWarningDismissed(true)}
                >
                  Setup <ArrowRight className="h-3 w-3" />
                </Link>
                <button
                  onClick={() => {
                    setWarningDismissed(true);
                    try {
                      sessionStorage.setItem("nexus_cloud_warning", "1");
                    } catch {}
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="animate-fadeIn">{children}</div>
        </main>

        <footer className="mt-auto border-t border-slate-800/50 px-6 py-4 text-[9px] text-slate-600 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 sm:flex-row">
            <span>
              NEXUS Automation Hub · <span className="text-slate-500">cloud control plane</span> ·{" "}
              <span className="text-slate-500">local execution</span>
            </span>
            <span className="font-mono">
              {health?.persistence ? `storage: ${health.persistence}` : "storage: checking"}
              {health?.environment ? ` · ${health.environment}` : ""}
            </span>
          </div>
        </footer>
      </div>
    </div>
    </RunnerProvider>
  );
}
