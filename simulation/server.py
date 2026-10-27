"""Web Ground Control Station (GCS) server.

    python simulation/server.py            -> open http://localhost:8000

* Runs the REAL onboard mission code (drone/mission.py) with simulated
  flight controller / camera / sprayer, and the REAL YOLO11 model.
* Streams every event to the browser over WebSocket (/ws).
* On the real aircraft, the drone connects to /ws/drone and streams the
  same events, so this page becomes the live ground station for the flight.
"""

import asyncio
import csv
import json
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from drone.config import load_config
from drone.detector import WeedDetector
from drone.main import build_system, shutdown
from drone.telemetry import CallbackPublisher, JsonlLogger, MultiPublisher

WEB_DIR = Path(__file__).resolve().parent / "web"


# ===================================================================== hub
class Hub:
    """Fan-out of events to every connected browser + history for late joiners."""

    def __init__(self):
        self.viewers = set()
        self.loop = None
        self.reset()

    def reset(self):
        self.plan = None
        self.history = []          # detections, spray, state, mission, log
        self.last_telemetry = None

    def publish_threadsafe(self, event):
        if self.loop:
            self.loop.call_soon_threadsafe(self._publish, event)

    def _publish(self, event):
        t = event.get("type")
        if t == "plan":
            self.plan = event
        elif t == "telemetry":
            self.last_telemetry = event
        elif t != "hello":
            self.history.append(event)
            if len(self.history) > 3000:
                self.history = self.history[-3000:]
        for q in list(self.viewers):
            if q.qsize() < 1000:
                q.put_nowait(event)

    def snapshot(self):
        events = [self.plan] if self.plan else []
        events += self.history
        if self.last_telemetry:
            events.append(self.last_telemetry)
        return events


hub = Hub()


# ================================================================ session
class SimSession:
    def __init__(self):
        self.cfg = load_config(overrides={"mode": "sim", "telemetry": {"rate_hz": 12}})
        print("Loading YOLO11 model ...")
        self.detector = WeedDetector(self.cfg["detector"])
        self.detector.warmup()
        self.controller = None
        self.components = ()
        self.thread = None
        self.preview = self._preview_plan()

    @property
    def running(self):
        return self.thread is not None and self.thread.is_alive()

    def _preview_plan(self):
        events = []
        ctrl, comps = build_system(self.cfg, "sim", CallbackPublisher(events.append), self.detector)
        ctrl.plan()
        shutdown(comps)
        return next(e for e in events if e["type"] == "plan")

    def start(self, options):
        if self.running:
            raise RuntimeError("Mission already running")
        overrides = {"mission": {}, "detector": {}}
        if options.get("strategy") in ("detect_and_spray", "survey_only"):
            overrides["mission"]["strategy"] = options["strategy"]
        if options.get("speed"):
            overrides["mission"]["speed_m_s"] = float(options["speed"])
        cfg = load_config(overrides={"mode": "sim", "telemetry": {"rate_hz": 12}, **overrides})
        if options.get("confidence"):
            self.detector.confidence = float(options["confidence"])
        hub.reset()
        logger = JsonlLogger(ROOT / cfg["telemetry"]["log_dir"])
        pub = MultiPublisher(CallbackPublisher(hub.publish_threadsafe), logger)
        speedup = float(options.get("speedup") or cfg["sim"]["speedup"])
        self.controller, self.components = build_system(cfg, "sim", pub, self.detector, speedup)

        def run():
            try:
                self.controller.run()
            finally:
                logger.close()
                shutdown(self.components)

        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()


session = None


@asynccontextmanager
async def lifespan(_app):
    global session
    hub.loop = asyncio.get_running_loop()
    session = await asyncio.to_thread(SimSession)
    hub.plan = session.preview
    print("\n  Ground Control Station ready ->  http://localhost:8000\n")
    yield
    if session.controller and session.running:
        session.controller.abort()


app = FastAPI(title="Weed Drone GCS", lifespan=lifespan)
# the Next.js dashboard (localhost:3000) may also call the API directly
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])


