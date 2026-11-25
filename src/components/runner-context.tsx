"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface RunnerIdentity {
  machineId: string;
  machineName: string;
  token: string;
  cloudUrl: string;
  agentPort?: number;
  version?: string;
  pairingCode?: string;
  source: "local" | "paired";
}

type RunnerStatus = "probing" | "connected" | "unregistered" | "none";

interface RunnerContextValue {
  runner: RunnerIdentity | null;
  status: RunnerStatus;
  cloudMismatch: boolean;
  error: string | null;
  probing: boolean;
  refresh: () => Promise<void>;
  pair: (code: string) => Promise<void>;
  unpair: () => void;
  startJob: (automationId: string, inputs: Record<string, any>) => Promise<any>;
  cancelJob: (jobId: string) => Promise<any>;
  clearError: () => void;
}

const PIN_KEY = "nexus_pinned_runner_v1";
const PROBE_PORTS = [3199, 3200, 3201, 3202, 3203, 3204, 3205, 3206, 3207, 3208, 3209];

const RunnerContext = createContext<RunnerContextValue | null>(null);

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function cloudUrlsMatch(dashboardOrigin: string, runnerCloudUrl: string) {
  try {
    const dashboard = new URL(dashboardOrigin);
    const runner = new URL(runnerCloudUrl);
    if (isLoopback(dashboard.hostname)) return isLoopback(runner.hostname);
    return runner.origin === dashboard.origin;
  } catch {
    return false;
  }
}

async function fetchIdentity(port: number): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/identity`, {
      cache: "no-store",
      signal: controller.signal,
      mode: "cors",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok && data?.machineId ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readPinned(): Omit<RunnerIdentity, "source"> | null {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.machineId && parsed?.token) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function RunnerProvider({ children }: { children: React.ReactNode }) {
  const [runner, setRunner] = useState<RunnerIdentity | null>(null);
  const [status, setStatus] = useState<RunnerStatus>("probing");
  const [probing, setProbing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Omit<RunnerIdentity, "source"> | null>(null);
  const mounted = useRef(true);

  const applyLocal = useCallback((identity: any) => {
    setRunner({
      machineId: identity.machineId,
      machineName: identity.machineName,
      token: identity.token || "",
      cloudUrl: identity.cloudUrl || "",
      agentPort: identity.agentPort,
      version: identity.version,
      pairingCode: identity.pairingCode,
      source: "local",
    });
    setStatus(identity.token ? "connected" : "unregistered");
  }, []);

  const probe = useCallback(async () => {
    setProbing(true);
    // The runner agent normally lives on 3199. Probe that first so other
    // localhost services on 3200-3209 are not contacted unnecessarily.
    const primary = await fetchIdentity(PROBE_PORTS[0]);
    if (primary) return primary;
    const results = await Promise.all(PROBE_PORTS.slice(1).map((port) => fetchIdentity(port)));
    return results.find(Boolean) || null;
  }, []);

  const refresh = useCallback(async () => {
    const local = await probe();
    if (!mounted.current) return;

    if (local) {
      applyLocal(local);
      setProbing(false);
      return;
    }

    const stored = readPinned();
    if (stored) {
      try {
        const res = await fetch("/api/machines", { cache: "no-store" });
        const data = await res.json();
        const machine = (data.machines || []).find((m: any) => m.id === stored.machineId);
        if (machine) {
          setPinned(stored);
          setRunner({ ...stored, machineName: machine.name, source: "paired" });
          setStatus("connected");
          setProbing(false);
          return;
        }
      } catch {
        /* fall through to unpaired */
      }
      try {
        localStorage.removeItem(PIN_KEY);
      } catch {}
      setPinned(null);
    }

    setRunner(null);
    setStatus("none");
    setProbing(false);
  }, [applyLocal, probe]);

  useEffect(() => {
    mounted.current = true;
    const stored = readPinned();
    if (stored) setPinned(stored);
    refresh();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

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
      const identity = {
        machineId: data.machine.id,
        machineName: data.machine.name,
        token: data.token,
        cloudUrl: window.location.origin,
        pairingCode: code.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
      };
      try {
        localStorage.setItem(PIN_KEY, JSON.stringify(identity));
      } catch {}
      setPinned(identity);
      setRunner({ ...identity, source: "paired" });
      setStatus("connected");
    },
    []
  );

  const unpair = useCallback(() => {
    try {
      localStorage.removeItem(PIN_KEY);
    } catch {}
    setPinned(null);
    setRunner(null);
    setStatus("none");
    refresh();
  }, [refresh]);

  const startJob = useCallback(
    async (automationId: string, inputs: Record<string, any>) => {
      if (!runner) throw new Error("No runner connected to this PC");
      if (!runner.token) throw new Error("Runner is still registering. Wait a few seconds and retry.");
      const res = await fetch(`/api/automations/${automationId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-machine-id": runner.machineId,
          "x-machine-token": runner.token,
        },
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not start the automation");
      }
      return data.job;
    },
    [runner]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      if (!runner) throw new Error("No runner connected to this PC");
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-machine-id": runner.machineId,
          "x-machine-token": runner.token,
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

  const cloudMismatch = useMemo(() => {
    if (!runner || runner.source !== "local" || !runner.cloudUrl) return false;
    return !cloudUrlsMatch(window.location.origin, runner.cloudUrl);
  }, [runner]);

  const value: RunnerContextValue = {
    runner,
    status,
    cloudMismatch,
    error,
    probing,
    refresh,
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
