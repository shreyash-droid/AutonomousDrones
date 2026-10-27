"""Geo-referenced weed map built during the flight.

Detections from overlapping photos are merged (same weed seen twice), each
weed keeps its GPS position and whether it has been sprayed. The map is
exported as CSV, GeoJSON (QGIS / Google Earth / geojson.io) and KML.
"""

import csv
import json
import math
import threading
from pathlib import Path


class WeedMap:
    def __init__(self, merge_radius_m=0.25):
        self.merge_radius = merge_radius_m
        self.items = []            # dicts: id, cls, conf, x, y, lat, lon, sprayed, tile
        self._next_id = 1
        self._lock = threading.Lock()

    def add(self, cls, conf, x, y, lat, lon, tile=None, size_m=0.0):
        with self._lock:
            for it in self.items:
                if it["cls"] == cls and math.hypot(it["x"] - x, it["y"] - y) < self.merge_radius:
                    if conf > it["conf"]:
                        it.update(conf=conf, x=x, y=y, lat=lat, lon=lon)
                    it["seen"] += 1
                    return it, False
            it = {"id": self._next_id, "cls": cls, "conf": round(conf, 4),
                  "x": round(x, 3), "y": round(y, 3), "lat": lat, "lon": lon,
                  "size_m": round(size_m, 3), "tile": tile, "sprayed": False, "seen": 1}
            self._next_id += 1
            self.items.append(it)
            return it, True

    def of_class(self, cls):
        return [i for i in self.items if i["cls"] == cls]

    def mark_sprayed(self, ids):
        with self._lock:
            for it in self.items:
                if it["id"] in ids:
                    it["sprayed"] = True

    def summary(self, weed_cls="weed"):
        weeds = self.of_class(weed_cls)
        return {
            "weeds": len(weeds),
            "crops": sum(1 for i in self.items if i["cls"] != weed_cls),   # crop + panicle
            "weeds_sprayed": sum(1 for w in weeds if w["sprayed"]),
        }

    # ---------------------------------------------------------- exports
    def to_csv(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["id", "class", "confidence", "lat", "lon", "east_m", "north_m",
                        "size_m", "sprayed", "times_seen"])
            for it in self.items:
                w.writerow([it["id"], it["cls"], it["conf"], f"{it['lat']:.8f}", f"{it['lon']:.8f}",
                            it["x"], it["y"], it["size_m"], int(it["sprayed"]), it["seen"]])
        return path

    def to_geojson(self):
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [it["lon"], it["lat"]]},
                "properties": {"id": it["id"], "class": it["cls"], "confidence": it["conf"],
                               "sprayed": it["sprayed"],
                               "marker-color": "#d32f2f" if it["cls"] == "weed" else "#2e7d32"},
            } for it in self.items],
        }

    def save_geojson(self, path):
        Path(path).write_text(json.dumps(self.to_geojson(), indent=1), encoding="utf-8")
        return path

    def save_kml(self, path):
        marks = []
        for it in self.items:
            style = "#weed" if it["cls"] == "weed" else "#crop"
            marks.append(
                f"<Placemark><name>{it['cls']} {it['id']}</name><styleUrl>{style}</styleUrl>"
                f"<description>conf {it['conf']:.2f} sprayed {it['sprayed']}</description>"
                f"<Point><coordinates>{it['lon']:.8f},{it['lat']:.8f},0</coordinates></Point></Placemark>")
        kml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Weed map</name>'
               '<Style id="weed"><IconStyle><color>ff2f2fd3</color></IconStyle></Style>'
               '<Style id="crop"><IconStyle><color>ff327d2e</color></IconStyle></Style>'
               + "".join(marks) + "</Document></kml>")
        Path(path).write_text(kml, encoding="utf-8")
        return path