# ================================================================ routes
app.mount("/drone_data", StaticFiles(directory=ROOT / "drone_data"), name="drone_data")
(ROOT / "results").mkdir(exist_ok=True)
app.mount("/results", StaticFiles(directory=ROOT / "results"), name="results")


@app.get("/api/status")
async def status():
    c = session.controller if session else None
    return {"running": bool(session and session.running), "state": c.state if c else "IDLE"}


@app.post("/api/mission/start")
async def mission_start(options: dict | None = None):
    try:
        session.start(options or {})
    except RuntimeError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=409)
    return {"ok": True}


def _controller_action(name, *args):
    c = session.controller
    if not (c and session.running):
        return JSONResponse({"ok": False, "error": "No mission running"}, status_code=409)
    getattr(c, name)(*args)
    return {"ok": True}


@app.post("/api/mission/pause")
async def mission_pause():
    return _controller_action("pause")


@app.post("/api/mission/resume")
async def mission_resume():
    return _controller_action("resume")


@app.post("/api/mission/abort")
async def mission_abort():
    return _controller_action("abort")


@app.post("/api/spray")
async def spray(body: dict):
    return _controller_action("set_spray_enabled", bool(body.get("enabled", True)))


@app.post("/api/speedup")
async def speedup(body: dict):
    c = session.controller
    if c and hasattr(c.clock, "speedup"):
        c.clock.speedup = float(body.get("value", 4))
    return {"ok": True}


@app.get("/api/weedmap.geojson")
async def weedmap_geojson():
    c = session.controller
    return JSONResponse(c.weed_map.to_geojson() if c else {"type": "FeatureCollection", "features": []})


@app.get("/api/weedmap.csv")
async def weedmap_csv():
    c = session.controller
    if not c:
        return PlainTextResponse("no mission yet", status_code=404)
    path = c.weed_map.to_csv(ROOT / "logs" / "weed_map.csv")
    return FileResponse(path, filename="weed_map.csv")


# ======================================================= dashboard API
# Used by the Next.js dashboard (dashboard/), which proxies /backend/* here.
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp"}


def _sorted_images(folder):
    return sorted((p for p in folder.glob("*") if p.suffix.lower() in IMAGE_EXT),
                  key=lambda p: (len(p.stem), p.stem))


@app.get("/api/info")
async def info():
    cfg = session.cfg
    d = session.detector
    return {
        "classes": list(d.model.names.values()),
        "model_path": cfg["detector"]["model_path"],
        "confidence": cfg["detector"]["confidence"],
        "image_size": cfg["detector"]["image_size"],
        "camera": {k: cfg["camera"][k] for k in ("hfov_deg", "vfov_deg", "resolution")},
        "mission": {k: cfg["mission"][k] for k in ("survey_altitude_m", "spray_altitude_m", "speed_m_s",
                                                   "strategy")},
        "mission_running": session.running,
    }


@app.get("/api/samples")
async def samples():
    out = []
    for p in _sorted_images(ROOT / "drone_data" / "images"):
        img = cv2.imread(str(p))
        out.append({"name": p.name, "url": f"/drone_data/images/{p.name}",
                    "width": img.shape[1], "height": img.shape[0]})
    return out


@app.post("/api/detect")
async def detect(request: Request, conf: float = 0.25, sample: str | None = None):
    """Body = raw image bytes (upload) or ?sample=image1.jpg."""
    if sample:
        path = ROOT / "drone_data" / "images" / Path(sample).name
        if not path.exists():
            return JSONResponse({"error": "unknown sample"}, status_code=404)
        frame = cv2.imread(str(path))
    else:
        data = await request.body()
        frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) if data else None
    if frame is None:
        return JSONResponse({"error": "could not decode image"}, status_code=400)
    conf = min(max(conf, 0.01), 0.99)
    dets, ms = await asyncio.to_thread(session.detector.detect_with, frame, conf)
    h, w = frame.shape[:2]
    return {"width": w, "height": h, "inference_ms": round(ms, 1), "confidence": conf,
            "detections": [d.to_dict() for d in dets],
            "weeds": sum(session.detector.is_weed(d) for d in dets),
            "crops": sum(session.detector.is_crop(d) for d in dets)}


