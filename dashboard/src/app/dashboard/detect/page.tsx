"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Download, ImageUp, Leaf, Sprout, Timer } from "lucide-react";
import DetectionViewer from "@/components/dashboard/DetectionViewer";
import { BackendOffline, CROP, Loading, PageHeader, Stat, WEED } from "@/components/dashboard/ui";
import { api, asset, BackendError, downloadText, toCsv, type DetectResult, type Sample } from "@/lib/api";

type Source = { kind: "sample"; name: string; src: string } | { kind: "upload"; name: string; src: string; file: File };

export default function DetectPage() {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [conf, setConf] = useState(0.25);
  const [altitude, setAltitude] = useState(10);
  const [hfov, setHfov] = useState(62.2);
  const [show, setShow] = useState({ weed: true, crop: true });
  const [result, setResult] = useState<DetectResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setOffline(false);
    api.samples().then((s) => {
      setSamples(s);
      if (s.length) setSource((cur) => cur ?? { kind: "sample", name: s[0].name, src: asset(s[0].url) });
    }).catch(() => setOffline(true));
    api.info().then((i) => setHfov(i.camera.hfov_deg)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  // run detection whenever the image or the threshold changes (debounced)
  useEffect(() => {
    if (!source) return;
    const id = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const r = source.kind === "sample" ? await api.detectSample(source.name, conf) : await api.detectFile(source.file, conf);
        setResult(r);
      } catch (e) {
        if (e instanceof BackendError) setOffline(true);
        else setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [source, conf]);

  function pickFile(file?: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    if (source?.kind === "upload") URL.revokeObjectURL(source.src);
    setResult(null);
    setSource({ kind: "upload", name: file.name, src: URL.createObjectURL(file), file });
  }

  if (offline) return (<><PageHeader eyebrow="Detect" title="Weed detection" /><BackendOffline onRetry={load} /></>);
  if (!samples) return <Loading label="Connecting to the AI backend" />;

  const weeds = result?.detections.filter((d) => d.class_name === "weed") ?? [];
  const crops = result?.detections.filter((d) => d.class_name !== "weed") ?? [];
  // ground sample distance: cm of ground per image pixel at this altitude
  const footprintM = 2 * altitude * Math.tan(((hfov * Math.PI) / 180) / 2);
  const gsdCm = result ? (100 * footprintM) / result.width : undefined;
  const weedCover = result
    ? (100 * weeds.reduce((s, d) => s + (d.x2 - d.x1) * (d.y2 - d.y1), 0)) / (result.width * result.height) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Detect"
        title="Weed detection"
        desc="Run the onboard YOLO11 model on any field image. The drone makes exactly this decision at every survey point before it sprays."
        actions={result && (
          <button className="btn btn-ghost"
                  onClick={() => downloadText(`${source?.name.replace(/\.\w+$/, "")}_detections.csv`,
                    toCsv(result.detections.map((d) => ({ ...d }))), "text/csv")}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        {/* ---------------------------------------------------------- controls */}
        <div className="space-y-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}
            onClick={() => fileInput.current?.click()}
            className={`card flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-6 text-center transition-colors ${drag ? "border-brand bg-brand/5" : "hover:border-line-strong"}`}>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><ImageUp className="h-5 w-5" /></div>
            <div className="text-sm font-medium">Drop an image or click to upload</div>
            <div className="text-xs text-muted">JPG, PNG or BMP · analysed locally by the backend</div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          </div>

          <div className="card card-pad">
            <div className="eyebrow">Sample drone images</div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {samples.map((s) => {
                const active = source?.kind === "sample" && source.name === s.name;
                return (
                  <button key={s.name} title={s.name}
                          onClick={() => { setResult(null); setSource({ kind: "sample", name: s.name, src: asset(s.url) }); }}
                          className={`aspect-square overflow-hidden rounded-lg border-2 transition-all ${active ? "border-brand" : "border-transparent opacity-70 hover:opacity-100"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset(s.url)} alt={s.name} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card card-pad space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="conf" className="font-medium">Confidence threshold</label>
                <span className="num rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs">{conf.toFixed(2)}</span>
              </div>
              <input id="conf" type="range" min={0.05} max={0.9} step={0.05} value={conf}
                     onChange={(e) => setConf(Number(e.target.value))} className="mt-3 w-full accent-[#3ddc97]" />
              <p className="mt-1 text-xs text-muted">Lower finds more weeds but risks false positives.</p>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="alt" className="font-medium">Flight altitude</label>
                <span className="num rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs">{altitude} m</span>
              </div>
              <input id="alt" type="range" min={2} max={30} step={1} value={altitude}
                     onChange={(e) => setAltitude(Number(e.target.value))} className="mt-3 w-full accent-[#3ddc97]" />
              <p className="mt-1 text-xs text-muted">Used for the plant-size estimate (camera FOV {hfov}°).</p>
            </div>
            <div className="flex gap-2">
              {([["weed", "Weeds", WEED], ["crop", "Crops", CROP]] as const).map(([k, label, color]) => (
                <button key={k} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${show[k] ? "border-line-strong bg-surface-3 text-ink" : "border-line text-muted"}`}>
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: show[k] ? color : "transparent", border: `1.5px solid ${color}` }} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------- results */}
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Weeds" value={result ? weeds.length : "–"} tone="weed" icon={Leaf} sub="queued for spraying" />
            <Stat label="Crops" value={result ? crops.length : "–"} tone="crop" icon={Sprout} sub="protected" delay={0.05} />
            <Stat label="Inference" value={result ? `${result.inference_ms.toFixed(0)} ms` : "–"} icon={Timer} sub="YOLO11 · CPU" delay={0.1} />
            <Stat label="Weed cover" value={result ? `${weedCover.toFixed(2)}%` : "–"} icon={Cpu} sub="of the photographed area" delay={0.15} />
          </div>

          <div className="card p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="min-w-0 truncate font-mono text-xs text-muted">
                {source?.name}{result && ` · ${result.width}×${result.height}px`}
                {gsdCm && ` · ${gsdCm.toFixed(2)} cm/px @ ${altitude} m`}
              </div>
              {busy && <span className="font-mono text-xs text-sky">● running inference</span>}
            </div>
            {source && result ? (
              <DetectionViewer src={source.src} width={result.width} height={result.height} boxes={result.detections}
                               show={show} gsdCm={gsdCm} busy={busy} />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-line bg-surface-2">
                <Loading label="Analysing image" />
              </div>
            )}
            {error && <p className="mt-3 text-sm text-weed">{error}</p>}
          </div>

          {result && result.detections.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-line px-5 py-3.5 text-sm font-semibold">Detections ({result.detections.length})</div>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                    <tr>{["#", "Class", "Confidence", "Box (x1, y1 → x2, y2)", "Size"].map((h) => <th key={h} className="px-5 py-2.5 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...result.detections].sort((a, b) => b.confidence - a.confidence).map((d, i) => (
                      <tr key={i} className="hover:bg-surface-2">
                        <td className="px-5 py-2.5 text-muted num">{i + 1}</td>
                        <td className="px-5 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: d.class_name === "weed" ? WEED : CROP }} />
                            {d.class_name}
                          </span>
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                              <div className="h-full rounded-full bg-ink-2" style={{ width: `${d.confidence * 100}%` }} />
                            </div>
                            <span className="num font-mono text-xs">{d.confidence.toFixed(3)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 font-mono text-xs text-ink-2 num">
                          {d.x1.toFixed(0)}, {d.y1.toFixed(0)} → {d.x2.toFixed(0)}, {d.y2.toFixed(0)}
                        </td>
                        <td className="px-5 py-2.5 font-mono text-xs text-ink-2 num">
                          {gsdCm ? `${(Math.max(d.x2 - d.x1, d.y2 - d.y1) * gsdCm).toFixed(0)} cm` : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
