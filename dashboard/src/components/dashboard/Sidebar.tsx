"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChartColumn, Home, LayoutDashboard, Map, Menu, MonitorPlay, ScanSearch, X } from "lucide-react";
import Logo from "@/components/ui/Logo";
import { api } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/detect", label: "Detect", icon: ScanSearch },
  { href: "/dashboard/batch", label: "Batch report", icon: ChartColumn },
  { href: "/dashboard/flights", label: "Flight logs", icon: Map },
  { href: "/dashboard/simulator", label: "Live simulator", icon: MonitorPlay },
];

function useBackendStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () =>
      api.info()
        .then((i) => { if (alive) { setStatus("online"); setRunning(i.mission_running); } })
        .catch(() => alive && setStatus("offline"));
    check();
    const id = setInterval(check, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return { status, running };
}

export default function Sidebar() {
  const path = usePathname();
  const { status, running } = useBackendStatus();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => {
        const active = n.href === "/dashboard" ? path === n.href : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
            {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand" />}
            <n.icon className={`h-[18px] w-[18px] ${active ? "text-brand" : "text-muted group-hover:text-ink-2"}`} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const statusBox = (
    <div className="rounded-xl border border-line bg-surface-2 p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={`h-2 w-2 rounded-full ${status === "online" ? "bg-brand" : status === "offline" ? "bg-amber" : "bg-muted"}`} />
        {status === "online" ? "AI backend online" : status === "offline" ? "Backend offline" : "Checking backend"}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        {status === "online"
          ? running ? "A mission is flying in the simulator." : "YOLO11 model loaded · localhost:8000"
          : status === "offline" ? "Run python simulation/server.py" : "Connecting to localhost:8000"}
      </p>
    </div>
  );

  return (
    <>
      {/* mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-ink-2"><Menu className="h-5 w-5" /></button>
        <Logo className="h-7 w-7" />
        <span className="font-semibold">AgriDrone <span className="text-brand">AI</span></span>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface px-4 py-5 transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">AgriDrone <span className="text-brand">AI</span></div>
              <div className="text-[11px] text-muted">Mission dashboard</div>
            </div>
          </Link>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-8 px-2 eyebrow">Workspace</div>
        <div className="mt-3">{nav}</div>
        <div className="mt-auto space-y-3">
          {statusBox}
          <Link href="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            <Home className="h-4 w-4" /> Project home
          </Link>
        </div>
      </aside>
    </>
  );
}
