"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface RunnerIdentity {
  machineId: string;
  machineName: string;
  token?: string;
  cloudUrl: string;
  agentPort?: number;
  version?: string;
  pairingCode?: string;
  status: "online" | "offline" | "busy" | string;
  source: "local" | "cloud" | "paired";
  os?: string;
}

type RunnerStatus = "probing" | "connected" | "none";

interface RunnerContextValue {
  runner: RunnerIdentity | null;
  status: RunnerStatus;
  availableMachines: any[];
  cloudMismatch: boolean;
  error: string | null;
  probing: boolean;
  refresh: () => Promise<void>;
  switchMachine: (machineId: string) => void;
  pair: (code: string) => Promise<void>;
  unpair: () => void;
  startJob: (automationId: string, inputs: Record<string, any>, forceStopConflict?: boolean) => Promise<any>;
  cancelJob: (jobId: string) => Promise<any>;
  clearError: () => void;
}

const SELECTED_MACHINE_KEY = "nexus_selected_machine_v2";

const RunnerContext = createContext<RunnerContextValue | null>(null);

export function RunnerProvider({ children }: { children: React.ReactNode }) {
  const [runner, setRunner] = useState<RunnerIdentity | null>(null);
  const [availableMachines, setAvailableMachines] = useState<any[]>([]);
  const [status, setStatus] = useState<RunnerStatus>("probing");
  const [probing, setProbing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const resolveMachine = useCallback((machines: any[]): RunnerIdentity | null => {
    if (!machines || machines.length === 0) return null;
    let savedId: string | null = null;
    try {
      savedId = localStorage.getItem(SELECTED_MACHINE_KEY);
    } catch {}

    let chosen = savedId ? machines.find((m) => m.id === savedId) : null;
    if (!chosen) {
      // Prefer online non-cloud machine (user's local PC) if available
      chosen = machines.find((m) => m.status === "online" && !m.id.includes("cloud"));
    }
    if (!chosen) {
      // Fall back to any online machine (e.g. Render Cloud Engine)
      chosen = machines.find((m) => m.status === "online");
    }
    if (!chosen) {
      chosen = machines[0];
    }
    if (!chosen) return null;

    return {
      machineId: chosen.id,
      machineName: chosen.name,
      token: chosen.token || "cloud-token",
      cloudUrl: typeof window !== "undefined" ? window.location.origin : "",
      agentPort: chosen.agentPort || 3199,
      version: chosen.runnerVersion || "2.0.0",
      pairingCode: chosen.pairingCode,
      status: chosen.status || "online",
      source: chosen.id.includes("cloud") ? "cloud" : "local",
      os: chosen.os,
    };
  }, []);

  const refresh = useCallback(async () => {
    setProbing(true);
    try {
      const res = await fetch("/api/machines", { cache: "no-store" });
      const data = await res.json();
      if (!mounted.current) return;

      const list = data.machines || [];
      setAvailableMachines(list);

      const active = resolveMachine(list);
      if (active) {
        setRunner(active);
        setStatus("connected");
      } else {
        // Create fallback cloud runner identity
        const cloudRunner: RunnerIdentity = {
          machineId: "mach_render_cloud",
          machineName: "Render Cloud Engine",
          token: "render-cloud-token",
          cloudUrl: typeof window !== "undefined" ? window.location.origin : "",
          agentPort: 10000,
          version: "2.0.0",
          status: "online",
          source: "cloud",
          os: "Linux (Render Container)",
        };
        setRunner(cloudRunner);
        setStatus("connected");
      }
    } catch (err: any) {
      if (mounted.current) {
        setError(err.message);
        setStatus("none");
      }
    } finally {
      if (mounted.current) setProbing(false);
    }
  }, [resolveMachine]);

  useEffect(() => {
    mounted.current = true;
    refresh();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10_000);

    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const switchMachine = useCallback(
    (machineId: string) => {
      try {
        localStorage.setItem(SELECTED_MACHINE_KEY, machineId);
      } catch {}
      const target = availableMachines.find((m) => m.id === machineId);
      if (target) {
        setRunner({
          machineId: target.id,
          machineName: target.name,
          token: target.token || "cloud-token",
          cloudUrl: typeof window !== "undefined" ? window.location.origin : "",
          agentPort: target.agentPort || 3199,
          version: target.runnerVersion || "2.0.0",
          pairingCode: target.pairingCode,
          status: target.status || "online",
          source: target.id.includes("cloud") ? "cloud" : "local",
          os: target.os,
        });
        setStatus("connected");
      }
    },
    [availableMachines]
  );

  const pair = useCallback(
    async (code: string) => {
      setError(null);
      const res = await fetch("/api/runner/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Pairing failed");
      }
      const identity: RunnerIdentity = {
        machineId: data.machine.id,
        machineName: data.machine.name,
        token: data.token,
        cloudUrl: typeof window !== "undefined" ? window.location.origin : "",
        pairingCode: code.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
        status: data.machine.status || "online",
        source: "paired",
      };
      try {
        localStorage.setItem(SELECTED_MACHINE_KEY, data.machine.id);
      } catch {}
      setRunner(identity);
      setStatus("connected");
      refresh();
    },
    [refresh]
  );

  const unpair = useCallback(() => {
    try {
      localStorage.removeItem(SELECTED_MACHINE_KEY);
    } catch {}
    refresh();
  }, [refresh]);

  const startJob = useCallback(
    async (automationId: string, inputs: Record<string, any>, forceStopConflict = false) => {
      const payload: Record<string, any> = { inputs, forceStopConflict };
      if (runner?.machineId) {
        payload.machineId = runner.machineId;
      }
      const res = await fetch(`/api/automations/${automationId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(runner?.machineId ? { "x-machine-id": runner.machineId } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const err: any = new Error(data.error || "Could not start the automation");
        err.portConflict = data.portConflict;
        err.conflictingJob = data.conflictingJob;
        err.port = data.port;
        throw err;
      }
      return data.job;
    },
    [runner]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(runner?.machineId ? { "x-machine-id": runner.machineId } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not cancel the job");
      }
      return data.job;
    },
    [runner]
  );

  const value: RunnerContextValue = {
    runner,
    status,
    availableMachines,
    cloudMismatch: false,
    error,
    probing,
    refresh,
    switchMachine,
    pair,
    unpair,
    startJob,
    cancelJob,
    clearError: () => setError(null),
  };

  return <RunnerContext.Provider value={value}>{children}</RunnerContext.Provider>;
}

export function useRunner() {
  const ctx = useContext(RunnerContext);
  if (!ctx) throw new Error("useRunner must be used inside RunnerProvider");
  return ctx;
}
