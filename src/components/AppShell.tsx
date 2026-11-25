"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { RunnerProvider } from "./runner-context";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => {});
  }, []);

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
            <div className="animate-fadeIn">{children}</div>
          </main>

          <footer className="mt-auto border-t border-slate-800/50 px-6 py-4 text-[9px] text-slate-600 lg:px-8">
            <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 sm:flex-row">
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-400">NEXUS Automation Hub</span> ·{" "}
                <span className="text-cyan-400">Render Cloud Web Service</span> ·{" "}
                <span>v2.0.0</span>
              </span>
              <span className="font-mono text-slate-500">
                host: render.com · port: 10000
              </span>
            </div>
          </footer>
        </div>
      </div>
    </RunnerProvider>
  );
}
