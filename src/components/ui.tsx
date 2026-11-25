"use client";

import React, { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  GraduationCap,
  ListChecks,
  Radar,
  Sparkles,
  X,
} from "lucide-react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type Tone = "mint" | "aqua" | "iris" | "amber" | "rose" | "slate";

const TONE_TEXT: Record<Tone, string> = {
  mint: "text-emerald-300",
  aqua: "text-cyan-300",
  iris: "text-indigo-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  slate: "text-slate-300",
};

const TONE_BG: Record<Tone, string> = {
  mint: "bg-emerald-400/10 border-emerald-400/20",
  aqua: "bg-cyan-400/10 border-cyan-400/20",
  iris: "bg-indigo-400/10 border-indigo-400/20",
  amber: "bg-amber-400/10 border-amber-400/20",
  rose: "bg-rose-400/10 border-rose-400/20",
  slate: "bg-slate-400/10 border-slate-400/20",
};

const TONE_BAR: Record<Tone, string> = {
  mint: "from-emerald-300 to-teal-400",
  aqua: "from-cyan-300 to-sky-400",
  iris: "from-indigo-300 to-violet-400",
  amber: "from-amber-300 to-orange-400",
  rose: "from-rose-300 to-pink-400",
  slate: "from-slate-400 to-slate-500",
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/80">
            <span className="h-1 w-1 rounded-full bg-cyan-300" />
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[1.7rem]">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-400 sm:text-[13px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-bold tracking-tight text-white">{title}</h2>
        {description && <p className="mt-0.5 text-[11px] text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({
  className,
  children,
  hover,
}: {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
}) {
  return <div className={cn("panel", hover && "panel-hover", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "aqua",
  progress,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  progress?: number;
}) {
  return (
    <div className="panel panel-hover relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
          <div className="kpi-value mt-2 text-[1.7rem] font-bold leading-none text-white">{value}</div>
          {hint && <div className="mt-2 text-[10px] leading-snug text-slate-400">{hint}</div>}
        </div>
        <div className={cn("icon-tile shrink-0", TONE_BG[tone], TONE_TEXT[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-slate-800/80">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r", TONE_BAR[tone])}
          style={{ width: `${Math.max(0, Math.min(100, progress ?? 100))}%` }}
        />
      </div>
    </div>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status.toLowerCase();
  let tone: Tone = "slate";
  let dot = "bg-slate-400";
  if (["running", "online", "active", "completed", "success", "ready"].includes(s)) {
    tone = s === "online" || s === "running" || s === "active" ? "mint" : "aqua";
    dot = s === "online" || s === "running" || s === "active" ? "bg-emerald-400" : "bg-cyan-400";
  } else if (["queued", "waiting", "starting"].includes(s)) {
    tone = "iris";
    dot = "bg-indigo-400";
  } else if (["failed", "error", "offline"].includes(s)) {
    tone = "rose";
    dot = "bg-rose-400";
  } else if (["paused", "disconnected", "cancelled"].includes(s)) {
    tone = "amber";
    dot = "bg-amber-400";
  }

  return (
    <span className={cn("badge", TONE_BG[tone], TONE_TEXT[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot, (s === "running" || s === "online") && "animate-pulse")} />
      {status}
    </span>
  );
}

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cn("badge", TONE_BG[tone], TONE_TEXT[tone], className)}>{children}</span>;
}

export function Progress({ value, tone = "aqua" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", TONE_BAR[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon = Sparkles,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/50 bg-slate-950/30 px-6 py-12 text-center">
      <div className="icon-tile mb-3 text-slate-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      {description && <p className="mt-1 max-w-md text-[11px] leading-relaxed text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("panel relative z-10 w-full overflow-hidden shadow-2xl animate-fadeUp", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/70 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-white">{title}</h3>
            {description && <p className="mt-0.5 text-[11px] text-slate-400">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}

export const CATEGORY_META: Record<
  string,
  { icon: LucideIcon; tone: Tone; short: string }
> = {
  "Engineering Admissions": { icon: GraduationCap, tone: "aqua", short: "Admissions" },
  "Choice Filling": { icon: ListChecks, tone: "iris", short: "Choice filling" },
  "Data Extraction": { icon: FileSpreadsheet, tone: "mint", short: "Data" },
  "Alerts & Monitoring": { icon: Radar, tone: "amber", short: "Alerts" },
  "Document Processing": { icon: BookOpen, tone: "rose", short: "Documents" },
  General: { icon: Sparkles, tone: "slate", short: "General" },
};

export function CategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const meta = CATEGORY_META[category] || CATEGORY_META.General;
  const Icon = meta.icon;
  return (
    <div className={cn("icon-tile", TONE_BG[meta.tone], TONE_TEXT[meta.tone], className)}>
      <Icon className="h-4 w-4" />
    </div>
  );
}

export function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800/50 py-2 last:border-0">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={cn("text-right text-[11px] font-medium text-slate-200", mono && "font-mono")}>{value}</span>
    </div>
  );
}

export function Notice({
  tone = "amber",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = tone === "rose" ? AlertTriangle : tone === "mint" ? CheckCircle2 : Clock3;
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between", TONE_BG[tone])}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_TEXT[tone])} />
        <div>
          <div className={cn("text-xs font-semibold", TONE_TEXT[tone])}>{title}</div>
          {children && <div className="mt-0.5 text-[11px] leading-relaxed text-slate-300/90">{children}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ActivityBars({ values, tone = "aqua" }: { values: number[]; tone?: Tone }) {
  return (
    <div className="flex h-8 items-end gap-1">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-sm bg-gradient-to-t opacity-80", TONE_BAR[tone])}
          style={{ height: `${Math.max(12, Math.min(100, v))}%` }}
        />
      ))}
    </div>
  );
}

export function LiveDot({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      {label || "Live"}
    </span>
  );
}

export const TONES = { TONE_TEXT, TONE_BG, TONE_BAR };
export { Activity };
