"use client";

import { useMemo, useState } from "react";
import type { MapItem, Plan } from "@/lib/api";
import { CROP, WEED } from "./ui";

const VIOLET = "#a98bff";

/** Georeferenced weed map in local metres (x = East, y = North, north up). */
export default function WeedMap({ plan, items }: { plan: Plan | null; items: MapItem[] }) {
  const [hover, setHover] = useState<MapItem | null>(null);

  const view = useMemo(() => {
    const pts: [number, number][] = [[0, 0], ...(plan?.field ?? []), ...items.map((i) => [i.x, i.y] as [number, number])];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const m = 3;
    return { minx: Math.min(...xs) - m, maxx: Math.max(...xs) + m, miny: Math.min(...ys) - m, maxy: Math.max(...ys) + m };
  }, [plan, items]);

  const W = view.maxx - view.minx;
  const H = view.maxy - view.miny;
  const sx = (x: number) => x - view.minx;
  const sy = (y: number) => view.maxy - y;
  const grid: number[] = [];
  for (let g = Math.ceil(view.minx / 5) * 5; g <= view.maxx; g += 5) grid.push(g);
  const gridY: number[] = [];
  for (let g = Math.ceil(view.miny / 5) * 5; g <= view.maxy; g += 5) gridY.push(g);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full rounded-xl bg-[#0a1016]" role="img"
           aria-label={`Weed map with ${items.filter((i) => i.cls === "weed").length} weeds and ${items.filter((i) => i.cls !== "weed").length} crops`}>
        {grid.map((g) => <line key={`x${g}`} x1={sx(g)} x2={sx(g)} y1={0} y2={H} stroke="#1d2834" strokeWidth={0.06} />)}
        {gridY.map((g) => <line key={`y${g}`} y1={sy(g)} y2={sy(g)} x1={0} x2={W} stroke="#1d2834" strokeWidth={0.06} />)}

        {plan && (
          <>
            <polygon points={plan.field.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")}
                     fill="rgba(61,220,151,0.04)" stroke="#f5b14c" strokeOpacity={0.7} strokeWidth={0.15} strokeDasharray="0.8 0.6" />
            <polyline points={[[0, 0], ...plan.waypoints, [0, 0]].map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")}
                      fill="none" stroke="rgba(231,237,243,0.22)" strokeWidth={0.1} strokeDasharray="0.5 0.5" />
            {plan.waypoints.map(([x, y], i) => (
              <g key={i}>
                <circle cx={sx(x)} cy={sy(y)} r={0.75} fill="#0a1016" stroke="#4cb8ff" strokeWidth={0.12} />
                <text x={sx(x)} y={sy(y) + 0.32} textAnchor="middle" fontSize={0.85} fill="#4cb8ff" fontWeight={700}>{i + 1}</text>
              </g>
            ))}
          </>
        )}

        {items.map((it) => {
          const active = hover?.id === it.id;
          const cx = sx(it.x), cy = sy(it.y);
          if (it.cls !== "weed") {          // crop or panicle
            const r = Math.max(0.35, it.size / 2);
            return (
              <rect key={it.id} x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={0.1}
                    fill={`${CROP}33`} stroke={CROP} strokeWidth={active ? 0.22 : 0.12}
                    onMouseEnter={() => setHover(it)} onMouseLeave={() => setHover(null)} className="cursor-pointer" />
            );
          }
          const r = Math.max(0.28, it.size / 2);
          return (
            <g key={it.id} onMouseEnter={() => setHover(it)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
              <circle cx={cx} cy={cy} r={r + 0.6} fill="transparent" />
              {it.sprayed && <circle cx={cx} cy={cy} r={r + 0.25} fill="none" stroke={VIOLET} strokeWidth={0.12} />}
              <circle cx={cx} cy={cy} r={r} fill={WEED} stroke={active ? "#fff" : "#0a1016"} strokeWidth={active ? 0.12 : 0.06} />
            </g>
          );
        })}

        <circle cx={sx(0)} cy={sy(0)} r={1.1} fill="#f5b14c" />
        <text x={sx(0)} y={sy(0) + 0.45} textAnchor="middle" fontSize={1.2} fontWeight={800} fill="#2a1a03">H</text>

        {/* scale bar */}
        <g transform={`translate(${1} ${H - 1})`}>
          <line x1={0} x2={10} y1={0} y2={0} stroke="#b4c0cc" strokeWidth={0.12} />
          <line x1={0} x2={0} y1={-0.4} y2={0} stroke="#b4c0cc" strokeWidth={0.12} />
          <line x1={10} x2={10} y1={-0.4} y2={0} stroke="#b4c0cc" strokeWidth={0.12} />
          <text x={5} y={-0.5} textAnchor="middle" fontSize={0.9} fill="#b4c0cc">10 m</text>
        </g>
      </svg>

      {hover && (
        <div className="pointer-events-none absolute right-3 top-3 w-56 rounded-lg border border-line-strong bg-bg/95 p-3 text-xs shadow-xl backdrop-blur">
          <div className="flex items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5" style={{ background: hover.cls === "weed" ? WEED : CROP, borderRadius: hover.cls === "weed" ? 99 : 2 }} />
            {hover.cls} #{hover.id}
            {hover.cls === "weed" && (
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${hover.sprayed ? "bg-violet/15 text-violet" : "bg-surface-3 text-muted"}`}>
                {hover.sprayed ? "sprayed" : "not sprayed"}
              </span>
            )}
          </div>
          <dl className="mt-2 space-y-1 font-mono text-ink-2 num">
            <div className="flex justify-between"><dt className="text-muted">lat</dt><dd>{hover.lat.toFixed(7)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">lon</dt><dd>{hover.lon.toFixed(7)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">E / N</dt><dd>{hover.x.toFixed(1)} / {hover.y.toFixed(1)} m</dd></div>
            <div className="flex justify-between"><dt className="text-muted">confidence</dt><dd>{hover.conf.toFixed(2)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">size</dt><dd>{(hover.size * 100).toFixed(0)} cm</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
