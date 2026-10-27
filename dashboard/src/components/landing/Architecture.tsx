"use client";

import { BatteryCharging, Camera, Cpu, Droplets, Gauge, Monitor, Radio, Satellite, Zap } from "lucide-react";
import { Reveal } from "@/components/ui/motion";

type Node = {
  id: string; x: number; y: number; w: number; h: number;
  title: string; sub: string; icon: typeof Cpu; tone: "flight" | "ai" | "spray" | "power" | "ground";
};

const TONE = {
  flight: "#3ddc97",
  ai: "#4cb8ff",
  spray: "#a98bff",
  power: "#f5b14c",
  ground: "#b4c0cc",
};

const NODES: Node[] = [
  { id: "gcs", x: 30, y: 60, w: 200, h: 84, title: "Ground station", sub: "web GCS · live map", icon: Monitor, tone: "ground" },
  { id: "rc", x: 30, y: 376, w: 200, h: 84, title: "RC transmitter", sub: "safety pilot override", icon: Radio, tone: "ground" },
  { id: "gps", x: 320, y: 40, w: 190, h: 74, title: "GNSS + compass", sub: "M8N / M10", icon: Satellite, tone: "flight" },
  { id: "fc", x: 300, y: 186, w: 230, h: 120, title: "Pixhawk", sub: "ArduCopter 4.5 · EKF3 · failsafes", icon: Gauge, tone: "flight" },
  { id: "esc", x: 320, y: 392, w: 190, h: 74, title: "4 × ESC + motors", sub: "DShot · 920 KV", icon: Zap, tone: "flight" },
  { id: "cam", x: 615, y: 40, w: 190, h: 74, title: "Nadir camera", sub: "CSI · gimbal", icon: Camera, tone: "ai" },
  { id: "pi", x: 600, y: 186, w: 230, h: 120, title: "Raspberry Pi 5", sub: "YOLO11 · mission · georef", icon: Cpu, tone: "ai" },
  { id: "bat", x: 615, y: 392, w: 190, h: 74, title: "4S LiPo 5200 mAh", sub: "PM · 5 V / 12 V BEC", icon: BatteryCharging, tone: "power" },
  { id: "mcu", x: 885, y: 186, w: 190, h: 120, title: "Arduino Nano", sub: "sprayer firmware · watchdog", icon: Cpu, tone: "spray" },
  { id: "pump", x: 885, y: 392, w: 190, h: 74, title: "Pump + nozzle", sub: "flow sensor · 2 L tank", icon: Droplets, tone: "spray" },
];

const LINKS: { d: string; label: string; lx: number; ly: number; color: string; dur: number; both?: boolean }[] = [
  { d: "M130 60 V18 H845 V150 H790 V186", label: "telemetry · Wi-Fi / 4G", lx: 480, ly: 12, color: TONE.ground, dur: 4.2, both: true },
  { d: "M230 418 H262 V280 H300", label: "RC", lx: 268, ly: 350, color: TONE.ground, dur: 2.4 },
  { d: "M415 114 V186", label: "", lx: 0, ly: 0, color: TONE.flight, dur: 1.4 },
  { d: "M415 306 V392", label: "PWM", lx: 424, ly: 354, color: TONE.flight, dur: 1.3 },
  { d: "M530 238 H600", label: "MAVLink 2", lx: 565, ly: 228, color: TONE.ai, dur: 1.5, both: true },
  { d: "M710 114 V186", label: "images", lx: 720, ly: 154, color: TONE.ai, dur: 1.3 },
  { d: "M830 246 H885", label: "SPRAY ms", lx: 857, ly: 236, color: TONE.spray, dur: 1.2, both: true },
  { d: "M980 306 V392", label: "MOSFET", lx: 990, ly: 354, color: TONE.spray, dur: 1.2 },
  { d: "M615 446 H510", label: "", lx: 0, ly: 0, color: TONE.power, dur: 1.8 },
  { d: "M710 392 V306", label: "", lx: 0, ly: 0, color: TONE.power, dur: 1.6 },
  { d: "M615 412 H560 V284 H530", label: "power", lx: 566, ly: 352, color: TONE.power, dur: 2 },
];

