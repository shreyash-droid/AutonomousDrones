"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Series = { key: string; label: string; color: string };

const AXIS = { stroke: "#2a3846", tick: { fill: "#7d8c9b", fontSize: 11 }, tickLine: false };

function ChartTooltip({ active, payload, label, series, labelFmt }: {
  active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string;
  series: Series[]; labelFmt?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-line-strong bg-bg/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur">
      <div className="mb-1.5 font-semibold text-ink">{labelFmt ? labelFmt(String(label)) : label}</div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return (
          <div key={s.key} className="flex items-center justify-between gap-6 py-0.5 text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} /> {s.label}
            </span>
            <span className="num font-semibold text-ink">{p?.value ?? 0}</span>
          </div>
        );
      })}
      {series.length > 1 && (
        <div className="mt-1 flex justify-between border-t border-line pt-1 text-muted">
          <span>Total</span><span className="num">{total}</span>
        </div>
      )}
    </div>
  );
}

/** Bar chart; stacked=true stacks series, otherwise groups them. */
export function Bars({ data, x, series, stacked = false, height = 280, labelFmt }: {
  data: Record<string, string | number>[]; x: string; series: Series[];
  stacked?: boolean; height?: number; labelFmt?: (l: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="#1d2834" />
        <XAxis dataKey={x} {...AXIS} axisLine={{ stroke: "#2a3846" }} interval={0} />
        <YAxis {...AXIS} axisLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(125,140,155,0.08)" }}
                 content={<ChartTooltip series={series} labelFmt={labelFmt} />} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color}
               stackId={stacked ? "a" : undefined}
               stroke="#0c1219" strokeWidth={stacked ? 2 : 0}
               radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
               maxBarSize={44} animationDuration={900} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
