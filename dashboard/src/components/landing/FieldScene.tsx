"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* Top-down animated mission: the drone flies a lawn-mower survey, its camera
 * footprint sweeps the field, weeds are detected (boxes + confidence) and then
 * spot-sprayed (ripple, turns violet). Everything is derived from time t, so
 * the loop is deterministic and cheap. */

const W = 640;
const H = 460;
const LANES = [95, 230, 365];
const X0 = 70;
const X1 = 570;
const SPEED = 120; // px / s
const FOOT_W = 118;
const FOOT_H = 112;
const SPRAY_DELAY = 0.9; // s after detection

// integer hash -> [0, 1): bit-identical on the server and in every browser
// (Math.sin differs in the last digits between engines and breaks hydration)
function rand(seed: number) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return Math.round(((h >>> 0) / 4294967296) * 1000) / 1000;
}

// lawn-mower path: start bottom-left (home) -> lane 1 -> ... -> home
const PATH: [number, number][] = [
  [30, 430],
  [X0, LANES[2]], [X1, LANES[2]],
  [X1, LANES[1]], [X0, LANES[1]],
  [X0, LANES[0]], [X1, LANES[0]],
  [30, 430],
];

const SEGS = PATH.slice(1).map((p, i) => {
  const a = PATH[i];
  return { a, b: p, len: Math.hypot(p[0] - a[0], p[1] - a[1]) };
});
const TOTAL = SEGS.reduce((s, g) => s + g.len, 0);
const LOOP = TOTAL / SPEED + 2.5; // seconds, with a pause at home

function posAt(t: number): [number, number] {
  let d = Math.min(t * SPEED, TOTAL);
  for (const s of SEGS) {
    if (d <= s.len) {
      const k = d / s.len;
      return [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k];
    }
    d -= s.len;
  }
  return PATH[PATH.length - 1];
}

type Weed = { x: number; y: number; r: number; conf: number; tDetect: number };