@app.get("/api/batch")
async def batch():
    path = ROOT / "results" / "detections.csv"
    if not path.exists():
        return {"available": False, "rows": [], "images": []}
    with path.open(encoding="utf-8") as f:
        rows = [{**r, "confidence": float(r["confidence"]),
                 **{k: float(r[k]) for k in ("x1", "y1", "x2", "y2")}} for r in csv.DictReader(f)]
    annotated = ROOT / "results" / "annotated"
    images = [{"name": p.name, "annotated": f"/results/annotated/{p.name}",
               "original": f"/drone_data/images/{p.name}"}
              for p in _sorted_images(annotated)] if annotated.exists() else []
    return {"available": True, "rows": rows, "images": images}


def _read_flight(path):
    summary, plan, started = None, None, None
    with path.open(encoding="utf-8") as f:
        for line in f:
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ev.get("type") == "plan":
                plan = {k: ev.get(k) for k in ("field", "waypoints", "home", "altitude", "area_m2")}
            elif ev.get("type") == "mission" and ev.get("summary"):
                summary = ev["summary"]
    return {"file": path.name, "summary": summary, "plan": plan}


@app.get("/api/flights")
async def flights():
    logs = sorted((ROOT / "logs").glob("flight_*.jsonl"), reverse=True)
    return [f for f in (_read_flight(p) for p in logs[:20]) if f["summary"]]


@app.get("/api/flights/{name}")
async def flight_detail(name: str):
    path = ROOT / "logs" / Path(name).name
    if not path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    flight = _read_flight(path)
    weeds = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            ev = json.loads(line)
            if ev.get("type") == "detections":
                for b in ev["boxes"]:
                    weeds[b["id"]] = {"id": b["id"], "cls": b["class_name"], "conf": b["confidence"],
                                      "x": b["gx"], "y": b["gy"], "lat": b["lat"], "lon": b["lon"],
                                      "size": b["size_m"], "sprayed": weeds.get(b["id"], {}).get("sprayed", False)}
            elif ev.get("type") == "spray":
                for i in ev["weed_ids"]:
                    if i in weeds:
                        weeds[i]["sprayed"] = True
    flight["items"] = list(weeds.values())
    return flight


# ============================================================= websockets
@app.websocket("/ws")
async def ws_viewer(ws: WebSocket):
    await ws.accept()
    q = asyncio.Queue()
    await ws.send_text(json.dumps({"type": "hello", "source": "sim-server",
                                   "running": bool(session and session.running)}))
    for ev in hub.snapshot():
        await ws.send_text(json.dumps(ev))
    await ws.send_text(json.dumps({"type": "snapshot_end"}))   # history replay done
    hub.viewers.add(q)
    try:
        while True:
            ev = await q.get()
            await ws.send_text(json.dumps(ev))
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.viewers.discard(q)


@app.websocket("/ws/drone")
async def ws_drone(ws: WebSocket):
    """Ingest from the real aircraft (drone/telemetry.py WebSocketPublisher)."""
    await ws.accept()
    hub._publish({"type": "log", "level": "info", "msg": "Hardware drone connected", "t": 0})
    hub._publish({"type": "link", "source": "hardware", "connected": True})
    try:
        while True:
            event = json.loads(await ws.receive_text())
            if event.get("type") == "mission" and event.get("state") == "started":
                hub.reset()
            hub._publish(event)
    except WebSocketDisconnect:
        hub._publish({"type": "link", "source": "hardware", "connected": False})
        hub._publish({"type": "log", "level": "warn", "msg": "Hardware drone link lost", "t": 0})


# the web page itself (mounted last so the API / websocket routes win)
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
