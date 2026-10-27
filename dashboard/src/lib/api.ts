// Client for the Python backend (simulation/server.py), proxied at /backend/*
// by next.config.ts so the browser never needs CORS.

export const BACKEND = "/backend";
export const GCS_URL = process.env.NEXT_PUBLIC_GCS_URL ?? "http://localhost:8000";

export type Box = {
  class_name: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type DetectResult = {
  width: number;
  height: number;
  inference_ms: number;
  confidence: number;
  detections: Box[];
  weeds: number;
  crops: number;
};

export type Info = {
  classes: string[];
  model_path: string;
  confidence: number;
  image_size: number;
  camera: { hfov_deg: number; vfov_deg: number; resolution: [number, number] };
  mission: { survey_altitude_m: number; spray_altitude_m: number; speed_m_s: number; strategy: string };
  mission_running: boolean;
};

export type Sample = { name: string; url: string; width: number; height: number };

export type BatchRow = Box & { image_name: string };
export type Batch = {
  available: boolean;
  rows: BatchRow[];
  images: { name: string; annotated: string; original: string }[];
};

export type Summary = {
  outcome: string;
  flight_time_s: number;
  distance_m: number;
  photos: number;
  area_m2: number;
  weeds: number;
  crops: number;
  weeds_sprayed: number;
  spray_shots: number;
  herbicide_ml: number;
  blanket_ml: number;
  savings_pct: number;
  avg_inference_ms: number;
};

export type Plan = {
  field: [number, number][];
  waypoints: [number, number][];
  home: { lat: number; lon: number };
  altitude: number;
  area_m2: number;
};

export type MapItem = {
  id: number;
  cls: string;
  conf: number;
  x: number;
  y: number;
  lat: number;
  lon: number;
  size: number;
  sprayed: boolean;
};

export type Flight = { file: string; summary: Summary; plan: Plan | null };
export type FlightDetail = Flight & { items: MapItem[] };

export class BackendError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new BackendError("Backend unreachable");
  }
  if (res.status >= 500) throw new BackendError("Backend unreachable");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  info: () => call<Info>("/api/info"),
  samples: () => call<Sample[]>("/api/samples"),
  batch: () => call<Batch>("/api/batch"),
  flights: () => call<Flight[]>("/api/flights"),
  flight: (file: string) => call<FlightDetail>(`/api/flights/${encodeURIComponent(file)}`),
  detectSample: (name: string, conf: number) =>
    call<DetectResult>(`/api/detect?sample=${encodeURIComponent(name)}&conf=${conf}`, { method: "POST" }),
  detectFile: (file: Blob, conf: number) =>
    call<DetectResult>(`/api/detect?conf=${conf}`, {
      method: "POST",
      body: file,
      headers: { "Content-Type": "application/octet-stream" },
    }),
};

export const asset = (path: string) => `${BACKEND}${path}`;

export function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export function downloadText(name: string, text: string, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [keys.join(","), ...rows.map((r) => keys.map((k) => String(r[k])).join(","))].join("\n");
}
