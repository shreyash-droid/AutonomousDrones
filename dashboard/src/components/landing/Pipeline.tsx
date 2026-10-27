"use client";

import { motion } from "framer-motion";
import { Camera, Cpu, Droplets, Layers, Map, MapPin, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/motion";

const STEPS = [
  { icon: Camera, title: "Capture", text: "A nadir camera photographs each survey point from 10 m. That is about 1 cm of ground per pixel.", tag: "Pi Camera" },
  { icon: Cpu, title: "Detect", text: "YOLO11 runs on the onboard computer and labels every plant as crop or weed.", tag: "YOLO11 · NCNN" },
  { icon: MapPin, title: "Georeference", text: "Altitude, field of view and heading convert each pixel into metres, then into a GPS coordinate.", tag: "pixel → GPS" },
  { icon: ShieldCheck, title: "Protect crops", text: "A weed within 15 cm of a crop plant is never sprayed.", tag: "safety filter" },
  { icon: Layers, title: "Cluster & route", text: "Neighbouring weeds are merged into one shot, and visits are ordered nearest-first.", tag: "path planning" },
  { icon: Droplets, title: "Spot-spray", text: "The drone descends to 3 m, hovers, and pulses the pump for 600 ms on each cluster.", tag: "Arduino + pump" },
  { icon: Map, title: "Map & report", text: "Every weed is logged with its GPS position and sprayed status, exported as GeoJSON, CSV or KML.", tag: "weed map" },
];

export default function Pipeline() {
  return (
    <section id="how" className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <Reveal className="max-w-2xl">
        <p className="eyebrow text-brand">How it works</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          From one photo to one precise spray shot, in under a second.
        </h2>
        <p className="mt-4 text-ink-2">
          This loop runs at every survey point, fully onboard. No cloud and no internet connection are needed in the field.
        </p>
      </Reveal>

      <div className="relative mt-14">
        {/* animated connector */}
        <div className="absolute left-[27px] top-2 bottom-2 w-px bg-line md:hidden" />
        <motion.div
          className="absolute left-[27px] top-2 w-px origin-top bg-gradient-to-b from-brand to-sky md:hidden"
          initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 2.2, ease: "easeInOut" }} style={{ bottom: 8 }}
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08}>
              <div className="group relative flex h-full gap-4 rounded-2xl border border-line bg-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:bg-surface-2 md:flex-col">
                <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-brand transition-colors group-hover:border-brand/50 group-hover:bg-brand/10">
                  <s.icon className="h-6 w-6" strokeWidth={1.7} />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-bg font-mono text-[10px] text-ink-2">
                    {i + 1}
                  </span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{s.title}</h3>
                    <span className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted">{s.tag}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal delay={STEPS.length * 0.08}>
            <div className="flex h-full flex-col justify-center rounded-2xl border border-dashed border-brand/40 bg-brand/[0.04] p-5">
              <p className="font-mono text-xs text-brand">loop × every survey point</p>
              <p className="mt-2 text-sm text-ink-2">
                Then the drone returns to launch and lands automatically. Failsafes stay active the whole time.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
