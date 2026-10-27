"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

export function PageHeader({ eyebrow, title, desc, actions }: {
  eyebrow: string; title: string; desc?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow text-brand">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {desc && <p className="mt-2 max-w-2xl text-sm text-ink-2">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon: Icon, delay = 0 }: {
  label: string; value: React.ReactNode; sub?: string; tone?: "weed" | "crop" | "brand";
  icon?: React.ComponentType<{ className?: string }>; delay?: number;
}) {
  const color = tone === "weed" ? "text-weed" : tone === "crop" ? "text-crop" : tone === "brand" ? "text-brand" : "text-ink";
  return (
    <motion.div className="card p-4 sm:p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted" />}
      </div>
      <div className={`num mt-2 text-2xl font-semibold tracking-tight ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </motion.div>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-muted justify-center">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}…
    </div>
  );
}

export function BackendOffline({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/10 text-amber">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">AI backend is not running</h2>
      <p className="mt-2 text-sm text-ink-2">
        This page needs the Python server that hosts the YOLO11 model and flight logs. Start it from the project root:
      </p>
      <code className="mt-4 block rounded-lg border border-line bg-bg px-4 py-3 text-left font-mono text-sm text-ink-2">
        <span className="text-brand">$</span> python simulation/server.py
      </code>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-ghost mt-5">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      )}
    </div>
  );
}

export const WEED = "#ee5f4c";
export const CROP = "#20a7a0";