export default function Architecture() {
  return (
    <section id="hardware" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="eyebrow text-brand">Hardware architecture</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A real aircraft, fully specified.</h2>
        <p className="mt-4 text-ink-2">
          Each block has production driver code, wiring tables and a bill of materials in the repository.
          The demo swaps the camera, the flight controller and the sprayer for simulated twins that share the same interface.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mt-12">
        <div className="card overflow-x-auto p-4 sm:p-6">
          <svg viewBox="0 0 1105 486" className="min-w-[760px]" role="img" aria-label="Drone hardware block diagram">
            <defs>
              {LINKS.map((l, i) => <path key={i} id={`ln${i}`} d={l.d} />)}
            </defs>
            {LINKS.map((l, i) => (
              <g key={i}>
                <path d={l.d} fill="none" stroke={l.color} strokeOpacity="0.28" strokeWidth="2" />
                <path d={l.d} fill="none" stroke={l.color} strokeOpacity="0.7" strokeWidth="1.6"
                      strokeDasharray="4 8" className="animate-dash" />
                <circle r="3.6" fill={l.color}>
                  <animateMotion dur={`${l.dur}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#ln${i}`} />
                  </animateMotion>
                </circle>
                {l.both && (
                  <circle r="3.6" fill={l.color} opacity="0.75">
                    <animateMotion dur={`${l.dur * 1.3}s`} repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear">
                      <mpath href={`#ln${i}`} />
                    </animateMotion>
                  </circle>
                )}
                {l.label && (
                  <text x={l.lx} y={l.ly} fontSize="10.5" fontWeight="600" fill="#7d8c9b"
                        textAnchor={l.lx > 860 || l.lx === 268 ? "start" : "middle"} fontFamily="var(--font-mono)">
                    {l.label}
                  </text>
                )}
              </g>
            ))}
            {NODES.map((n) => {
              const c = TONE[n.tone];
              const big = n.h > 100;
              return (
                <g key={n.id}>
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="14" fill="#111922" stroke={c}
                        strokeOpacity={big ? 0.9 : 0.45} strokeWidth={big ? 1.8 : 1.2} />
                  {big && <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="14" fill={c} opacity="0.05" />}
                  <rect x={n.x + 14} y={n.y + (big ? 18 : n.h / 2 - 17)} width="34" height="34" rx="9" fill={c} opacity="0.13" />
                  <n.icon x={n.x + 21} y={n.y + (big ? 25 : n.h / 2 - 10)} width="20" height="20" color={c} strokeWidth={1.8} />
                  <text x={n.x + 58} y={n.y + (big ? 33 : n.h / 2 - 2)} fontSize="14.5" fontWeight="650" fill="#e7edf3">{n.title}</text>
                  <text x={n.x + 58} y={n.y + (big ? 51 : n.h / 2 + 15)} fontSize="11" fill="#7d8c9b">{n.sub}</text>
                  {big && (
                    <text x={n.x + 14} y={n.y + n.h - 16} fontSize="10" fontFamily="var(--font-mono)" fill={c} opacity="0.85">
                      {n.id === "fc" ? "flight_controller.py" : n.id === "pi" ? "drone/main.py" : "sprayer_controller.ino"}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Flight stack", "Pixhawk with ArduCopter handles stabilisation, navigation and its own failsafes for battery, RC loss and geofence.", TONE.flight],
          ["Companion AI", "The Raspberry Pi runs YOLO11, georeferences detections and commands the Pixhawk over MAVLink in GUIDED mode.", TONE.ai],
          ["Sprayer", "The Arduino drives the pump with a link watchdog, an RC kill switch, a maximum spray time and a tank-empty sensor.", TONE.spray],
        ].map(([t, d, c], i) => (
          <Reveal key={t} delay={i * 0.08}>
            <div className="card card-pad h-full">
              <div className="mb-3 h-1 w-10 rounded-full" style={{ background: c }} />
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
