"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, ChartColumn, CheckCircle2, Clock, Cpu, Droplets, Leaf, Map, MonitorPlay, ScanSearch } from "lucide-react";
import { BackendOffline, Loading, PageHeader, Stat } from "@/components/dashboard/ui";
import { api, fmtDuration, type Flight, type Info } from "@/lib/api";

const ACTIONS = [
  { href: "/dashboard/detect", icon: ScanSearch, title: "Detect weeds", text: "Run YOLO11 on a sample or uploaded field image." },
  { href: "/dashboard/batch", icon: ChartColumn, title: "Batch report", text: "Detections across the whole survey image set." },
  { href: "/dashboard/flights", icon: Map, title: "Flight logs", text: "Mission reports and georeferenced weed maps." },
  { href: "/dashboard/simulator", icon: MonitorPlay, title: "Live simulator", text: "Fly an autonomous detect-and-spray mission." },
];

export default function Overview() {
  const [info, setInfo] = useState<Info | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [offline, setOffline] = useState(false);

  const load = useCallback(() => {
    setOffline(false);
    api.info().then(setInfo).catch(() => setOffline(true));
    api.flights().then(setFlights).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const last = (flights.find((f) => f.summary.outcome === "complete") ?? flights[0])?.summary;

  return (
    <>
      <PageHeader eyebrow="Overview" title="Mission dashboard"
                  desc="Analyse field imagery with the onboard AI, review missions, and launch the autonomous flight simulator." />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="relative overflow-hidden rounded-2xl border border-brand/25 bg-gradient-to-br from-[#0f2219] via-surface to-[#0d1a26] p-6 sm:p-8">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
        <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div>
            <span className="chip"><span className={`h-1.5 w-1.5 rounded-full ${info ? "bg-brand" : "bg-amber"}`} />
              {info ? (info.mission_running ? "Mission in flight" : "System ready") : offline ? "Backend offline" : "Connecting"}
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">Autonomous weed detection &amp; spot-spraying</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">
              The drone surveys the field and detects crops and weeds with YOLO11. It converts every weed to a GPS
              coordinate and sprays only those spots, then returns home with a complete weed map.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/dashboard/simulator" className="btn btn-primary"><MonitorPlay className="h-4 w-4" /> Start a mission</Link>
              <Link href="/dashboard/detect" className="btn btn-ghost"><ScanSearch className="h-4 w-4" /> Try the detector</Link>
            </div>
          </div>
          {info && (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm">
              {[
                ["Model", "YOLO11"],
                ["Classes", info.classes.join(" · ")],
                ["Input size", `${info.image_size} px`],
                ["Confidence", info.confidence.toFixed(2)],
                ["Survey alt.", `${info.mission.survey_altitude_m} m`],
                ["Camera FOV", `${info.camera.hfov_deg}° × ${info.camera.vfov_deg}°`],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface px-4 py-3">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5 font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </motion.div>

      {offline && <div className="mt-6"><BackendOffline onRetry={load} /></div>}
      {!offline && !info && <Loading />}

      {last && (
        <>
          <div className="mb-3 mt-8 flex items-center justify-between">
            <h2 className="font-semibold">Latest mission</h2>
            <Link href="/dashboard/flights" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
              All flight logs <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Weeds detected" value={last.weeds} tone="weed" icon={Leaf} sub={`${last.weeds_sprayed} sprayed`} />
            <Stat label="Chemical saved" value={`${last.savings_pct}%`} tone="brand" icon={CheckCircle2} sub="vs blanket spraying" delay={0.05} />
            <Stat label="Herbicide used" value={`${(last.herbicide_ml / 1000).toFixed(2)} L`} icon={Droplets} sub={`${last.spray_shots} spot shots`} delay={0.1} />
            <Stat label="Flight time" value={fmtDuration(last.flight_time_s)} icon={Clock} sub={`${last.photos} photos · ${last.area_m2} m²`} delay={0.15} />
          </div>
        </>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Workspace</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((a, i) => (
          <motion.div key={a.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
            <Link href={a.href} className="group card flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-brand/40">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"><a.icon className="h-5 w-5" /></div>
                <ArrowUpRight className="h-4 w-4 text-muted transition-colors group-hover:text-brand" />
              </div>
              <h3 className="mt-4 font-semibold">{a.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{a.text}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="card card-pad mt-8">
        <div className="flex items-center gap-2"><Cpu className="h-4 w-4 text-brand" /><h2 className="font-semibold">Onboard pipeline</h2></div>
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {["Capture nadir photo", "YOLO11 crop / weed detection", "Pixel → GPS georeferencing", "Crop-safety filter",
            "Cluster weeds & plan route", "Descend & spot-spray", "Return to launch & land", "Export weed map"].map((t, i) => (
            <li key={t} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
              <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-3 font-mono text-[11px] text-brand">{i + 1}</span>
              <span className="text-ink-2">{t}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
