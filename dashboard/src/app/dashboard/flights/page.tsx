"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Download, Droplets, Leaf, Route, ShieldAlert, Timer } from "lucide-react";
import WeedMap from "@/components/dashboard/WeedMap";
import { BackendOffline, CROP, Loading, PageHeader, Stat, WEED } from "@/components/dashboard/ui";
import { api, downloadText, fmtDuration, toCsv, type Flight, type FlightDetail } from "@/lib/api";

function flightDate(file: string) {
  const m = file.match(/flight_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return file;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function FlightsPage() {
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlightDetail | null>(null);

  const load = useCallback(() => {
    setOffline(false);
    api.flights().then((f) => {
      setFlights(f);
      if (f.length) setSel((s) => s ?? (f.find((x) => x.summary.outcome === "complete") ?? f[0]).file);
    }).catch(() => setOffline(true));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!sel) return;
    setDetail(null);
    api.flight(sel).then(setDetail).catch(() => setOffline(true));
  }, [sel]);

  if (offline) return (<><PageHeader eyebrow="Flight logs" title="Missions & weed maps" /><BackendOffline onRetry={load} /></>);
  if (!flights) return <Loading label="Loading flight logs" />;
  if (!flights.length) {
    return (
      <>
        <PageHeader eyebrow="Flight logs" title="Missions & weed maps" />
        <div className="card card-pad text-sm text-ink-2">
          No completed missions yet. Fly one in the <a href="/dashboard/simulator" className="text-brand">live simulator</a> or run{" "}
          <code className="font-mono text-ink">python -m drone.main --mode sim</code>.
        </div>
      </>
    );
  }

  const s = detail?.summary;
  const items = detail?.items ?? [];
  const exportGeo = () => downloadText(`${sel}.geojson`, JSON.stringify({
    type: "FeatureCollection",
    features: items.map((i) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [i.lon, i.lat] },
      properties: { id: i.id, class: i.cls, confidence: i.conf, sprayed: i.sprayed },
    })),
  }, null, 1), "application/geo+json");

  return (
    <>
      <PageHeader
        eyebrow="Flight logs"
        title="Missions & weed maps"
        desc="Every mission writes a black-box log (logs/flight_*.jsonl). Each weed is plotted at its GPS position, together with whether the drone sprayed it."
        actions={detail && (
          <>
            <button className="btn btn-ghost" onClick={exportGeo}><Download className="h-4 w-4" /> GeoJSON</button>
            <button className="btn btn-ghost" onClick={() => downloadText(`${sel}.csv`, toCsv(items), "text/csv")}>
              <Download className="h-4 w-4" /> CSV
            </button>
          </>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <div className="card h-fit overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">Missions ({flights.length})</div>
          <div className="max-h-[640px] divide-y divide-line overflow-auto">
            {flights.map((f) => {
              const ok = f.summary.outcome === "complete";
              return (
                <button key={f.file} onClick={() => setSel(f.file)}
                        className={`block w-full px-4 py-3 text-left transition-colors ${sel === f.file ? "bg-surface-3" : "hover:bg-surface-2"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{flightDate(f.file)}</span>
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ok ? "bg-brand/10 text-brand" : "bg-amber/10 text-amber"}`}>
                      {ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                      {f.summary.outcome.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-muted num">
                    <span>{f.summary.weeds} weeds</span>
                    <span>{f.summary.photos} photos</span>
                    <span>{fmtDuration(f.summary.flight_time_s)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          {!s ? <Loading label="Loading mission" /> : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Weeds found" value={s.weeds} tone="weed" icon={Leaf} sub={`${s.weeds_sprayed} sprayed · ${s.crops} crops`} />
                <Stat label="Herbicide used" value={`${(s.herbicide_ml / 1000).toFixed(2)} L`} icon={Droplets} sub={`${s.spray_shots} spot shots`} delay={0.05} />
                <Stat label="Chemical saved" value={`${s.savings_pct}%`} tone="brand" icon={CheckCircle2} sub={`vs ${(s.blanket_ml / 1000).toFixed(0)} L blanket`} delay={0.1} />
                <Stat label="Flight time" value={fmtDuration(s.flight_time_s)} icon={Clock} sub={`${s.distance_m} m flown`} delay={0.15} />
              </div>

              <div className="card card-pad">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Georeferenced weed map</h2>
                    <p className="text-xs text-muted">{s.area_m2} m² field · north up · hover a plant for its GPS position</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: WEED }} /> Weed</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-violet" /> Sprayed</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] border-2" style={{ borderColor: CROP }} /> Crop</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-amber" /> Geofence</span>
                  </div>
                </div>
                <WeedMap plan={detail.plan} items={items} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Photos analysed" value={s.photos} icon={Route} />
                <Stat label="Avg. AI inference" value={`${s.avg_inference_ms} ms`} icon={Timer} />
                <Stat label="Outcome" value={s.outcome.replace("_", " ")} tone={s.outcome === "complete" ? "brand" : undefined} icon={ShieldAlert} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
