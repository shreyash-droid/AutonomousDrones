"""Copy a few drone images + their YOLO11 detections into public/ so the
landing page can show real AI results without the Python backend running.

    python dashboard/scripts/build_showcase.py
"""

import csv
import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "dashboard" / "public" / "showcase"
PICK = ["image1.jpg", "image9.jpg", "image3.jpg"]

OUT.mkdir(parents=True, exist_ok=True)
rows = list(csv.DictReader((ROOT / "results" / "detections.csv").open(encoding="utf-8")))
items = []
for name in PICK:
    src = ROOT / "drone_data" / "images" / name
    shutil.copy(src, OUT / name)
    w, h = Image.open(src).size
    boxes = [{"cls": r["class_name"], "conf": float(r["confidence"]),
              "x1": float(r["x1"]), "y1": float(r["y1"]), "x2": float(r["x2"]), "y2": float(r["y2"])}
             for r in rows if r["image_name"] == name]
    items.append({"name": name, "url": f"/showcase/{name}", "width": w, "height": h, "boxes": boxes})

stats = {"images": len({r["image_name"] for r in rows}),
         "weeds": sum(r["class_name"] == "weed" for r in rows),
         "crops": sum(r["class_name"] != "weed" for r in rows)}
(OUT / "showcase.json").write_text(json.dumps({"stats": stats, "items": items}, indent=1), encoding="utf-8")
print(f"wrote {len(items)} showcase images, stats {stats}")
