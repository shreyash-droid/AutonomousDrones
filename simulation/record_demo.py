"""Record a full simulated mission for the offline web demo.

    python simulation/record_demo.py

Runs the real mission code + YOLO11 once and saves every event to
simulation/web/data/demo_recording.js. The web GCS replays this file when it
is opened without the server (double-click index.html), so the demo works on
any laptop - even without Python installed.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from drone.config import load_config
from drone.main import build_system, shutdown
from drone.sim_world import SimWorld
from drone.telemetry import CallbackPublisher, ConsolePublisher, MultiPublisher

OUT = Path(__file__).resolve().parent / "web" / "data" / "demo_recording.js"
SPEEDUP = 8
RATE_HZ = 20          # real-time rate -> one sample every 0.4 s of mission time


def main():
    cfg = load_config(overrides={"mode": "sim", "telemetry": {"rate_hz": RATE_HZ}})
    events = []
    pub = MultiPublisher(CallbackPublisher(events.append), ConsolePublisher())
    controller, components = build_system(cfg, "sim", pub, speedup=SPEEDUP)
    try:
        summary = controller.run()
    finally:
        shutdown(components)

    # geotags of the survey images (what the camera would write to EXIF)
    SimWorld(cfg).write_metadata(ROOT / "drone_data" / "metadata" / "image_geotags.csv",
                                 cfg["mission"]["survey_altitude_m"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"recorded": datetime.now().isoformat(timespec="seconds"),
               "summary": summary, "events": events}
    OUT.write_text("window.DEMO_RECORDING = " + json.dumps(payload, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"\nSaved {len(events)} events -> {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
