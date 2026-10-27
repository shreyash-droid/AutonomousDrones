"use client";

import { motion } from "framer-motion";
import { CountUp, Reveal } from "@/components/ui/motion";

// Numbers from the reference simulated mission over the 1,200 m² demo field
// (logs/flight_*.jsonl - see README). Blanket rate: 300 L/ha.
const BLANKET_L = 36.0;
const SPOT_L = 1.29;

export default function Impact() {
  return (
    <section id="impact" className="relative overflow-hidden border-y border-line bg-surface/40">
      <div className="pointer-events-none absolute -right-40 top-10 h-[420px] w-[420px] rounded-full bg-brand/10 blur-[120px]" />
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="eyebrow text-brand">Impact</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Spray the weed, <span className="text-gradient">not the field.</span>
            </h2>
            <p className="mt-4 text-ink-2">
              Conventional boom spraying covers every square metre. Spot spraying puts herbicide only where the AI
              found a weed. Less chemical reaches the soil and the water, the crop suffers less stress, and the farmer
              spends less on herbicide.
            </p>

            <div className="mt-10 space-y-6" role="img"
                 aria-label={`Herbicide per mission: blanket spraying ${BLANKET_L} litres, AgriDrone spot spraying ${SPOT_L} litres`}>
              {[
                { label: "Blanket spraying", value: BLANKET_L, color: "#4a5868", note: "300 L/ha × 1,200 m²" },
                { label: "AgriDrone spot spraying", value: SPOT_L, color: "#3ddc97", note: "86 shots × 15 ml" },
              ].map((b, i) => (
                <div key={b.label}>
                  <div className="mb-2 flex items-baseline justify-between text-sm">
                    <span className="font-medium text-ink">{b.label}</span>
                    <span className="num font-semibold text-ink">{b.value.toFixed(b.value < 10 ? 2 : 1)} L</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-surface-3">
                    <motion.div className="h-full rounded-full" style={{ background: b.color }}
                                initial={{ width: 0 }} whileInView={{ width: `${Math.max(1.5, (b.value / BLANKET_L) * 100)}%` }}
                                viewport={{ once: true }} transition={{ duration: 1.4, delay: 0.2 + i * 0.3, ease: [0.16, 1, 0.3, 1] }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{b.note}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <div className="grid grid-cols-2 gap-4">
            {[
              { to: 96.4, d: 1, s: "%", label: "less herbicide", sub: "vs blanket spraying", accent: true },
              { to: 93, d: 0, s: "", label: "weeds mapped", sub: "geo-tagged to GPS" },
              { to: 12, d: 0, s: "", label: "crop plants protected", sub: "15 cm safety margin" },
              { to: 110, d: 0, s: " ms", label: "AI inference", sub: "per photo, laptop CPU" },
              { to: 1200, d: 0, s: " m²", label: "surveyed per flight", sub: "in about 5 minutes" },
              { to: 3, d: 0, s: "", label: "layers of failsafe", sub: "software · Pixhawk · MCU" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 0.07}>
                <div className={`h-full rounded-2xl border p-5 ${s.accent ? "border-brand/40 bg-brand/[0.06]" : "border-line bg-surface"}`}>
                  <div className={`text-3xl font-semibold tracking-tight sm:text-4xl ${s.accent ? "text-brand" : "text-ink"}`}>
                    <CountUp to={s.to} decimals={s.d} suffix={s.s} />
                  </div>
                  <div className="mt-2 text-sm font-medium text-ink">{s.label}</div>
                  <div className="text-xs text-muted">{s.sub}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
