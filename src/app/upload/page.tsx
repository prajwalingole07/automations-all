"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  FileArchive,
  Layers,
  ShieldCheck,
  Terminal,
  UploadCloud,
} from "lucide-react";
import {
  Badge,
  Notice,
  PageHeader,
  Panel,
  Spinner,
  cn,
} from "@/components/ui";
import { formatBytes } from "@/lib/format";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [autoApprove, setAutoApprove] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (selected?: File | null) => {
    if (!selected) return;
    setFile(selected);
    setError(null);
    setResult(null);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    form.append("autoApprove", autoApprove ? "true" : "false");
    form.append("userName", "Operator");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Upload screening failed.");
        return;
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Operations · packages"
        title="Ingest an automation package"
        description="Upload a ZIP for static security screening and registry metadata. The package still has to be extracted into packages/ on the runner PC before it can execute."
        actions={
          <Link href="/automations" className="btn btn-ghost">
            <Layers className="h-3.5 w-3.5" /> Registry
          </Link>
        }
      />

      <Notice tone="iris" title="Cloud stores metadata · your PC stores the code">
        On Vercel only the scan report and registry entry are persisted. Copy the extracted package
        folder into <code className="font-mono text-[10px]">packages/</code> on the PC whose runner
        should execute it. Each PC executes only its own jobs.
      </Notice>

      <Panel className="p-5">
        <label
          className={cn(
            "relative block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition",
            file
              ? "border-cyan-400/40 bg-cyan-400/[0.04]"
              : "border-slate-700/60 bg-slate-950/30 hover:border-cyan-400/30 hover:bg-cyan-400/[0.03]"
          )}
        >
          <input
            type="file"
            accept=".zip"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="flex flex-col items-center gap-3">
            <div
              className={cn(
                "icon-tile h-12 w-12",
                file
                  ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-300"
                  : "text-slate-400"
              )}
            >
              {file ? <FileArchive className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {file ? file.name : "Drop an automation ZIP here"}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {file
                  ? `${formatBytes(file.size)} · ready for static screening`
                  : "Python, Node.js, Playwright or CLI packages · .zip only"}
              </div>
            </div>
          </div>
        </label>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
            />
            Register into the catalog immediately after a clean scan
          </label>
          <button onClick={upload} disabled={!file || uploading} className="btn btn-primary px-5">
            {uploading ? <Spinner className="text-slate-950" /> : <ShieldCheck className="h-4 w-4" />}
            {uploading ? "Screening…" : "Scan package"}
          </button>
        </div>
      </Panel>

      {error && (
        <Notice tone="rose" title="Upload rejected">
          {error}
        </Notice>
      )}

      {result && (
        <Panel className="p-5">
          <div className="flex flex-col gap-3 border-b border-slate-800/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
              <div>
                <h3 className="text-sm font-bold text-white">Security screening passed</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {result.message || "Package scanned and stored."}
                </p>
              </div>
            </div>
            <Badge tone="mint">
              <ShieldCheck className="h-3 w-3" /> safe
            </Badge>
          </div>

          {result.warning && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5 text-[10.5px] leading-relaxed text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              {result.warning}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Runtime", result.scanReport.detectedLanguage],
              ["Entry point", result.scanReport.entryPoint || "—"],
              ["Browsers", (result.scanReport.requiredBrowsers || []).join(", ") || "headless CLI"],
              ["Files", String(result.scanReport.fileCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">{label}</div>
                <div className="mt-1 truncate font-mono text-[10px] text-slate-200">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Detected dependencies
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(result.scanReport.dependencies || []).length ? (
                result.scanReport.dependencies.map((dependency: string) => (
                  <span
                    key={dependency}
                    className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1 font-mono text-[9px] text-slate-300"
                  >
                    {dependency}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-slate-500">None detected</span>
              )}
            </div>
          </div>

          {result.scanReport.issues?.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/80">
                Screening notes
              </div>
              <ul className="space-y-1 text-[10px] text-slate-400">
                {result.scanReport.issues.map((issue: string, index: number) => (
                  <li key={index} className="flex gap-2">
                    <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/70 pt-4">
            <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
              <CloudUpload className="h-3 w-3" /> metadata persisted · binary stays on the runner PC
            </div>
            <Link href="/automations" className="btn btn-primary">
              Open registry <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Panel>
      )}
    </div>
  );
}
