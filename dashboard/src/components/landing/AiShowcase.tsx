"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Reveal } from "@/components/ui/motion";

type Item = {
  name: string;
  url: string;
  width: number;
  height: number;
  boxes: { cls: string; conf: number; x1: number; y1: number; x2: number; y2: number }[];
};

export default function AiShowcase() {
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    fetch("/showcase/showcase.json").then((r) => r.json()).then((d) => setItems(d.items)).catch(() => {});
  }, []);

  // auto-advance until the visitor interacts
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || !items.length) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), 6500);
    return () => clearInterval(id);
  }, [auto, items.length]);

  const item = items[idx];
  const weeds = item?.boxes.filter((b) => b.cls === "weed") ?? [];
  const crops = item?.boxes.filter((b) => b.cls !== "weed") ?? [];
  const avgConf = item?.boxes.length ? item.boxes.reduce((s, b) => s + b.conf, 0) / item.boxes.length : 0;

  return (
    <section id="ai" className="relative border-y border-line bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[1fr_1.25fr] lg:items-center">
        <Reveal>
          <p className="eyebrow text-brand">AI in action</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Trained to tell a weed from a crop, from 10 metres up.
          </h2>
          <p className="mt-4 text-ink-2">
            These are real outputs of our YOLO11 model on drone imagery. Every box is a decision the drone makes onboard:
            <span className="text-weed"> weeds</span> are queued for spraying, while
            <span className="text-crop"> crops</span> are protected.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              ["Weeds", weeds.length, "text-weed"],
              ["Crops", crops.length, "text-crop"],
              ["Avg. confidence", avgConf ? avgConf.toFixed(2) : "–", "text-ink"],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-xl border border-line bg-surface p-4">
                <div className={`num text-2xl font-semibold ${color}`}>{value}</div>
                <div className="mt-1 text-xs text-muted">{label}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {items.map((it, i) => (
              <button key={it.name} onClick={() => { setIdx(i); setAuto(false); }}
                      className={`overflow-hidden rounded-lg border-2 transition-all ${i === idx ? "border-brand" : "border-transparent opacity-60 hover:opacity-100"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.name} className="h-14 w-20 object-cover" />
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)]">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5 font-mono text-[11px] text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-weed/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-brand/80" />
              <span className="ml-2">onboard-camera · {item?.name ?? "loading"}</span>
              <span className="ml-auto text-brand">● inference</span>
            </div>
            <div className="relative" style={{ aspectRatio: item ? `${item.width} / ${item.height}` : "1 / 1" }}>
              <AnimatePresence mode="wait">
                {item && (
                  <motion.div key={item.name} className="absolute inset-0"
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              transition={{ duration: 0.4 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={`Drone image ${item.name}`} className="absolute inset-0 h-full w-full object-cover" />
                    {/* scan sweep */}
                    <motion.div className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-sky/25 to-transparent"
                                initial={{ top: "-15%" }} animate={{ top: "105%" }}
                                transition={{ duration: 1.4, ease: "easeInOut" }} />
                    {item.boxes.map((b, i) => {
                      const color = b.cls === "weed" ? "#ee5f4c" : "#20a7a0";
                      return (
                        <motion.div key={i}
                                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                                    className="absolute rounded-[3px] border-2"
                                    style={{
                                      left: `${(b.x1 / item.width) * 100}%`, top: `${(b.y1 / item.height) * 100}%`,
                                      width: `${((b.x2 - b.x1) / item.width) * 100}%`, height: `${((b.y2 - b.y1) / item.height) * 100}%`,
                                      borderColor: color, boxShadow: `0 0 0 1px rgba(0,0,0,.5), 0 0 14px ${color}66`,
                                    }}
                                    initial={{ opacity: 0, scale: 1.8 }} animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.5 + (b.y1 / item.height) * 1.1, duration: 0.35 }}>
                          {(hover === i || b.cls !== "weed") && (
                            <span className="absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-black"
                                  style={{ background: color }}>
                              {b.cls} {b.conf.toFixed(2)}
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted">Hover a box to see its confidence. Upload your own image in the dashboard.</p>
        </Reveal>
      </div>
    </section>
  );
}
