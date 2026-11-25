"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Cpu,
  KeyRound,
  LockKeyhole,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { ExecutionJob, Machine, User } from "@/lib/types";
import {
  Badge,
  EmptyState,
  InfoRow,
  Notice,
  PageHeader,
  Panel,
  SectionTitle,
  Spinner,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { formatRelative } from "@/lib/format";

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [usersRes, machinesRes, jobsRes, healthRes] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/machines", { cache: "no-store" }),
        fetch("/api/jobs?limit=300", { cache: "no-store" }),
        fetch("/api/health", { cache: "no-store" }),
      ]);
      const [usersData, machinesData, jobsData, healthData] = await Promise.all([
        usersRes.json(),
        machinesRes.json(),
        jobsRes.json(),
        healthRes.json(),
      ]);
      if (usersData.users) setUsers(usersData.users);
      if (machinesData.machines) setMachines(machinesData.machines);
      if (jobsData.jobs) setJobs(jobsData.jobs);
      setHealth(healthData);
    } catch {
      /* surfaced through empty states */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, []);

  const online = useMemo(() => machines.filter((machine) => machine.status === "online"), [machines]);
  const activeJobs = useMemo(
    () => jobs.filter((job) => ["Queued", "Starting", "Running"].includes(job.status)),
    [jobs]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control · governance"
        title="Admin & isolation"
        description="Operators, runner PCs, and the guarantees that keep each person's automations private to the PC that started them."
        actions={
          <>
            <button onClick={load} className="btn btn-ghost">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <Link href="/settings" className="btn btn-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Setup
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Operators"
          value={users.length}
          hint="Accounts with dashboard access"
          icon={Users}
          tone="iris"
          progress={100}
        />
        <StatCard
          label="Runner PCs"
          value={`${online.length}/${machines.length}`}
          hint="Online / registered"
          icon={MonitorSmartphone}
          tone="aqua"
          progress={machines.length ? (online.length / machines.length) * 100 : 0}
        />
        <StatCard
          label="Active jobs"
          value={activeJobs.length}
          hint="Isolated per machine"
          icon={Activity}
          tone="mint"
          progress={activeJobs.length ? 70 : 0}
        />
        <StatCard
          label="Persistence"
          value={health?.persistence || "—"}
          hint={health?.environment === "vercel" ? "Vercel control plane" : "Self-hosted control plane"}
          icon={Cpu}
          tone="amber"
          progress={health?.persistence === "supabase" ? 100 : 45}
        />
      </div>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            <Users className="h-3.5 w-3.5 text-cyan-300" /> Operators
          </div>
          <Badge tone="slate">{users.length} accounts</Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-xs text-slate-400">
            <Spinner className="mr-2" /> Loading operators…
          </div>
        ) : users.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
              title="No operators in the registry"
              description="Seed users are created on first boot from data/db.json. Reload the dashboard after the control plane initialises."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[11px]">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-semibold">Operator</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Job access</th>
                  <th className="px-4 py-3 font-semibold">Runs</th>
                  <th className="px-4 py-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {users.map((user) => {
                  const userJobs = jobs.filter((job) => job.userId === user.id).length;
                  return (
                    <tr key={user.id} className="row-hover">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-500 text-[10px] font-bold text-white">
                            {user.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-100">{user.name}</div>
                            <div className="truncate font-mono text-[9px] text-slate-500">{user.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge tone={user.role === "admin" ? "iris" : "slate"}>
                          {user.role === "admin" && <ShieldCheck className="h-3 w-3" />}
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {user.role === "admin" ? "Fleet visibility + own jobs" : "Own PC's jobs only"}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">{userJobs}</td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge status="active" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-4">
          <SectionTitle
            title="Isolation guarantees"
            description="Why two operators can use one Vercel link without interference."
          />
          <div className="space-y-2">
            {[
              {
                icon: KeyRound,
                title: "Per-PC identity and token",
                body: "Each runner generates its own machineId, random control token and pairing code on first launch, stored only in runner/state.json on that PC.",
              },
              {
                icon: LockKeyhole,
                title: "Jobs are pinned at creation",
                body: "Starting a job requires this browser's machine token. The job row stores that machineId, and only that runner may claim it.",
              },
              {
                icon: ShieldCheck,
                title: "Cross-PC actions are rejected",
                body: "Cancel and update requests verify the caller's machine token matches the job's machine. A different PC receives 403.",
              },
              {
                icon: MonitorSmartphone,
                title: "Local ports and browsers",
                body: "Every run allocates a free port on the executing PC and opens its own Chrome window. Nothing is shared across machines.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-2.5 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2.5"
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                  <div>
                    <div className="text-[10.5px] font-semibold text-slate-100">{item.title}</div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-4">
          <SectionTitle title="Fleet snapshot" description="Registered runners across all operators." />
          {machines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-[10.5px] text-slate-500">
              No runner PCs have registered yet.
            </div>
          ) : (
            <div className="space-y-2">
              {machines.slice(0, 6).map((machine) => (
                <div
                  key={machine.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-slate-100">{machine.name}</div>
                    <div className="truncate font-mono text-[9px] text-slate-500">
                      {machine.id} · heartbeat {formatRelative(machine.lastHeartbeat)}
                    </div>
                  </div>
                  <StatusBadge status={machine.status} />
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <InfoRow label="Registration secret" value={health?.runnerSecretConfigured ? "configured" : "missing"} />
            <InfoRow label="Manual pairing" value={health?.pairingEnabled ? "enabled (rate-limited)" : "disabled"} />
            <InfoRow label="Cloud execution" value="disabled — local runner only" />
            <InfoRow label="Public endpoints" value="tokens and pairing codes stripped" />
          </div>
        </Panel>
      </div>

      {health?.runnerSecretConfigured === false && (
        <Notice tone="rose" title="Runner registration is not configured">
          Set <code className="font-mono text-[10px]">RUNNER_SECRET_TOKEN</code> in the dashboard environment
          (Vercel Project Settings → Environment Variables for cloud deployments) and restart or redeploy.
          Without it, runner heartbeats are rejected and PCs cannot register.
        </Notice>
      )}
    </div>
  );
}
