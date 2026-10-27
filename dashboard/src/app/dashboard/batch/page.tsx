"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Gauge, Images, Leaf, Sprout, Table2, X } from "lucide-react";
import { Bars } from "@/components/dashboard/charts";
import { BackendOffline, CROP, Legend, Loading, PageHeader, Stat, WEED } from "@/components/dashboard/ui";
import { api, asset, downloadText, toCsv, type Batch } from "@/lib/api";

const SERIES = [
  { key: "weed", label: "Weed", color: WEED },
  { key: "crop", label: "Crop", color: CROP },
];

export default function BatchPage() {
  const [data, setData] = useState<Batch | null>(null);
  const [offline, setOffline] = useState(false);
  const [tableView, setTableView] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [annotated, setAnnotated] = useState(true);

  const load = useCallback(() => {
    setOffline(false);
    api.batch().then(setData).catch(() => setOffline(true));
  }, []);
  useEffect(load, [load]);

  const perImage = useMemo(() => {
    if (!data) return [];
    const names = data.images.length ? data.images.map((i) => i.name) : [...new Set(data.rows.map((r) => r.image_name))];
    return names.map((name) => {
      const rows = data.rows.filter((r) => r.image_name === name);
      return {
        image: name.replace(/\.\w+$/, "").replace("image", "img "),
        name,
        weed: rows.filter((r) => r.class_name === "weed").length,
        crop: rows.filter((r) => r.class_name !== "weed").length,
      };
    });
  }, [data]);

  const histogram = useMemo(() => {
    if (!data) return [];
    const bins = Array.from({ length: 8 }, (_, i) => ({ bin: `${(0.2 + i * 0.1).toFixed(1)}`, weed: 0, crop: 0 }));
    for (const r of data.rows) {
      const i = Math.min(7, Math.max(0, Math.floor((r.confidence - 0.2) / 0.1)));
      if (r.class_name === "weed") bins[i].weed += 1;
      else bins[i].crop += 1;          // crop + panicle
    }
    return bins;
  }, [data]);

  if (offline) return (<><PageHeader eyebrow="Batch report" title="Survey batch analysis" /><BackendOffline onRetry={load} /></>);
  if (!data) return <Loading label="Loading batch results" />;
  if (!data.available) {
    return (
      <>
        <PageHeader eyebrow="Batch report" title="Survey batch analysis" />
        <div className="card card-pad text-sm text-ink-2">
          No batch results yet. Run <code className="font-mono text-ink">python src/batch_detect.py</code> to analyse every image in drone_data/images.
        </div>
      </>
    );
  }

  const weeds = data.rows.filter((r) => r.class_name === "weed").length;
  const crops = data.rows.length - weeds;
  const mean = data.rows.reduce((s, r) => s + r.confidence, 0) / Math.max(1, data.rows.length);
  const img = open !== null ? data.images[open] : null;

  return (
    <>
      <PageHeader
        eyebrow="Batch report"
        title="Survey batch analysis"
        desc="YOLO11 results for every image in the survey set (src/batch_detect.py → results/detections.csv)."
        actions={
          <button className="btn btn-ghost" onClick={() => downloadText("detections.csv", toCsv(data.rows), "text/csv")}>
            <Download className="h-4 w-4" /> detections.csv
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Images analysed" value={perImage.length} icon={Images} />
        <Stat label="Weeds detected" value={weeds} tone="weed" icon={Leaf} delay={0.05} sub={`${(weeds / perImage.length).toFixed(1)} per image`} />
        <Stat label="Crop plants" value={crops} tone="crop" icon={Sprout} delay={0.1} />
        <Stat label="Mean confidence" value={mean.toFixed(2)} icon={Gauge} delay={0.15} sub={`${data.rows.length} detections`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="card card-pad">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Detections per image</h2>
              <p className="text-xs text-muted">Stacked: weeds and crops found in each survey photo</p>
            </div>
            <div className="flex items-center gap-4">
              <Legend items={SERIES.map((s) => [s.label, s.color])} />
              <button onClick={() => setTableView(!tableView)} className="btn btn-ghost px-2.5 py-1.5 text-xs" aria-pressed={tableView}>
                <Table2 className="h-3.5 w-3.5" /> {tableView ? "Chart" : "Table"}
              </button>
            </div>
          </div>
          {tableView ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2">Image</th><th>Weeds</th><th>Crops</th></tr></thead>
              <tbody className="divide-y divide-line">
                {perImage.map((p) => (
                  <tr key={p.name}><td className="py-2 font-mono text-xs">{p.name}</td><td className="num">{p.weed}</td><td className="num">{p.crop}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Bars data={perImage} x="image" series={SERIES} stacked height={290} />
          )}
        </div>

        <div className="card card-pad">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Confidence distribution</h2>
              <p className="text-xs text-muted">Detections per 0.1 confidence band</p>
            </div>
            <Legend items={SERIES.map((s) => [s.label, s.color])} />
          </div>
          <Bars data={histogram} x="bin" series={SERIES} height={290}
                labelFmt={(l) => `Confidence ${l}–${(Number(l) + 0.1).toFixed(1)}`} />
        </div>
      </div>

      {data.images.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-4 font-semibold">Annotated survey images</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.images.map((im, i) => {
              const c = perImage.find((p) => p.name === im.name);
              return (
                <motion.button key={im.name} onClick={() => setOpen(i)}
                               initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                               className="group card overflow-hidden text-left transition-colors hover:border-brand/40">
                  <div className="aspect-square overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset(im.annotated)} alt={im.name} loading="lazy"
                         className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 text-xs">
                    <span className="font-mono text-ink-2">{im.name}</span>
                    <span className="flex gap-2 num">
                      <span className="text-weed">{c?.weed ?? 0}W</span>
                      <span className="text-crop">{c?.crop ?? 0}C</span>
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {img && (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div className="card w-full max-w-4xl overflow-hidden" initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="font-mono text-sm">{img.name}</span>
                <div className="flex items-center gap-2">
                  <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setAnnotated(!annotated)}>
                    {annotated ? "Show original" : "Show detections"}
                  </button>
                  <button onClick={() => setOpen(null)} className="rounded-lg p-1.5 text-muted hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset(annotated ? img.annotated : img.original)} alt={img.name} className="max-h-[75vh] w-full bg-black object-contain" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
