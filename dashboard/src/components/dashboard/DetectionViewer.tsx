"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { Box } from "@/lib/api";
import { CROP, WEED } from "./ui";

export default function DetectionViewer({ src, width, height, boxes, show, gsdCm, busy }: {
  src: string; width: number; height: number; boxes: Box[];
  show: { weed: boolean; crop: boolean }; gsdCm?: number; busy?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const visible = boxes.map((b, i) => ({ b, i })).filter(({ b }) => (b.class_name === "weed" ? show.weed : show.crop));

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-black"
         style={{ aspectRatio: `${width} / ${height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Analysed field image" className="absolute inset-0 h-full w-full object-fill" />
      {busy && (
        <motion.div className="absolute inset-x-0 h-28 bg-gradient-to-b from-transparent via-sky/30 to-transparent"
                    initial={{ top: "-20%" }} animate={{ top: "110%" }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }} />
      )}
      {visible.map(({ b, i }) => {
        const color = b.class_name === "weed" ? WEED : CROP;
        const active = hover === i;
        const sizeCm = gsdCm ? Math.max(b.x2 - b.x1, b.y2 - b.y1) * gsdCm : null;
        return (
          <motion.div key={`${i}-${b.x1}`}
                      className="absolute cursor-pointer rounded-[3px] border-2"
                      onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                      style={{
                        left: `${(b.x1 / width) * 100}%`, top: `${(b.y1 / height) * 100}%`,
                        width: `${((b.x2 - b.x1) / width) * 100}%`, height: `${((b.y2 - b.y1) / height) * 100}%`,
                        borderColor: color,
                        background: active ? `${color}33` : "transparent",
                        boxShadow: `0 0 0 1px rgba(0,0,0,.55)${active ? `, 0 0 18px ${color}` : ""}`,
                        zIndex: active ? 20 : 1,
                      }}
                      initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: Math.min(0.6, (b.y1 / height) * 0.6) }}>
            {active && (
              <div className={`absolute left-0 z-30 whitespace-nowrap rounded-md border border-line-strong bg-bg/95 px-2.5 py-1.5 text-[11px] shadow-xl backdrop-blur ${b.y1 / height < 0.15 ? "top-full mt-1.5" : "bottom-full mb-1.5"}`}>
                <div className="flex items-center gap-1.5 font-semibold text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {b.class_name}
                </div>
                <div className="num mt-0.5 text-ink-2">confidence {b.confidence.toFixed(2)}</div>
                {sizeCm && <div className="num text-muted">≈ {sizeCm.toFixed(0)} cm across</div>}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
