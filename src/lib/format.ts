export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value?: string | number | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRelative(value?: string | number | Date | null): string {
  if (!value) return "never";
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return "never";
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const min = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (min < 60) return `${min}m ${rest}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function shortId(id: string, length = 8): string {
  if (!id) return "—";
  return id.length <= length ? id : id.slice(-length);
}

export function clampPercent(value: number | undefined | null): number {
  if (!value || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
