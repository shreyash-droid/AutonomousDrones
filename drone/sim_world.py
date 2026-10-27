"""Virtual farm field for simulation.

The real drone images in drone_data/images are laid out as a grid of
"tiles" on the ground. Whatever tile is under the simulated drone is what the
simulated camera "sees", so the real YOLO model runs on real field imagery.
"""

import csv
import math
from pathlib import Path

from drone import geo
from drone.config import resolve_path

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp"}


class SimWorld:
    def __init__(self, cfg):
        sim = cfg["sim"]
        self.home_lat = cfg["mission"]["home"]["lat"]
        self.home_lon = cfg["mission"]["home"]["lon"]
        self.cols, self.rows = sim["grid"]
        self.tile_size = float(sim["tile_size_m"])
        tiles_dir = resolve_path(sim["tiles_dir"])
        images = sorted(
            (p for p in tiles_dir.iterdir() if p.suffix.lower() in IMAGE_EXT),
            key=lambda p: (len(p.stem), p.stem),   # image1, image2 ... image10
        )
        if not images:
            raise FileNotFoundError(f"No tile images in {tiles_dir}")
        self.tiles = []
        for r in range(self.rows):
            for c in range(self.cols):
                idx = r * self.cols + c
                img = images[idx % len(images)]
                x0, y0 = c * self.tile_size, r * self.tile_size
                self.tiles.append({
                    "id": idx,
                    "row": r,
                    "col": c,
                    "path": img,
                    "url": "/drone_data/images/" + img.name,
                    "x0": x0, "y0": y0,
                    "x1": x0 + self.tile_size, "y1": y0 + self.tile_size,
                })

    @property
    def width(self):
        return self.cols * self.tile_size

    @property
    def height(self):
        return self.rows * self.tile_size

    def field_polygon(self):
        return [(0, 0), (self.width, 0), (self.width, self.height), (0, self.height)]

    def tile_at(self, x, y):
        if not (0 <= x < self.width and 0 <= y < self.height):
            return None
        c = int(x // self.tile_size)
        r = int(y // self.tile_size)
        return self.tiles[r * self.cols + c]

    def camera_fov_deg(self, altitude_m):
        """FOV that makes one tile exactly fill the frame at this altitude."""
        return math.degrees(2 * math.atan(self.tile_size / 2 / max(altitude_m, 0.1)))

    def describe(self):
        """JSON-serialisable description sent to the web GCS."""
        return {
            "width": self.width,
            "height": self.height,
            "tile_size": self.tile_size,
            "tiles": [{k: t[k] for k in ("id", "row", "col", "url", "x0", "y0", "x1", "y1")}
                      for t in self.tiles],
        }

    def write_metadata(self, path, altitude_m):
        """Write the image geotags (what a real camera would store in EXIF)."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["image_name", "tile_row", "tile_col", "center_lat", "center_lon",
                        "altitude_m", "heading_deg", "footprint_m"])
            for t in self.tiles:
                cx, cy = (t["x0"] + t["x1"]) / 2, (t["y0"] + t["y1"]) / 2
                lat, lon = geo.offset_to_latlon(self.home_lat, self.home_lon, cx, cy)
                w.writerow([t["path"].name, t["row"], t["col"], f"{lat:.7f}", f"{lon:.7f}",
                            altitude_m, 0, self.tile_size])