export default function FieldScene() {
  const [t, setT] = useState(0);
  const start = useRef<number | null>(null);

  const crops = useMemo(() => {
    const out: { x: number; y: number; s: number; rot: number }[] = [];
    for (let row = 0; row < 9; row++) {
      const y = 40 + row * 47;
      for (let i = 0; i < 15; i++) {
        const k = row * 31 + i;
        out.push({ x: 45 + i * 39 + rand(k) * 8, y: y + rand(k + 7) * 6, s: 5 + rand(k + 3) * 3, rot: rand(k + 1) * 180 });
      }
    }
    return out;
  }, []);

  const weeds = useMemo<Weed[]>(() => {
    const pts: [number, number][] = [
      [112, 380], [205, 350], [318, 392], [420, 352], [512, 383],
      [150, 252], [262, 210], [360, 247], [470, 214], [545, 243],
      [120, 80], [228, 118], [337, 75], [440, 110], [530, 85],
    ];
    // detection time = first moment the camera footprint covers the weed
    return pts.map(([x, y], i) => {
      let tDetect = Infinity;
      for (let s = 0; s < LOOP; s += 0.02) {
        const [dx, dy] = posAt(s);
        if (Math.abs(dx - x) < FOOT_W / 2 && Math.abs(dy - y) < FOOT_H / 2) {
          tDetect = s;
          break;
        }
      }
      return { x, y, r: 4 + rand(i + 40) * 3, conf: 0.62 + rand(i + 90) * 0.33, tDetect };
    });
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setT(LOOP * 0.55);
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (start.current === null) start.current = now;
      setT(((now - start.current) / 1000) % LOOP);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const [x, y] = posAt(t);
  const flying = t * SPEED < TOTAL;
  const detected = weeds.filter((w) => t >= w.tDetect).length;
  const sprayed = weeds.filter((w) => t >= w.tDetect + SPRAY_DELAY).length;
  const travelled = Math.min(t * SPEED, TOTAL);

  // flown trail as dash offset of the full path
  const pathD = "M" + PATH.map((p) => p.join(",")).join(" L");
  const scanY = y - FOOT_H / 2 + ((t * 1.6) % 1) * FOOT_H;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
           aria-label="Animation of the drone surveying a field, detecting and spraying weeds">
        <defs>
          <linearGradient id="soil" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2a2116" />
            <stop offset="55%" stopColor="#231b12" />
            <stop offset="100%" stopColor="#1a140d" />
          </linearGradient>
          <pattern id="furrow" width="640" height="47" patternUnits="userSpaceOnUse">
            <rect width="640" height="47" fill="transparent" />
            <rect y="20" width="640" height="10" fill="rgba(0,0,0,0.16)" />
          </pattern>
          <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
            <stop offset="60%" stopColor="rgba(6,9,13,0)" />
            <stop offset="100%" stopColor="rgba(6,9,13,0.85)" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect width={W} height={H} rx="18" fill="url(#soil)" />
        <rect width={W} height={H} fill="url(#furrow)" />

        {/* crops */}
        {crops.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`}>
            <ellipse rx={c.s} ry={c.s * 0.45} fill="#2f8f5b" opacity="0.9" />
            <ellipse rx={c.s * 0.45} ry={c.s} fill="#3aa86b" opacity="0.85" />
          </g>
        ))}

        {/* field boundary / geofence */}
        <rect x="18" y="18" width={W - 36} height={H - 36} rx="12" fill="none"
              stroke="#f5b14c" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="8 7" />

        {/* planned path and flown trail */}
        <path d={pathD} fill="none" stroke="rgba(231,237,243,0.28)" strokeWidth="1.5" strokeDasharray="5 7" />
        <path d={pathD} fill="none" stroke="#4cb8ff" strokeWidth="2.2" strokeOpacity="0.85"
              strokeDasharray={`${travelled} ${TOTAL}`} />

        {/* weeds */}
        {weeds.map((w, i) => {
          const isDet = t >= w.tDetect;
          const isSpr = t >= w.tDetect + SPRAY_DELAY;
          const since = t - w.tDetect - SPRAY_DELAY;
          const b = w.r + 7;
          return (
            <g key={i}>
              {[0, 1, 2].map((k) => (
                <circle key={k} cx={w.x + (k - 1) * 3} cy={w.y + (k % 2 ? -2 : 2)} r={w.r * 0.7}
                        fill={isSpr ? "#a98bff" : "#7f9a3a"} opacity={0.9} />
              ))}
              {isDet && !isSpr && (
                <g filter="url(#glow)">
                  <rect x={w.x - b} y={w.y - b} width={b * 2} height={b * 2} rx="3" fill="none"
                        stroke="#ee5f4c" strokeWidth="1.8" />
                  <rect x={w.x - b} y={w.y - b - 14} width="58" height="13" rx="2" fill="#ee5f4c" />
                  <text x={w.x - b + 4} y={w.y - b - 4} fontSize="9" fontWeight="700" fill="#1a0705"
                        fontFamily="ui-monospace, monospace">weed {w.conf.toFixed(2)}</text>
                </g>
              )}
              {isSpr && since < 1.2 && (
                <circle cx={w.x} cy={w.y} r={6 + since * 26} fill="rgba(76,184,255,0.18)"
                        stroke="#4cb8ff" strokeOpacity={1 - since / 1.2} strokeWidth="2" />
              )}
              {isSpr && <circle cx={w.x} cy={w.y} r={w.r + 4} fill="none" stroke="#a98bff" strokeWidth="1.5" />}
            </g>
          );
        })}

        {/* camera footprint + scan line */}
        {flying && (
          <g>
            <rect x={x - FOOT_W / 2} y={y - FOOT_H / 2} width={FOOT_W} height={FOOT_H} rx="4"
                  fill="rgba(76,184,255,0.07)" stroke="#4cb8ff" strokeOpacity="0.8" strokeWidth="1.2" />
            <line x1={x - FOOT_W / 2} x2={x + FOOT_W / 2} y1={scanY} y2={scanY}
                  stroke="#4cb8ff" strokeOpacity="0.55" strokeWidth="1.2" />
            {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy], i) => (
              <path key={i}
                    d={`M${x + sx * FOOT_W / 2} ${y + sy * (FOOT_H / 2 - 12)} V${y + sy * FOOT_H / 2} H${x + sx * (FOOT_W / 2 - 12)}`}
                    fill="none" stroke="#4cb8ff" strokeWidth="2.4" />
            ))}
          </g>
        )}

        {/* home pad */}
        <circle cx="30" cy="430" r="13" fill="#f5b14c" />
        <text x="30" y="434.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#2a1a03">H</text>

        {/* drone */}
        <g transform={`translate(${x} ${y})`}>
          <ellipse cx="9" cy="11" rx="22" ry="17" fill="rgba(0,0,0,0.35)" />
          <path d="M-14 -14L14 14M14 -14L-14 14" stroke="#e7edf3" strokeWidth="3.4" strokeLinecap="round" />
          {[[-14, -14], [14, -14], [14, 14], [-14, 14]].map(([px, py], i) => (
            <g key={i} transform={`translate(${px} ${py})`}>
              <circle r="9" fill="rgba(76,184,255,0.16)" stroke="#4cb8ff" strokeWidth="1.2" />
              <g style={{ transform: `rotate(${t * 2200 * (i % 2 ? 1 : -1)}deg)` }}>
                <line x1="-8" x2="8" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            </g>
          ))}
          <rect x="-6.5" y="-6.5" width="13" height="13" rx="3" fill="#3ddc97" />
          <circle cy="-5" r="2" fill="#ee5f4c" />
        </g>

        <rect width={W} height={H} rx="18" fill="url(#vignette)" pointerEvents="none" />
      </svg>

      {/* HUD */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-line-strong/80 bg-bg/80 px-3 py-2 font-mono text-[11px] leading-5 text-ink-2 backdrop-blur sm:left-4 sm:top-4">
        <div className="flex items-center gap-2 text-brand">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          {flying ? "AUTO · SURVEY" : "LANDED · RTL"}
        </div>
        <div>ALT <span className="num text-ink">{flying ? "10.0" : "0.0"} m</span> · YOLO11</div>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 flex gap-2 sm:bottom-4 sm:right-4">
        <span className="rounded-lg border border-weed/40 bg-bg/85 px-2.5 py-1.5 font-mono text-[11px] text-ink backdrop-blur">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-weed" />
          detected <b className="num">{detected}</b>
        </span>
        <span className="rounded-lg border border-violet/40 bg-bg/85 px-2.5 py-1.5 font-mono text-[11px] text-ink backdrop-blur">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-violet" />
          sprayed <b className="num">{sprayed}</b>
        </span>
      </div>
    </div>
  );
}
